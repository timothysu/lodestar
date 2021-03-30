import {allForks, phase0} from "@chainsafe/lodestar-types";
import {readonlyValues} from "@chainsafe/ssz";
import {ISignatureSet} from "../../../util";
import {CachedBeaconState} from "../util";
import {getVoluntaryExitSignatureSet} from "../block/processVoluntaryExit";

export function getVoluntaryExitsSignatureSets(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: phase0.SignedBeaconBlock
): ISignatureSet[] {
  return Array.from(readonlyValues(signedBlock.message.body.voluntaryExits), (voluntaryExit) =>
    getVoluntaryExitSignatureSet(state, voluntaryExit)
  );
}
