import {altair, ParticipationFlags, phase0, ssz, Uint8} from "@chainsafe/lodestar-types";
import {CachedBeaconStatePhase0, CachedBeaconStateAltair, CachedBeaconStateAllForks} from "../types";
import {createCachedBeaconState} from "../allForks";
import {newZeroedArray} from "../util";
import {List, TreeBacked} from "@chainsafe/ssz";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {IParticipationStatus} from "../allForks/util/cachedEpochParticipation";
import {getAttestationParticipationStatus, RootCache} from "./block/processAttestation";
import {getNextSyncCommittee} from "./util/syncCommittee";

/**
 * Upgrade a state from phase0 to altair.
 */
export function upgradeState(state: CachedBeaconStatePhase0): CachedBeaconStateAltair {
  const {config} = state;

  // Get underlying node and cast phase0 tree to altair tree
  //
  // A phase0 BeaconState tree can be safely casted to an altair BeaconState tree because:
  // - Deprecated fields are replaced by new fields at the exact same indexes
  // - All new fields are appended at the end
  //
  // So by just setting all new fields to some value, all the old nodes are dropped
  //
  // phase0                        | op   | altair
  // ----------------------------- | ---- | ------------
  // genesis_time                  | -    | genesis_time
  // genesis_validators_root       | -    | genesis_validators_root
  // slot                          | -    | slot
  // fork                          | -    | fork
  // latest_block_header           | -    | latest_block_header
  // block_roots                   | -    | block_roots
  // state_roots                   | -    | state_roots
  // historical_roots              | -    | historical_roots
  // eth1_data                     | -    | eth1_data
  // eth1_data_votes               | -    | eth1_data_votes
  // eth1_deposit_index            | -    | eth1_deposit_index
  // validators                    | -    | validators
  // balances                      | -    | balances
  // randao_mixes                  | -    | randao_mixes
  // slashings                     | -    | slashings
  // previous_epoch_attestations   | diff | previous_epoch_participation
  // current_epoch_attestations    | diff | current_epoch_participation
  // justification_bits            | -    | justification_bits
  // previous_justified_checkpoint | -    | previous_justified_checkpoint
  // current_justified_checkpoint  | -    | current_justified_checkpoint
  // finalized_checkpoint          | -    | finalized_checkpoint
  // -                             | new  | inactivity_scores
  // -                             | new  | current_sync_committee
  // -                             | new  | next_sync_committee

  const postTreeBackedState = upgradeTreeBackedState(config, state);
  const postState = createCachedBeaconState(config, postTreeBackedState);

  const pendingAttesations = Array.from(state.previousEpochAttestations);
  translateParticipation(postState, pendingAttesations);

  return postState;
}

function upgradeTreeBackedState(config: IBeaconConfig, state: CachedBeaconStatePhase0): TreeBacked<altair.BeaconState> {
  const nextEpochActiveIndices = state.nextShuffling.activeIndices;
  const stateTB = ssz.phase0.BeaconState.createTreeBacked(state.tree);
  const validatorCount = stateTB.validators.length;
  const epoch = state.currentShuffling.epoch;
  // TODO: Does this preserve the hashing cache? In altair devnets memory spikes on the fork transition
  const postState = ssz.altair.BeaconState.createTreeBacked(stateTB.tree);
  postState.fork = {
    previousVersion: stateTB.fork.currentVersion,
    currentVersion: config.ALTAIR_FORK_VERSION,
    epoch,
  };
  postState.previousEpochParticipation = newZeroedArray(validatorCount) as List<ParticipationFlags>;
  postState.currentEpochParticipation = newZeroedArray(validatorCount) as List<ParticipationFlags>;
  postState.inactivityScores = newZeroedArray(validatorCount) as List<Uint8>;
  const syncCommittee = getNextSyncCommittee(state, nextEpochActiveIndices, state.epochCtx.effectiveBalances);
  postState.currentSyncCommittee = syncCommittee;
  postState.nextSyncCommittee = syncCommittee;
  return postState;
}

/**
 * Translate_participation in https://github.com/ethereum/eth2.0-specs/blob/dev/specs/altair/fork.md
 */
function translateParticipation(state: CachedBeaconStateAltair, pendingAttesations: phase0.PendingAttestation[]): void {
  const {epochCtx} = state;
  const rootCache = new RootCache(state as CachedBeaconStateAllForks);
  const epochParticipation = state.previousEpochParticipation;
  for (const attestation of pendingAttesations) {
    const data = attestation.data;
    const {timelySource, timelyTarget, timelyHead} = getAttestationParticipationStatus(
      data,
      attestation.inclusionDelay,
      rootCache,
      epochCtx
    );

    const attestingIndices = state.getAttestingIndices(data, attestation.aggregationBits);
    for (const index of attestingIndices) {
      const status = epochParticipation.getStatus(index) as IParticipationStatus;
      const newStatus = {
        timelySource: status.timelySource || timelySource,
        timelyTarget: status.timelyTarget || timelyTarget,
        timelyHead: status.timelyHead || timelyHead,
      };
      epochParticipation.setStatus(index, newStatus);
    }
  }
}
