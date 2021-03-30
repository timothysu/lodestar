import {allForks, phase0} from "@chainsafe/lodestar-types";
import {readonlyValues} from "@chainsafe/ssz";
import {ISignatureSet} from "../../../util";
import {getIndexedAttestationSignatureSet} from "../block/isValidIndexedAttestation";
import {CachedBeaconState} from "../util";

export function getAttesterSlashingsSignatureSets(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: phase0.SignedBeaconBlock
): ISignatureSet[] {
  return Array.from(readonlyValues(signedBlock.message.body.attesterSlashings), (attesterSlashing) =>
    [attesterSlashing.attestation1, attesterSlashing.attestation2].map((attestation) =>
      getIndexedAttestationSignatureSet(state, attestation)
    )
  ).flat(1);
}
