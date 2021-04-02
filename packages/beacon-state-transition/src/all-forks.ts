import {CachedBeaconState, lightclient, phase0} from ".";
import {allForks, lightclient as lightclientTypes, phase0 as phase0Types, Slot} from "@chainsafe/lodestar-types";

export function stateTransition(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: allForks.SignedBeaconBlock,
  options?: {verifyStateRoot?: boolean; verifyProposer?: boolean; verifySignatures?: boolean}
): CachedBeaconState<allForks.BeaconState> {
  if (signedBlock.message.slot < state.config.params.LIGHTCLIENT_PATCH_FORK_SLOT) {
    return phase0.fast.fastStateTransition(
      state as CachedBeaconState<phase0.BeaconState>,
      signedBlock,
      options
    ) as CachedBeaconState<allForks.BeaconState>;
  } else {
    return lightclient.fast.stateTransition(
      state as CachedBeaconState<lightclientTypes.BeaconState>,
      signedBlock as lightclientTypes.SignedBeaconBlock,
      options
    ) as CachedBeaconState<allForks.BeaconState>;
  }
}

export function processBlock(
  state: CachedBeaconState<allForks.BeaconState>,
  block: allForks.BeaconBlock,
  verifySignatures = true
): CachedBeaconState<allForks.BeaconState> {
  if (block.slot < state.config.params.LIGHTCLIENT_PATCH_FORK_SLOT) {
    phase0.fast.processBlock(state as CachedBeaconState<phase0Types.BeaconState>, block, verifySignatures);
    return state;
  }
  return lightclient.fast.processBlock(
    state,
    block as lightclientTypes.BeaconBlock,
    verifySignatures
  ) as CachedBeaconState<allForks.BeaconState>;
}

export function processSlots(
  state: CachedBeaconState<allForks.BeaconState>,
  slot: Slot
): CachedBeaconState<allForks.BeaconState> {
  if (slot < state.config.params.LIGHTCLIENT_PATCH_FORK_SLOT) {
    phase0.fast.processSlots(state as CachedBeaconState<phase0Types.BeaconState>, slot);
    return state;
  }
  lightclient.fast.processSlots(state as CachedBeaconState<lightclientTypes.BeaconState>, slot);
  return state;
}
