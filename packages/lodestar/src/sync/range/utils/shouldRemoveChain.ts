import {Slot} from "@chainsafe/lodestar-types";
import {IBeaconChain} from "../../../chain";
import {BACK_RANGE_SYNC_TYPES, FRONT_RANGE_SYNC_TYPES, RangeSyncType} from "../../utils";
import {SyncChain} from "../chain";

/**
 * Checks if a Finalized or Head chain should be removed
 */
export function shouldRemoveFrontSyncChain(
  syncChain: SyncChain,
  localFinalizedSlot: Slot,
  chain: IBeaconChain
): boolean {
  return (
    FRONT_RANGE_SYNC_TYPES.includes(syncChain.syncType) &&
    // Sync chain has completed syncing or encountered an error
    (syncChain.isRemovable ||
      // Sync chain has no more peers to download from
      syncChain.peers === 0 ||
      // Outdated: our chain has progressed beyond this sync chain
      (syncChain.target !== null &&
        (syncChain.target.slot < localFinalizedSlot || chain.forkChoice.hasBlock(syncChain.target.root))))
  );
}

export function shouldRemoveBackSyncChain(syncChain: SyncChain, oldestSlot: Slot): boolean {
  return BACK_RANGE_SYNC_TYPES.includes(syncChain.syncType) && (
    // Sync chain has completed syncing or encountered an error
    syncChain.isRemovable ||
    // Sync chain has no more peers to download from
    syncChain.peers === 0 ||
    
  );
}
