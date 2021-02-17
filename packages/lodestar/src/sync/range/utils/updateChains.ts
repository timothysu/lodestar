import {sortBy} from "../../../util/sortBy";
import {MIN_FINALIZED_CHAIN_VALIDATED_EPOCHS, PARALLEL_HEAD_CHAINS} from "../../constants";
import {RangeSyncType} from "../../utils/remoteSyncType";
import {SyncChain} from "../chain";

/**
 * Priotize existing chains based on their target and peer count
 * Returns an array of chains toStart and toStop to comply with the priotization
 */
export function updateChains(chains: SyncChain[]): {toStart: SyncChain[]; toStop: SyncChain[]} {
  const finalizedChains: SyncChain[] = [];
  const headChains: SyncChain[] = [];
  for (const chain of chains) {
    if (chain.syncType === RangeSyncType.Finalized) {
      finalizedChains.push(chain);
    } else {
      headChains.push(chain);
    }
  }

  return (
    // Choose the best finalized chain if one needs to be selected.
    updateFinalizedChains(finalizedChains) ||
    // Handle head syncing chains if there are no finalized chains left.
    updateHeadChains(headChains)
  );
}

function updateFinalizedChains(finalizedChains: SyncChain[]): {toStart: SyncChain[]; toStop: SyncChain[]} | null {
  // Pick first only
  const [newSyncChain] = prioritizeSyncChains(finalizedChains);

  // TODO: Should it stop all HEAD chains if going from a head sync to a finalized sync?

  // Should sync on finalized chain
  if (!newSyncChain) {
    // No finalized chain to sync
    return null;
  }

  const currentSyncChain = finalizedChains.find((syncChain) => syncChain.isSyncing);
  if (!currentSyncChain) {
    return {toStart: [newSyncChain], toStop: []};
  }

  if (
    newSyncChain !== currentSyncChain &&
    newSyncChain.peers > currentSyncChain.peers &&
    currentSyncChain.validatedEpochs > MIN_FINALIZED_CHAIN_VALIDATED_EPOCHS
  ) {
    // Switch from currentSyncChain to newSyncChain
    return {toStart: [newSyncChain], toStop: [currentSyncChain]};
  } else {
    // Keep syncing currentSyncChains
    // chains have the same number of peers, pick the currently syncing
    // chain to avoid unnecesary switchings and try to advance it
    return {toStart: [], toStop: []};
  }
}

function updateHeadChains(headChains: SyncChain[]): {toStart: SyncChain[]; toStop: SyncChain[]} {
  const toStart: SyncChain[] = [];
  const toStop: SyncChain[] = [];

  for (const syncChain of prioritizeSyncChains(headChains)) {
    if (toStart.length < PARALLEL_HEAD_CHAINS) {
      toStart.push(syncChain);
    } else {
      toStop.push(syncChain);
    }
  }

  return {toStart, toStop};
}

/**
 * Order `syncChains` by most peers and already syncing first
 * If two chains have the same number of peers, prefer the already syncing to not drop progress
 */
function prioritizeSyncChains(syncChains: SyncChain[]): SyncChain[] {
  return sortBy(
    syncChains,
    (syncChain) => -syncChain.peers, // Sort from high peer count to low: negative to reverse
    (syncChain) => (syncChain.isSyncing ? 0 : 1) // Sort by isSyncing first = 0
  );
}
