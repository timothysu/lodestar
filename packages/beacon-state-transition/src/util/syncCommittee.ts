import {aggregatePublicKeys} from "@chainsafe/bls";
import {
  BASE_REWARD_FACTOR,
  DOMAIN_SYNC_COMMITTEE,
  EFFECTIVE_BALANCE_INCREMENT,
  MAX_EFFECTIVE_BALANCE,
  SLOTS_PER_EPOCH,
  SYNC_COMMITTEE_SIZE,
  SYNC_REWARD_WEIGHT,
  WEIGHT_DENOMINATOR,
} from "@chainsafe/lodestar-params";
import {altair, ValidatorIndex, allForks, Gwei} from "@chainsafe/lodestar-types";
import {bigIntSqrt, intDiv, intToBytes} from "@chainsafe/lodestar-utils";
import {MutableVector} from "@chainsafe/persistent-ts";
import {hash} from "@chainsafe/ssz";
import {computeEpochAtSlot} from "./epoch";
import {computeShuffledIndex, getSeed} from "./seed";

/**
 * Same logic in https://github.com/ethereum/eth2.0-specs/blob/v1.1.0-alpha.5/specs/altair/beacon-chain.md#sync-committee-processing
 */
export function computeSyncParticipantReward(totalActiveBalance: Gwei): number {
  // TODO: manage totalActiveBalance in eth
  const totalActiveIncrements = Number(totalActiveBalance / BigInt(EFFECTIVE_BALANCE_INCREMENT));
  const baseRewardPerIncrement = Math.floor(
    (EFFECTIVE_BALANCE_INCREMENT * BASE_REWARD_FACTOR) / Number(bigIntSqrt(totalActiveBalance))
  );
  const totalBaseRewards = baseRewardPerIncrement * totalActiveIncrements;
  const maxParticipantRewards = Math.floor(
    Math.floor((totalBaseRewards * SYNC_REWARD_WEIGHT) / WEIGHT_DENOMINATOR) / SLOTS_PER_EPOCH
  );
  return Math.floor(maxParticipantRewards / SYNC_COMMITTEE_SIZE);
}

/**
 * TODO: NAIVE
 *
 * Return the sync committee indices for a given state and epoch.
 * Aligns `epoch` to `baseEpoch` so the result is the same with any `epoch` within a sync period.
 *  Note: This function should only be called at sync committee period boundaries, as
 *  ``get_sync_committee_indices`` is not stable within a given period.
 *
 * SLOW CODE - 🐢
 */
export function getNextSyncCommitteeIndices(
  state: allForks.BeaconState,
  activeValidatorIndices: ValidatorIndex[],
  effectiveBalances: MutableVector<number>
): ValidatorIndex[] {
  const MAX_RANDOM_BYTE = 2 ** 8 - 1;
  const epoch = computeEpochAtSlot(state.slot) + 1;

  const activeValidatorCount = activeValidatorIndices.length;
  const seed = getSeed(state, epoch, DOMAIN_SYNC_COMMITTEE);
  let i = 0;
  const syncCommitteeIndices = [];
  while (syncCommitteeIndices.length < SYNC_COMMITTEE_SIZE) {
    const shuffledIndex = computeShuffledIndex(i % activeValidatorCount, activeValidatorCount, seed);
    const candidateIndex = activeValidatorIndices[shuffledIndex];
    const randomByte = hash(Buffer.concat([seed, intToBytes(intDiv(i, 32), 8, "le")]))[i % 32];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const effectiveBalance = effectiveBalances.get(candidateIndex)!;
    if (effectiveBalance * MAX_RANDOM_BYTE >= MAX_EFFECTIVE_BALANCE * randomByte) {
      syncCommitteeIndices.push(candidateIndex);
    }
    i++;
  }
  return syncCommitteeIndices;
}

/**
 * Return the sync committee for a given state and epoch.
 *
 * SLOW CODE - 🐢
 */
export function getNextSyncCommittee(
  state: allForks.BeaconState,
  activeValidatorIndices: ValidatorIndex[],
  effectiveBalances: MutableVector<number>
): altair.SyncCommittee {
  const indices = getNextSyncCommitteeIndices(state, activeValidatorIndices, effectiveBalances);
  // Using the index2pubkey cache is slower because it needs the serialized pubkey.
  const pubkeys = indices.map((index) => state.validators[index].pubkey);
  return {
    pubkeys,
    aggregatePubkey: aggregatePublicKeys(pubkeys.map((pubkey) => pubkey.valueOf() as Uint8Array)),
  };
}
