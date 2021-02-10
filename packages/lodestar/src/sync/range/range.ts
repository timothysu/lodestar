import {computeEpochAtSlot, computeStartSlotAtEpoch} from "@chainsafe/lodestar-beacon-state-transition";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {Epoch, Slot, Status} from "@chainsafe/lodestar-types";
import {ErrorAborted, ILogger} from "@chainsafe/lodestar-utils";
import PeerId from "peer-id";
import {IBeaconChain} from "../../chain";
import {RangeSyncType, getRangeSyncType} from "../utils/remoteSyncType";
import {ChainTarget, DownloadBeaconBlocksByRange, ProcessChainSegment, SyncChain, SyncChainOpts} from "./chain";
import {AbortSignal} from "abort-controller";
import {Json, toHexString} from "@chainsafe/ssz";
import {updateChains} from "./utils/updateChains";
import {shouldRemoveChain} from "./utils/shouldRemoveChain";
import {INetwork, PeerAction} from "../../network";
import {assertSequentialBlocksInRange} from "../utils";

/**
 * RangeSync groups peers by their `status` into static target `SyncChain` instances
 * Peers on each chain will be queried for batches until reaching their target.
 *
 * Not all SyncChain-s will sync at once, and are grouped by sync type:
 * - Finalized Chain Sync
 * - Head Chain Sync
 *
 * ### Finalized Chain Sync
 *
 * At least one peer's status finalized checkpoint is greater than ours. Then we'll form
 * a chain starting from our finalized epoch and sync up to their finalized checkpoint.
 * - Only one finalized chain can sync at a time
 * - The finalized chain with the largest peer pool takes priority
 * - As peers' status progresses we will switch to a SyncChain with a better target
 *
 * ### Head Chain Sync
 *
 * If no Finalized Chain Sync is active, and the peer's STATUS head is beyond
 * `SLOT_IMPORT_TOLERANCE`, then we'll form a chain starting from our finalized epoch and sync
 * up to their head.
 * - More than one head chain can sync in parallel
 * - If there are many head chains the ones with more peers take priority
 */
export enum RangeSyncStatus {
  /** A finalized chain is being synced */
  Finalized,
  /** There are no finalized chains and we are syncing one more head chains */
  Head,
  /** There are no head or finalized chains and no long range sync is in progress */
  Idle,
}

type SyncChainId = string;

type RangeSyncState =
  | {status: RangeSyncStatus.Finalized; target: ChainTarget}
  | {status: RangeSyncStatus.Head; targets: ChainTarget[]}
  | {status: RangeSyncStatus.Idle};

export type RangeSyncModules = {
  chain: IBeaconChain;
  network: INetwork;
  config: IBeaconConfig;
  logger: ILogger;
};

export type RangeSyncOpts = SyncChainOpts;

export class RangeSync {
  chain: IBeaconChain;
  network: INetwork;
  config: IBeaconConfig;
  logger: ILogger;
  chains = new Map<SyncChainId, SyncChain>();

  private opts?: SyncChainOpts;

  constructor({chain, network, config, logger}: RangeSyncModules, signal: AbortSignal, opts?: SyncChainOpts) {
    this.chain = chain;
    this.network = network;
    this.config = config;
    this.logger = logger;
    this.opts = opts;

    // Throw / return all AsyncGenerators inside each SyncChain instance
    signal.addEventListener("abort", () => {
      for (const chain of this.chains.values()) {
        chain.remove();
      }
    });
  }

  /**
   * A peer with a relevant STATUS message has been found, which also is advanced from us.
   * Add this peer to an existing chain or create a new one. The update the chains status.
   */
  addPeer(peerId: PeerId, localStatus: Status, peerStatus: Status): void {
    // Compute if we should do a Finalized or Head sync with this peer
    const rangeSyncType = getRangeSyncType(this.chain, localStatus, peerStatus);
    this.logger.debug("Sync peer joined", {peer: peerId.toB58String(), rangeSyncType});

    // If the peer existed in any other chain, remove it.
    // re-status'd peers can exist in multiple finalized chains, only one syncs at a time
    // if (rangeSyncType === RangeSyncType.Head) this.removePeer(peerId);

    // TODO: Use above
    this.removePeer(peerId);

    let startEpoch: Slot;
    let target: ChainTarget;
    switch (rangeSyncType) {
      case RangeSyncType.Finalized: {
        startEpoch = localStatus.finalizedEpoch;
        target = {
          slot: computeStartSlotAtEpoch(this.config, peerStatus.finalizedEpoch),
          root: peerStatus.finalizedRoot,
        };
        break;
      }

      case RangeSyncType.Head: {
        // The new peer has the same finalized (earlier filters should prevent a peer with an
        // earlier finalized chain from reaching here).
        startEpoch = Math.min(computeEpochAtSlot(this.config, localStatus.headSlot), peerStatus.finalizedEpoch);
        target = {
          slot: peerStatus.headSlot,
          root: peerStatus.headRoot,
        };
        break;
      }
    }

    this.addPeerOrCreateChain(startEpoch, target, peerId, RangeSyncType.Finalized);
    this.update(localStatus.finalizedEpoch);
  }

  /**
   * Remove this peer from all head and finalized chains. A chain may become peer-empty and be dropped
   */
  removePeer(peerId: PeerId): void {
    for (const syncChain of this.chains.values()) {
      const hasRemoved = syncChain.removePeer(peerId);
    }
  }

  /**
   * Compute the current RangeSync state, not cached
   */
  get state(): RangeSyncState {
    const syncingHeadTargets: ChainTarget[] = [];
    for (const chain of this.chains.values()) {
      if (chain.isSyncing) {
        if (chain.syncType === RangeSyncType.Finalized) {
          return {status: RangeSyncStatus.Finalized, target: chain.target};
        } else {
          syncingHeadTargets.push(chain.target);
        }
      }
    }

    if (syncingHeadTargets.length > 0) {
      return {status: RangeSyncStatus.Head, targets: syncingHeadTargets};
    } else {
      return {status: RangeSyncStatus.Idle};
    }
  }

  /**
   * Convenience method for `SyncChain`
   */
  private processChainSegment: ProcessChainSegment = async (blocks) => {
    const trusted = true; // TODO: Verify signatures
    await this.chain.processChainSegment(blocks, trusted);
  };

  /**
   * Convenience method for `SyncChain`
   */
  private downloadBeaconBlocksByRange: DownloadBeaconBlocksByRange = async (peerId, request) => {
    const blocks = await this.network.reqResp.beaconBlocksByRange(peerId, request);
    assertSequentialBlocksInRange(blocks, request);
    return blocks;
  };

  /**
   * Convenience method for `SyncChain`
   */
  private reportPeer = (peer: PeerId, action: PeerAction, actionName: string): void => {
    this.network.peerRpcScores.applyAction(peer, action, actionName);
  };

  private addPeerOrCreateChain(startEpoch: Epoch, target: ChainTarget, peer: PeerId, syncType: RangeSyncType): void {
    const id = getSyncChainId(syncType, target);

    let syncingChain = this.chains.get(id);
    if (!syncingChain) {
      this.logger.debug("New syncingChain", {slot: target.slot, root: toHexString(target.root), startEpoch});
      syncingChain = new SyncChain(
        startEpoch,
        target,
        syncType,
        this.processChainSegment,
        this.downloadBeaconBlocksByRange,
        this.reportPeer,
        this.config,
        this.logger,
        this.opts
      );
      this.chains.set(id, syncingChain);
    }

    syncingChain.addPeer(peer);
  }

  private update(localFinalizedEpoch: Epoch): void {
    const localFinalizedSlot = computeStartSlotAtEpoch(this.config, localFinalizedEpoch);

    // Remove chains that are out-dated, peer-empty, completed or failed
    for (const [id, syncChain] of this.chains.entries()) {
      if (shouldRemoveChain(syncChain, localFinalizedSlot, this.chain)) {
        syncChain.remove();
        this.chains.delete(id);
        this.logger.debug("Removed chain", {id});

        // Re-status peers
        // TODO: Then what? On new status call the add handler and repeat?
        // this.network.statusPeers(syncChain.peers);
      }
    }

    const {toStop, toStart} = updateChains(Array.from(this.chains.values()));

    for (const syncChain of toStop) {
      syncChain.stopSyncing();
    }

    for (const syncChain of toStart) {
      void this.runChain(syncChain, localFinalizedEpoch);
    }
  }

  private async runChain(syncChain: SyncChain, localFinalizedEpoch: Epoch): Promise<void> {
    const syncChainMetdata = (syncChain.getMetadata() as unknown) as Json;

    try {
      await syncChain.startSyncing(localFinalizedEpoch);
      this.logger.verbose("SyncChain reached target", syncChainMetdata);
    } catch (e) {
      if (e instanceof ErrorAborted) {
        return; // Ignore
      } else {
        this.logger.error("SyncChain error", syncChainMetdata, e);
      }
    }

    const localStatus = this.chain.getStatus();
    this.update(localStatus.finalizedEpoch);
  }
}

function getSyncChainId(syncType: RangeSyncType, target: ChainTarget): SyncChainId {
  return `${syncType}-${target.slot}-${toHexString(target.root)}`;
}
