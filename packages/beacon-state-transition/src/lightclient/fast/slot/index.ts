import {CachedBeaconState} from "../../..";
import {lightclient, Slot} from "@chainsafe/lodestar-types";
import {processSlots as processSlotsNaive} from "../../naive";

export function processSlots(state: CachedBeaconState<lightclient.BeaconState>, slot: Slot): void {
  console.log("Processing slot from ", state.slot, slot);
  //temporarily use naive implementation
  processSlotsNaive(state.config, state, slot);
}
