import {allForks, lightclient, phase0} from "@chainsafe/lodestar-types";
import {TreeBacked} from "@chainsafe/ssz";
import {CachedBeaconState} from "../../..";
import {createCachedBeaconState} from "../../../phase0/fast/util/cachedBeaconState";
import {processBlock as processBlockNaive} from "../../naive";

export function processBlock(
  state: CachedBeaconState<allForks.BeaconState>,
  block: lightclient.BeaconBlock,
  verifySignatures = true
): CachedBeaconState<lightclient.BeaconState> {
  //temporarily use naive implementation
  const postState = (state.tree.clone() as unknown) as lightclient.BeaconState & phase0.BeaconState;
  processBlockNaive(state.config, postState, block, verifySignatures);
  return createCachedBeaconState<lightclient.BeaconState>(
    state.config,
    (postState as unknown) as TreeBacked<lightclient.BeaconState>
  );
}
