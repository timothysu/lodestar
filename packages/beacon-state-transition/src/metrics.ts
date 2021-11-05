import {Epoch, Slot} from "@chainsafe/lodestar-types";
import {IAttesterStatus} from "./allForks";

export interface IBeaconStateTransitionMetrics {
  stfnEpochTransition: IHistogram;
  stfnProcessBlock: IHistogram;
  registerValidatorStatuses: (currentEpoch: Epoch, statuses: IAttesterStatus[]) => void;
  registerBlockPostData: (slot: Slot, blockPostData: BlockPostData) => void;
}

export type BlockPostData = {
  attestationStatuses: AttestationStatus[];
};

type AttestationStatus = {
  attestingIndices: number[];
  inclusionDelay: number;
  isMatchingTarget: boolean;
  isMatchingHead: boolean;
};

interface IHistogram {
  startTimer(): () => void;
}
