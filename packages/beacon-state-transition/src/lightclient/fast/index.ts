import {lightclient} from "@chainsafe/lodestar-types";
import {TreeBacked} from "@chainsafe/ssz";
import {CachedBeaconState, createCachedBeaconState, verifyBlockSignature} from "../..";
import {processBlock, processSlots} from "../naive";

export * from "./block";
export * from "./slot";

export function stateTransition(
  state: CachedBeaconState<lightclient.BeaconState>,
  signedBlock: lightclient.SignedBeaconBlock,
  options?: {verifyStateRoot?: boolean; verifyProposer?: boolean; verifySignatures?: boolean}
): CachedBeaconState<lightclient.BeaconState> {
  const {verifyStateRoot = true, verifyProposer = true, verifySignatures = true} = options || {};
  const types = state.config.types;

  const block = signedBlock.message;

  const postState = state.config.types.lightclient.BeaconState.createTreeBacked(state.tree.clone());
  // process slots (including those with no blocks) since block
  processSlots(state.config, postState, block.slot);

  // verify signature
  if (verifyProposer) {
    if (!verifyBlockSignature(state.config, postState, signedBlock)) {
      throw new Error("Invalid block signature");
    }
  }
  // process block
  processBlock(state.config, postState, block, verifySignatures);
  // verify state root
  if (verifyStateRoot) {
    if (!types.Root.equals(block.stateRoot, postState.tree.root)) {
      throw new Error("Invalid state root");
    }
  }
  return createCachedBeaconState<lightclient.BeaconState>(
    state.config,
    (postState as unknown) as TreeBacked<lightclient.BeaconState>
  );
}
