import {allForks, phase0} from "@chainsafe/lodestar-types";
import {readonlyValues} from "@chainsafe/ssz";
import {ISignatureSet} from "../../../util";
import {CachedBeaconState} from "../util";
import {getIndexedAttestationSignatureSet} from "../block/isValidIndexedAttestation";

export function getAttestationsSignatureSets(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: phase0.SignedBeaconBlock
): ISignatureSet[] {
  return Array.from(readonlyValues(signedBlock.message.body.attestations), (attestation) =>
    getIndexedAttestationSignatureSet(state, state.getIndexedAttestation(attestation))
  );
}
