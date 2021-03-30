import {CachedBeaconState, lightclient, phase0} from ".";
import {allForks, lightclient as lightclientTypes, phase0 as phase0Types} from "@chainsafe/lodestar-types";

export function processBlock(
  state: CachedBeaconState<allForks.BeaconState>,
  block: allForks.BeaconBlock,
  verifySignatures = true
): CachedBeaconState<allForks.BeaconState> {
  if (block.slot < state.config.params.LIGHTCLIENT_PATCH_FORK_SLOT) {
    phase0.fast.processBlock(state as CachedBeaconState<phase0Types.BeaconState>, block, verifySignatures);
    return state;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return lightclient.fast.processBlock(state, block as lightclientTypes.BeaconBlock, verifySignatures) as any;
}
