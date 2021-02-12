import PeerId from "peer-id";
import {BeaconBlocksByRangeRequest, Epoch, Root, SignedBeaconBlock, Slot} from "@chainsafe/lodestar-types";
import {computeStartSlotAtEpoch} from "@chainsafe/lodestar-beacon-state-transition";
import {ErrorAborted, ILogger} from "@chainsafe/lodestar-utils";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {toHexString} from "@chainsafe/ssz";
import {PeerAction} from "../../network";
import {ChainSegmentError} from "../../chain/errors";
import {ItTrigger} from "../../util/itTrigger";
import {byteArrayEquals} from "../../util/bytes";
import {RangeSyncType} from "../utils/remoteSyncType";
import {ChainPeersBalancer} from "./utils/peerBalancer";
import {PeerSet} from "./utils/peerMap";
import {wrapError} from "./utils/wrapError";
import {Batch, BatchError, BatchErrorCode, BatchMetadata, BatchOpts, BatchStatus, BATCH_SLOT_OFFSET} from "./batch";
import {
  validateBatchesStatus,
  getNextBatchToProcess,
  toBeProcessedStartEpoch,
  toBeDownloadedStartEpoch,
  toArr,
} from "./utils/batches";

export type SyncChainOpts = BatchOpts;

/**
 * Should return if ALL blocks are processed successfully
 * If SOME blocks are processed must throw BlockProcessorError()
 */
export type ProcessChainSegment = (blocks: SignedBeaconBlock[]) => Promise<void>;

export type DownloadBeaconBlocksByRange = (
  peer: PeerId,
  request: BeaconBlocksByRangeRequest
) => Promise<SignedBeaconBlock[]>;

export type ReportPeerFn = (peer: PeerId, action: PeerAction, actionName: string) => void;

/**
 * Sync this up to this target. Uses slot instead of epoch to re-use logic for finalized sync
 * and head sync. The root is used to uniquely identify this chain on different forks
 */
export type ChainTarget = {
  slot: Slot;
  root: Root;
};

/**
 * Blocks are downloaded in batches from peers. This constant specifies how many epochs worth of
 * blocks per batch are requested _at most_. A batch may request less blocks to account for
 * already requested slots. There is a timeout for each batch request. If this value is too high,
 * we will negatively report peers with poor bandwidth. This can be set arbitrarily high, in which
 * case the responder will fill the response up to the max request size, assuming they have the
 * bandwidth to do so.
 */
const EPOCHS_PER_BATCH = 2;

/**
 * The maximum number of batches to queue before requesting more.
 */
// TODO: When switching branches usually all batches in AwaitingProcessing are dropped, could it be optimized?
const BATCH_BUFFER_SIZE = 5;

enum SyncState {
  Stopped = "Stopped",
  Syncing = "Syncing",
  Synced = "Synced",
  Error = "Error",
}

export class SyncChain {
  state = SyncState.Stopped;
  /** The start of the chain segment. Any epoch previous to this one has been validated. */
  startEpoch: Epoch;
  /** Should sync up until this slot, then stop */
  target: ChainTarget;
  syncType: RangeSyncType;
  /** Short string id to identify this SyncChain in logs */
  id: string;
  /** Number of validated epochs. For the SyncRange to prevent switching chains too fast */
  validatedEpochs = 0;
  private processChainSegment: ProcessChainSegment;
  private downloadBeaconBlocksByRange: DownloadBeaconBlocksByRange;
  private reportPeer: ReportPeerFn;
  /** AsyncIterable that guarantees processChainSegment is run only at once at anytime */
  private batchProcessor = new ItTrigger();
  /** Sorted map of batches undergoing some kind of processing. */
  private batches = new Map<Epoch, Batch>();
  private peerset = new PeerSet();

  private logger: ILogger;
  private config: IBeaconConfig;
  private opts: SyncChainOpts;

  constructor(
    startEpoch: Epoch,
    target: ChainTarget,
    syncType: RangeSyncType,
    processChainSegment: ProcessChainSegment,
    downloadBeaconBlocksByRange: DownloadBeaconBlocksByRange,
    reportPeer: ReportPeerFn,
    config: IBeaconConfig,
    logger: ILogger,
    opts?: SyncChainOpts
  ) {
    this.startEpoch = startEpoch;
    this.target = target;
    this.syncType = syncType;
    this.processChainSegment = processChainSegment;
    this.downloadBeaconBlocksByRange = downloadBeaconBlocksByRange;
    this.reportPeer = reportPeer;
    this.config = config;
    this.logger = logger;
    this.opts = {epochsPerBatch: opts?.epochsPerBatch ?? EPOCHS_PER_BATCH};
    this.id = `${syncType}-${target.slot}-${toHexString(target.root).slice(0, 6)}`;
  }

  /**
   * Start syncing a new chain or an old one with an existing peer list
   * In the same call, advance the chain if localFinalizedEpoch >
   */
  async startSyncing(localFinalizedEpoch: Epoch): Promise<void> {
    if (this.state !== SyncState.Stopped) {
      throw Error(`Attempting to start a SyncChain with state ${this.state}`);
    }

    // to avoid dropping local progress, we advance the chain with its batch boundaries.
    // get the aligned epoch that produces a batch containing the `localFinalizedEpoch`
    const localFinalizedEpochAligned =
      this.startEpoch + Math.floor((localFinalizedEpoch - this.startEpoch) / EPOCHS_PER_BATCH) * EPOCHS_PER_BATCH;
    this.advanceChain(localFinalizedEpochAligned);

    try {
      this.state = SyncState.Syncing;
      await this.sync();
      this.state = SyncState.Synced;
    } catch (e) {
      this.state = SyncState.Error;

      // A batch could not be processed after max retry limit. It's likely that all peers
      // in this chain are sending invalid batches repeatedly so are either malicious or faulty.
      // We drop the chain and report all peers.
      // There are some edge cases with forks that could cause this situation, but it's unlikely.
      if (e instanceof BatchError && e.type.code === BatchErrorCode.MAX_PROCESSING_ATTEMPTS) {
        for (const peer of this.peerset.values()) {
          this.reportPeer(peer, PeerAction.LowToleranceError, "SyncChainMaxProcessingAttempts");
        }
      }

      // TODO: Should peers be reported for MAX_DOWNLOAD_ATTEMPTS?

      throw e;
    }
  }

  /**
   * Temporarily stop the chain. Will prevent batches from being processed
   */
  stopSyncing(): void {
    this.state = SyncState.Stopped;
  }

  /**
   * Permanently remove this chain. Throws the main AsyncIterable
   */
  remove(): void {
    this.batchProcessor.end(new ErrorAborted("SyncChain"));
  }

  /**
   * Add peer to the chain and request batches if active
   */
  addPeer(peerId: PeerId): void {
    if (!this.peerset.has(peerId)) {
      this.peerset.add(peerId);
      this.triggerBatchDownloader();
    }
  }

  /**
   * Returns true if the peer existed and has been removed
   */
  removePeer(peerId: PeerId): boolean {
    // TODO: What to do when peer count is zero?
    return this.peerset.delete(peerId);
  }

  getMetadata(): ChainTarget {
    return this.target;
  }

  /**
   * Helper to print internal state for debugging when chain gets stuck
   */
  getBatchesState(): BatchMetadata[] {
    return toArr(this.batches).map((batch) => batch.getMetadata());
  }

  get isSyncing(): boolean {
    return this.state === SyncState.Syncing;
  }

  get isRemovable(): boolean {
    return this.state === SyncState.Error || this.state === SyncState.Synced;
  }

  get peers(): number {
    return this.peerset.size;
  }

  getPeers(): PeerId[] {
    return this.peerset.values();
  }

  /**
   * Main Promise that handles the sync process. Will resolve when initial sync completes
   * i.e. when it successfully processes a epoch >= than this chain `targetEpoch`
   */
  private async sync(): Promise<void> {
    this.triggerBatchDownloader();
    this.triggerBatchProcessor();

    // Start processing batches on demand in strict sequence
    for await (const _ of this.batchProcessor) {
      if (this.state !== SyncState.Syncing) {
        continue;
      }

      // TODO: Consider running this check less often after the sync is well tested
      validateBatchesStatus(toArr(this.batches));

      // If startEpoch of the next batch to be processed > targetEpoch -> Done
      const toBeProcessedEpoch = toBeProcessedStartEpoch(toArr(this.batches), this.startEpoch, this.opts);
      if (computeStartSlotAtEpoch(this.config, toBeProcessedEpoch) >= this.target.slot) {
        break;
      }

      // Processes the next batch if ready
      const batch = getNextBatchToProcess(toArr(this.batches));
      if (batch) await this.processBatch(batch);
    }
  }

  /**
   * Request to process batches if possible
   */
  private triggerBatchProcessor(): void {
    this.batchProcessor.trigger();
  }

  /**
   * Request to download batches if possible
   * Backlogs requests into a single pending request
   */
  private triggerBatchDownloader(): void {
    try {
      this.requestBatches(this.peerset.values());
    } catch (e) {
      // bubble the error up to the main async iterable loop
      void this.batchProcessor.throw(e);
    }
  }

  /**
   * Attempts to request the next required batches from the peer pool if the chain is syncing.
   * It will exhaust the peer pool and left over batches until the batch buffer is reached.
   */
  private requestBatches(peers: PeerId[]): void {
    if (this.state !== SyncState.Syncing) {
      return;
    }

    const peerBalancer = new ChainPeersBalancer(peers, toArr(this.batches));

    // Retry download of existing batches
    for (const batch of this.batches.values()) {
      if (batch.state.status !== BatchStatus.AwaitingDownload) {
        continue;
      }

      const peer = peerBalancer.bestPeerToRetryBatch(batch);
      if (peer) {
        void this.sendBatch(batch, peer);
      }
    }

    // find the next pending batch and request it from the peer
    for (const peer of peerBalancer.idlePeers()) {
      const batch = this.includeNextBatch();
      if (!batch) {
        break;
      }
      void this.sendBatch(batch, peer);
    }
  }

  /**
   * Creates the next required batch from the chain. If there are no more batches required, returns `null`.
   */
  private includeNextBatch(): Batch | null {
    const batches = toArr(this.batches);

    // Only request batches up to the buffer size limit
    // Note: Don't count batches in the AwaitingValidation state, to prevent stalling sync
    // if the current processing window is contained in a long range of skip slots.
    const batchesInBuffer = batches.filter((batch) => {
      return batch.state.status === BatchStatus.Downloading || batch.state.status === BatchStatus.AwaitingProcessing;
    });
    if (batchesInBuffer.length > BATCH_BUFFER_SIZE) {
      return null;
    }

    // This line decides the starting epoch of the next batch. MUST ensure no duplicate batch for the same startEpoch
    const startEpoch = toBeDownloadedStartEpoch(batches, this.startEpoch, this.opts);
    const toBeDownloadedSlot = computeStartSlotAtEpoch(this.config, startEpoch) + BATCH_SLOT_OFFSET;

    // Don't request batches beyond the target head slot
    if (toBeDownloadedSlot > this.target.slot) {
      return null;
    }

    if (this.batches.has(startEpoch)) {
      this.logger.error("Attempting to add existing Batch to SyncChain", {id: this.id, startEpoch});
      return null;
    }

    const batch = new Batch(startEpoch, this.config, this.opts);
    this.batches.set(startEpoch, batch);
    return batch;
  }

  /**
   * Requests the batch asigned to the given id from a given peer.
   */
  private async sendBatch(batch: Batch, peer: PeerId): Promise<void> {
    try {
      batch.startDownloading(peer);

      // wrapError ensures to never call both batch success() and batch error()
      const res = await wrapError(this.downloadBeaconBlocksByRange(peer, batch.request));

      if (!res.err) {
        batch.downloadingSuccess(res.result);
        this.triggerBatchProcessor();
      } else {
        this.logger.verbose("Batch download error", {id: this.id, ...batch.getMetadata()}, res.err);
        batch.downloadingError(); // Throws after MAX_DOWNLOAD_ATTEMPTS
      }

      // Pre-emptively request more blocks from peers whilst we process current blocks
      this.triggerBatchDownloader();
    } catch (e) {
      // bubble the error up to the main async iterable loop
      void this.batchProcessor.throw(e);
    }
  }

  /**
   * Sends `batch` to the processor. Note: batch may be empty
   */
  private async processBatch(batch: Batch): Promise<void> {
    const blocks = batch.startProcessing();

    // wrapError ensures to never call both batch success() and batch error()
    const res = await wrapError(this.processChainSegment(blocks));

    if (!res.err) {
      batch.processingSuccess();

      // If the processed batch is not empty, validate previous AwaitingValidation blocks.
      if (blocks.length > 0) {
        this.advanceChain(batch.startEpoch);
      }

      // Potentially process next AwaitingProcessing batch
      this.triggerBatchProcessor();
    } else {
      this.logger.verbose("Batch process error", {id: this.id, ...batch.getMetadata()}, res.err);
      batch.processingError(); // Throws after MAX_BATCH_PROCESSING_ATTEMPTS

      // At least one block was successfully verified and imported, so we can be sure all
      // previous batches are valid and we only need to download the current failed batch.
      if (res.err instanceof ChainSegmentError && res.err.importedBlocks > 0) {
        this.advanceChain(batch.startEpoch);
      }

      // The current batch could not be processed, so either this or previous batches are invalid.
      // All previous batches (AwaitingValidation) are potentially faulty and marked for retry.
      // Progress will be drop back to `this.startEpoch`
      for (const pendingBatch of this.batches.values()) {
        if (pendingBatch.startEpoch < batch.startEpoch) {
          this.logger.verbose("Batch validation error", {id: this.id, ...pendingBatch.getMetadata()});
          pendingBatch.validationError(); // Throws after MAX_BATCH_PROCESSING_ATTEMPTS
        }
      }
    }

    // A batch is no longer in Processing status, queue has an empty spot to download next batch
    this.triggerBatchDownloader();
  }

  /**
   * Drops any batches previous to `newStartEpoch` and updates the chain boundaries
   */
  private advanceChain(newStartEpoch: Epoch): void {
    // make sure this epoch produces an advancement
    if (newStartEpoch <= this.startEpoch) {
      return;
    }

    for (const [batchKey, batch] of this.batches.entries()) {
      if (batch.startEpoch < newStartEpoch) {
        this.batches.delete(batchKey);
        this.validatedEpochs += EPOCHS_PER_BATCH;

        // The last batch attempt is right, all others are wrong. Penalize other peers
        const attemptOk = batch.validationSuccess();
        for (const attempt of batch.failedProcessingAttempts) {
          if (!byteArrayEquals(attempt.hash, attemptOk.hash)) {
            if (attemptOk.peer.toB58String() === attempt.peer.toB58String()) {
              // The same peer corrected its previous attempt
              this.reportPeer(attempt.peer, PeerAction.MidToleranceError, "SyncChainInvalidBatchSelf");
            } else {
              // A different peer sent an bad batch
              this.reportPeer(attempt.peer, PeerAction.LowToleranceError, "SyncChainInvalidBatchOther");
            }
          }
        }
      }
    }

    this.startEpoch = newStartEpoch;
  }
}
