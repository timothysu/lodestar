import {allForks, phase0} from "@chainsafe/lodestar-types";
import {readonlyValues} from "@chainsafe/ssz";
import {ISignatureSet} from "../../../util";
import {CachedBeaconState} from "../util";
import {getProposerSlashingSignatureSets} from "../block/processProposerSlashing";

export function getProposerSlashingsSignatureSets(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: phase0.SignedBeaconBlock
): ISignatureSet[] {
  return Array.from(readonlyValues(signedBlock.message.body.proposerSlashings), (proposerSlashing) =>
    getProposerSlashingSignatureSets(state, proposerSlashing)
  ).flat(1);
}
