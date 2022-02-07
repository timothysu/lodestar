import {bellatrix, ssz} from "@chainsafe/lodestar-types";
import {createCachedBeaconState} from "../allForks/util";
import {CachedBeaconStateAltair, CachedBeaconStateBellatrix} from "../types";
import {TreeBacked} from "@chainsafe/ssz";
import {IBeaconConfig} from "@chainsafe/lodestar-config";

/**
 * Upgrade a state from altair to bellatrix.
 */
export function upgradeState(state: CachedBeaconStateAltair): CachedBeaconStateBellatrix {
  const {config} = state;

  // Get underlying node and cast altair tree to bellatrix tree
  //
  // An altair BeaconState tree can be safely casted to a bellatrix BeaconState tree because:
  // - All new fields are appended at the end
  //
  // altair                        | op  | altair
  // ----------------------------- | --- | ------------
  // genesis_time                  | -   | genesis_time
  // genesis_validators_root       | -   | genesis_validators_root
  // slot                          | -   | slot
  // fork                          | -   | fork
  // latest_block_header           | -   | latest_block_header
  // block_roots                   | -   | block_roots
  // state_roots                   | -   | state_roots
  // historical_roots              | -   | historical_roots
  // eth1_data                     | -   | eth1_data
  // eth1_data_votes               | -   | eth1_data_votes
  // eth1_deposit_index            | -   | eth1_deposit_index
  // validators                    | -   | validators
  // balances                      | -   | balances
  // randao_mixes                  | -   | randao_mixes
  // slashings                     | -   | slashings
  // previous_epoch_participation  | -   | previous_epoch_participation
  // current_epoch_participation   | -   | current_epoch_participation
  // justification_bits            | -   | justification_bits
  // previous_justified_checkpoint | -   | previous_justified_checkpoint
  // current_justified_checkpoint  | -   | current_justified_checkpoint
  // finalized_checkpoint          | -   | finalized_checkpoint
  // inactivity_scores             | -   | inactivity_scores
  // current_sync_committee        | -   | current_sync_committee
  // next_sync_committee           | -   | next_sync_committee
  // -                             | new | latest_execution_payload_header

  const postTreeBackedState = upgradeTreeBackedState(config, state);
  // TODO: This seems very sub-optimal, review
  return createCachedBeaconState(config, postTreeBackedState);
}

function upgradeTreeBackedState(
  config: IBeaconConfig,
  state: CachedBeaconStateAltair
): TreeBacked<bellatrix.BeaconState> {
  const stateTB = ssz.phase0.BeaconState.createTreeBacked(state.tree);

  // TODO: Does this preserve the hashing cache? In altair devnets memory spikes on the fork transition
  const postState = ssz.bellatrix.BeaconState.createTreeBacked(stateTB.tree);
  postState.fork = {
    previousVersion: stateTB.fork.currentVersion,
    currentVersion: config.BELLATRIX_FORK_VERSION,
    epoch: state.currentShuffling.epoch,
  };
  // Execution-layer
  postState.latestExecutionPayloadHeader = ssz.bellatrix.ExecutionPayloadHeader.defaultTreeBacked();

  return postState;
}
