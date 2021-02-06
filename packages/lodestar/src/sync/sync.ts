import PeerId from "peer-id";
import {AbortController} from "abort-controller";
import {IBeaconSync, ISyncModules} from "./interface";
import {ISyncOptions} from "./options";
import {INetwork} from "../network";
import {ILogger} from "@chainsafe/lodestar-utils";
import {CommitteeIndex, Slot, Status, SyncingStatus} from "@chainsafe/lodestar-types";
import {BeaconGossipHandler, IGossipHandler} from "./gossip";
import {ChainEvent, IBeaconChain} from "../chain";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {toHexString} from "@chainsafe/ssz";
import {BlockError, BlockErrorCode} from "../chain/errors";
import {RangeSync, RangeSyncStatus} from "./range/range";
import {AttestationCollector} from "./utils";
import {fetchUnknownBlockRoot} from "./utils/unknownRoot";
import {PeerManagerEvent} from "../network/peers/peerManager";
import {getPeerSyncType, PeerSyncType} from "./utils/remoteSyncType";
import {SLOT_IMPORT_TOLERANCE} from "./constants";
import {SyncState} from "./interface";

export class BeaconSync implements IBeaconSync {
  private readonly opts: ISyncOptions;
  private readonly config: IBeaconConfig;
  private readonly logger: ILogger;
  private readonly network: INetwork;
  private readonly chain: IBeaconChain;

  private prevState: SyncState = SyncState.Stalled;
  private rangeSync: RangeSync;
  private gossip: IGossipHandler;
  private attestationCollector: AttestationCollector;

  // avoid finding same root at the same time
  private processingRoots: Set<string>;

  private controller = new AbortController();

  constructor(opts: ISyncOptions, modules: ISyncModules) {
    this.opts = opts;
    this.config = modules.config;
    this.network = modules.network;
    this.chain = modules.chain;
    this.logger = modules.logger;
    this.rangeSync = new RangeSync(modules, this.controller.signal);
    this.gossip =
      modules.gossipHandler || new BeaconGossipHandler(modules.chain, modules.network, modules.db, this.logger);
    this.attestationCollector = modules.attestationCollector || new AttestationCollector(modules.config, modules);
    this.processingRoots = new Set();
  }

  // TODO: Log peer count every interval, currently it was done every 3 * SECONDS_PER_SLOT * 1000
  //   activePeers: this.network.getPeers().length,
  //   syncPeers: getSyncPeers2(this.network).length,
  //   unknownRootPeers: getUnknownRootPeers(this.network).length,
  public async start(): Promise<void> {
    this.network.peerManager.on(PeerManagerEvent.peerConnected, this.addPeer);
    this.network.peerManager.on(PeerManagerEvent.peerDisconnected, this.removePeer);

    this.attestationCollector.start();
  }

  public close(): void {
    this.network.peerManager.off(PeerManagerEvent.peerConnected, this.addPeer);
    this.network.peerManager.off(PeerManagerEvent.peerDisconnected, this.removePeer);

    this.controller.abort();

    this.chain.emitter.off(ChainEvent.errorBlock, this.onUnknownBlockRoot);
    this.attestationCollector.stop();
    this.gossip.stop();
  }

  public getSyncStatus(): SyncingStatus {
    const currentSlot = this.chain.clock.currentSlot;
    const headSlot = this.chain.forkChoice.getHead().slot;
    switch (this.state) {
      case SyncState.SyncingFinalized:
      case SyncState.SyncingHead:
      case SyncState.Stalled:
        return {
          headSlot: BigInt(headSlot),
          syncDistance: BigInt(currentSlot - headSlot),
        };
      case SyncState.Synced:
        return {
          headSlot: BigInt(headSlot),
          syncDistance: BigInt(0),
        };
      default:
        throw new Error("Node is stopped, cannot get sync status");
    }
  }

  public isSyncing(): boolean {
    const state = this.state; // Don't run the getter twice
    return state === SyncState.SyncingFinalized || state === SyncState.SyncingHead;
  }

  public isSynced(): boolean {
    return this.state === SyncState.Synced;
  }

  get state(): SyncState {
    const currentSlot = this.chain.clock.currentSlot;
    const headSlot = this.chain.forkChoice.getHead().slot;
    if (currentSlot >= headSlot && headSlot >= currentSlot - SLOT_IMPORT_TOLERANCE && headSlot > 0) {
      return SyncState.Synced;
    }

    const rangeSyncState = this.rangeSync.state;
    switch (rangeSyncState.status) {
      case RangeSyncStatus.Finalized:
        return SyncState.SyncingFinalized;
      case RangeSyncStatus.Head:
        return SyncState.SyncingHead;
      case RangeSyncStatus.Idle:
        return SyncState.Stalled;
    }
  }

  public async collectAttestations(slot: Slot, committeeIndex: CommitteeIndex): Promise<void> {
    if (!(this.state === SyncState.SyncingHead || this.state === SyncState.Synced)) {
      throw new Error("Cannot collect attestations before regular sync");
    }
    await this.attestationCollector.subscribeToCommitteeAttestations(slot, committeeIndex);
  }

  /**
   * A peer has connected which has blocks that are unknown to us.
   *
   * This function handles the logic associated with the connection of a new peer. If the peer
   * is sufficiently ahead of our current head, a range-sync (batch) sync is started and
   * batches of blocks are queued to download from the peer. Batched blocks begin at our latest
   * finalized head.
   *
   * If the peer is within the `SLOT_IMPORT_TOLERANCE`, then it's head is sufficiently close to
   * ours that we consider it fully sync'd with respect to our current chain.
   */
  private addPeer = async (peerId: PeerId, peerStatus: Status): Promise<void> => {
    const localStatus = await this.chain.getStatus();
    const syncType = getPeerSyncType(localStatus, peerStatus, this.chain);

    if (syncType === PeerSyncType.Advanced) {
      // TODO: Consider that the peer may not be connected anymore at this point
      // This is a potential race condition
      this.rangeSync.addPeer(peerId, localStatus, peerStatus);
      this.updateSyncState();
    }
  };

  /**
   * Lighthouse SyncMessage::Disconnect
   * Must be called by libp2p when a peer is removed from the peer manager
   */
  private removePeer = (peerId: PeerId): void => {
    this.rangeSync.removePeer(peerId);
    this.updateSyncState();
  };

  private updateSyncState(): void {
    const prevState = this.prevState;
    const currentState = this.state;
    this.prevState = currentState;

    // TODO
    // If we have become synced - Subscribe to all the core subnet topics
    if (prevState !== SyncState.Synced && currentState === SyncState.Synced) {
      this.network.subscribeCoreTopics();

      // ONLY after completing initial sync
      this.chain.emitter.on(ChainEvent.errorBlock, this.onUnknownBlockRoot);
      void this.gossip.start();

      // ONLY after completing regular sync
      this.gossip.handleSyncCompleted();
    }
  }

  private onUnknownBlockRoot = async (err: BlockError): Promise<void> => {
    if (err.type.code !== BlockErrorCode.PARENT_UNKNOWN) {
      return;
    }

    const blockRoot = this.config.types.BeaconBlock.hashTreeRoot(err.job.signedBlock.message);
    const unknownAncestorRoot = this.chain.pendingBlocks.getMissingAncestor(blockRoot);
    const unknownAncestorRootHex = toHexString(unknownAncestorRoot);

    if (this.processingRoots.has(unknownAncestorRootHex)) {
      return;
    }

    this.processingRoots.add(unknownAncestorRootHex);
    this.logger.verbose("Finding block for unknown ancestor root", {blockRoot: unknownAncestorRootHex});

    try {
      const block = await fetchUnknownBlockRoot(unknownAncestorRoot, this.network);
      await this.chain.receiveBlock(block);
      this.processingRoots.delete(unknownAncestorRootHex);
      this.logger.verbose("Found UnknownBlockRoot", {unknownAncestorRootHex});
    } catch (e) {
      this.logger.verbose("Error fetching UnknownBlockRoot", {unknownAncestorRootHex, error: e.message});
    }
  };
}
