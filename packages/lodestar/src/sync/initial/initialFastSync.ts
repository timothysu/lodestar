/**
 * @module sync/initial
 */
import {EventEmitter} from "events";
import {AbortController} from "abort-controller";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {ILogger, sleep, withTimeout} from "@chainsafe/lodestar-utils";
import {Checkpoint, Slot} from "@chainsafe/lodestar-types";
import {computeStartSlotAtEpoch} from "@chainsafe/lodestar-beacon-state-transition";
import {ChainEvent, IBeaconChain} from "../../chain";
import {INetwork} from "../../network";
import {defaultSyncOptions, ISyncOptions} from "../options";
import {IInitialSyncModules, InitialSync, InitialSyncEventEmitter} from "./interface";
import {GENESIS_EPOCH} from "../../constants";
import {ISyncStats, SyncStats} from "../stats";
import {getPeersInitialSync} from "../utils/bestPeers";
import {assertLinearChainSegment} from "../utils/assertLinearChainSegment";
import {getBlockRange} from "../utils/getBlockRange";

// timeout for getBlockRange is 3 minutes
const GET_BLOCK_RANGE_TIMEOUT = 3 * 60 * 1000;
const TRUST_INITIAL_SYNC_BLOCKS = true;

export class FastSync extends (EventEmitter as {new (): InitialSyncEventEmitter}) implements InitialSync {
  private readonly opts: ISyncOptions;
  private readonly config: IBeaconConfig;
  private readonly chain: IBeaconChain;
  private readonly network: INetwork;
  private readonly logger: ILogger;
  private readonly stats: ISyncStats;
  private controller: AbortController;

  /**
   * Targeted finalized checkpoint. Initial sync should only sync up to that point.
   */
  private targetCheckpoint: Checkpoint | null = null;

  public constructor(opts: ISyncOptions, {config, chain, network, logger, db, stats}: IInitialSyncModules) {
    super();
    this.config = config;
    this.chain = chain;
    this.opts = opts;
    this.network = network;
    this.logger = logger;
    this.stats = stats || new SyncStats(this.chain.emitter);
    this.controller = new AbortController();
  }

  public async start(): Promise<void> {
    this.chain.emitter.on(ChainEvent.checkpoint, this.onCheckpoint);

    // head may not be on finalized chain so we start from finalized block
    // there are unfinalized blocks in db so we reprocess all of them
    const finalizedBlock = this.chain.forkChoice.getFinalizedBlock();

    // TODO: Wait for peers here, and merge this first condition in this.sync()
    // Main sync should make sure that there are some peers so `getPeersInitialSync` doesn't throw
    const checkpoint = getPeersInitialSync(this.network).checkpoint;
    if (isInitialSyncComplete(checkpoint, this.chain)) {
      this.logger.info("No peers with higher finalized epoch");
      return;
    }

    this.logger.info("Starting initial sync", {finalizedSlot: finalizedBlock.slot});

    // TODO: make SyncStats not require a timer, just record entries
    await this.stats.start();

    // Won't resolve until completing initial sync
    await this.sync(finalizedBlock.slot);
  }

  public async stop(): Promise<void> {
    this.logger.info("Stopping initial sync");
    await this.stats.stop();
    this.chain.emitter.removeListener(ChainEvent.checkpoint, this.onCheckpoint);
  }

  public getHighestBlock(): Slot {
    return this.targetCheckpoint ? computeStartSlotAtEpoch(this.config, this.targetCheckpoint.epoch) : 0;
  }

  /**
   * Main sync event loop. Resolves when initial sync completes:
   * - Peers most common finalized checkpoint <= node's finalized checkpoint
   */
  private async sync(fromSlot: number): Promise<void> {
    while (true) {
      try {
        // Fetch peers to sync from and their common checkpoint (= this round's target)
        const {checkpoint, peers} = getPeersInitialSync(this.network);
        this.targetCheckpoint = checkpoint;

        // Check if sync is complete and should stop
        if (isInitialSyncComplete(checkpoint, this.chain)) {
          this.logger.important(`Reach common finalized checkpoint at epoch ${checkpoint.epoch}`);
          await this.stop();
          return;
        }

        const slotRange = getNextSlotRange(this.config, fromSlot, checkpoint, this.opts);
        this.logger.info("Fetching blocks range", slotRange);

        const blocks = await withTimeout(
          async () => await getBlockRange(this.logger, this.network.reqResp, peers, slotRange),
          GET_BLOCK_RANGE_TIMEOUT,
          this.controller.signal
        );
        // TODO: Make sure blocks are sorted
        // `blocks = sortBlocks(blocks)`

        this.logger.info("Imported block range", {blocks: blocks.map((block) => block.message.slot).join(",")});

        // TODO: Current master still imports part of the chain segment if it's partially linear
        // TODO: Does this deal with consensus splits?
        assertLinearChainSegment(this.config, blocks);

        // Send blocks to chain and await validation + processing
        for (const block of blocks) {
          await this.chain.processBlockJob(block, TRUST_INITIAL_SYNC_BLOCKS);
          fromSlot = block.message.slot;
        }

        this.logger.verbose("Processed block range", {...slotRange, lastSlot: fromSlot});

        // TODO: How does this deals with long batches of skipped slots?
      } catch (e) {
        if (e instanceof NoPeersError) {
          this.logger.info(`Not enough peers ${e.peerCount}...`);
          await sleep(6000, this.controller.signal);
        }
        if (e instanceof NotLinearChainSegment) {
          this.logger.warn("Received block parent root doesn't match our head", {
            head: toHexString(headRoot),
            headSlot,
            blockParent: toHexString(block.parentRoot),
            blockSlot: block.slot,
          });
          // TODO: Make sure it triggers sync to retry to fetch this chunk again
        }
      }
    }
  }

  /**
   * Logs progress to console
   */
  private onCheckpoint = async (processedCheckpoint: Checkpoint): Promise<void> => {
    // Should not ever happen, but don't report if targetCheckpoint has not been set yet
    if (!this.targetCheckpoint) {
      return;
    }

    const estimate = this.stats.getEstimate(
      computeStartSlotAtEpoch(this.config, processedCheckpoint.epoch),
      computeStartSlotAtEpoch(this.config, this.targetCheckpoint.epoch)
    );
    this.logger.important("Sync progress", {
      currentEpoch: processedCheckpoint.epoch,
      targetEpoch: this.targetCheckpoint.epoch,
      speed: this.stats.getSyncSpeed().toFixed(1) + " slots/s",
      estimatedTillComplete: Math.round((estimate / 3600) * 10) / 10 + " hours",
    });

    if (processedCheckpoint.epoch >= this.targetCheckpoint.epoch) {
      // this doesn't work because finalized checkpoint root is first slot of that epoch as per ffg,
      // while our processed checkpoint has root of last slot of that epoch
      // if(!this.config.types.Root.equals(processedCheckpoint.root, this.targetCheckpoint.root)) {
      //   this.logger.error("Different finalized root. Something fishy is going on: "
      //   + `expected ${toHexString(this.targetCheckpoint.root)}, actual ${toHexString(processedCheckpoint.root)}`);
      //   throw new Error("Should delete chain and start again. Invalid blocks synced");
      // }
    }
  };
}

function isInitialSyncComplete(checkpoint: Checkpoint, chain: IBeaconChain): boolean {
  return checkpoint.epoch == GENESIS_EPOCH || checkpoint.epoch <= chain.forkChoice.getFinalizedCheckpoint().epoch;
}

function getNextSlotRange(
  config: IBeaconConfig,
  fromSlot: Slot,
  checkpoint: Checkpoint,
  options: ISyncOptions
): {
  start: Slot;
  end: Slot;
} {
  const finalizedTargetSlot = computeStartSlotAtEpoch(config, checkpoint.epoch);
  const maxSlotImport = options.maxSlotImport ?? defaultSyncOptions.maxSlotImport;

  const rangeEnd =
    fromSlot + maxSlotImport > finalizedTargetSlot
      ? // first slot of epoch is skip slot
        // TODO: What does the comment above mean??
        fromSlot + config.params.SLOTS_PER_EPOCH
      : fromSlot + maxSlotImport;

  return {start: fromSlot + 1, end: rangeEnd};
}
