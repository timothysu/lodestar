import {readOnlyMap} from "@chainsafe/ssz";
import {allForks, phase0} from "@chainsafe/lodestar-types";
import {ISignatureSet} from "./types";
import {CachedBeaconState} from "../util";
import {getVoluntaryExitSignatureSet} from "../block/processVoluntaryExit";

export function getVoluntaryExitsSignatureSets(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: phase0.SignedBeaconBlock
): ISignatureSet[] {
  return readOnlyMap(signedBlock.message.body.voluntaryExits, (voluntaryExit) =>
    getVoluntaryExitSignatureSet(state, voluntaryExit)
  );
}
