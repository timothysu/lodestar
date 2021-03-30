/**
 * @module chain/blockAssembly
 */

import {CachedBeaconState, processBlock} from "@chainsafe/lodestar-beacon-state-transition";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {allForks, Bytes96, Root, Slot} from "@chainsafe/lodestar-types";
import {ContainerType} from "@chainsafe/ssz";
import {ZERO_HASH} from "../../../constants";
import {IBeaconDb} from "../../../db/api";
import {IEth1ForBlockProduction} from "../../../eth1";
import {IBeaconChain} from "../../interface";
import {assembleBody} from "./body";

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
  block: allForks.BeaconBlock
): Root {
  const postState = processBlock(state.clone(), block, false);
  return (config.getTypes(postState.slot).BeaconState as ContainerType<allForks.BeaconState>).hashTreeRoot(postState);
}
