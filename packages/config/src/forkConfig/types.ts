/* eslint-disable @typescript-eslint/naming-convention */
import {ForkName} from "@chainsafe/lodestar-params";
import {allForks, Epoch, Slot, Version} from "@chainsafe/lodestar-types";

export interface ForkInfo {
  name: ForkName;
  epoch: Epoch;
  version: Version;
}

/**
 * Fork schedule and helper methods
 */
export interface ForkConfig {
  /** Forks in order order of occurence, `phase0` first */
  forks: {[K in ForkName]: ForkInfo};
  forksAscendingEpochOrder: ForkInfo[];
  forksDescendingEpochOrder: ForkInfo[];

  /** Get the hard-fork info for the active fork at `slot` */
  getForkInfo(slot: Slot): ForkInfo;

  /** Get the hard-fork name at a given slot */
  getForkName(slot: Slot): ForkName;
  /** Get the hard-fork version at a given slot */
  getForkVersion(slot: Slot): Version;
  /** Get SSZ types by hard-fork */
  getForkTypes(slot: Slot): allForks.AllForksSSZTypes;
}
