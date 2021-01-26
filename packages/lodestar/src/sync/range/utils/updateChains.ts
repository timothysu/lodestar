import {sortBy} from "../../../util/sortBy";
import {MIN_FINALIZED_CHAIN_VALIDATED_EPOCHS, PARALLEL_HEAD_CHAINS} from "../../constants";
import {SyncChain} from "../chain";

export function updateChains(
  finalizedChains: SyncChain[],
  headChains: SyncChain[]
): {toStart: SyncChain[]; toStop: SyncChain[]} {
  return (
    // Choose the best finalized chain if one needs to be selected.
    updateFinalizedChains(finalizedChains) ||
    // Handle head syncing chains if there are no finalized chains left.
    updateHeadChains(headChains)
  );
}

/// This looks at all current finalized chains and decides if a new chain should be prioritised
/// or not.
function updateFinalizedChains(finalizedChains: SyncChain[]): {toStart: SyncChain[]; toStop: SyncChain[]} | null {
  // Find the chain with most peers and check if it is already syncing
  const preferredSyncChains = sortBy(
    finalizedChains,
    (syncChain) => syncChain.peers,
    (syncChain) => (syncChain.isSyncing ? 1 : 0)
  );

  // Should sync on finalized chain
  const newSyncChain = preferredSyncChains[0];
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
  // Order chains by available peers, if two chains have the same number of peers, prefer one
  // that is already syncing
  const preferredSyncChains = sortBy(
    headChains,
    (syncChain) => syncChain.peers,
    (syncChain) => (syncChain.isSyncing ? 1 : 0)
  );

  const toStart: SyncChain[] = [];
  const toStop: SyncChain[] = [];

  for (const syncChain of preferredSyncChains) {
    if (toStart.length < PARALLEL_HEAD_CHAINS) {
      toStart.push(syncChain);
    } else {
      toStop.push(syncChain);
    }
  }

  return {toStart, toStop};
}
