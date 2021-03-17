/**
 * @module chain/blockAssembly
 */

import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {allForks, Bytes96, Root, Slot} from "@chainsafe/lodestar-types";
import {ZERO_HASH} from "../../../constants";
import {IBeaconDb} from "../../../db/api";
import {IEth1ForBlockProduction} from "../../../eth1";
import {IBeaconChain} from "../../interface";
import {assembleBody} from "./body";
import {CachedBeaconState, phase0, processBlock} from "@chainsafe/lodestar-beacon-state-transition";
import {ContainerType} from "@chainsafe/ssz";

export async function assembleBlock(
  config: IBeaconConfig,
  chain: IBeaconChain,
  db: IBeaconDb,
  eth1: IEth1ForBlockProduction,
  slot: Slot,
  randaoReveal: Bytes96,
  graffiti = ZERO_HASH
): Promise<allForks.BeaconBlock> {
  const head = chain.forkChoice.getHead();
  const state = await chain.regen.getBlockSlotState(head.blockRoot, slot);

  const block = config.getTypes(slot).BeaconBlock.defaultValue();
  block.proposerIndex = state.getBeaconProposer(slot);
  block.slot = slot;
  block.parentRoot = head.blockRoot;
  block.body = await assembleBody(config, db, eth1, state, slot, randaoReveal, graffiti);
  block.stateRoot = computeNewStateRoot(config, state, block);

  return block;
}

/**
 * Instead of running fastStateTransition(), only need to process block since
 * state is processed until block.slot already (this is to avoid double
 * epoch transition which happen at slot % 32 === 0)
 */
function computeNewStateRoot(
  config: IBeaconConfig,
  state: CachedBeaconState<allForks.BeaconState>,
  block: phase0.BeaconBlock
): Root {
  const postState = processBlock(state.clone(), block, true);
  return (config.getTypes(postState.slot).BeaconState as ContainerType<allForks.BeaconState>).hashTreeRoot(postState);
}
