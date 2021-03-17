import {readOnlyMap} from "@chainsafe/ssz";
import {allForks, phase0} from "@chainsafe/lodestar-types";
import {ISignatureSet} from "./types";
import {CachedBeaconState} from "../util";
import {getIndexedAttestationSignatureSet} from "../block/isValidIndexedAttestation";

export function getAttestationsSignatureSets(
  state: CachedBeaconState<allForks.BeaconState>,
  signedBlock: phase0.SignedBeaconBlock
): ISignatureSet[] {
  return readOnlyMap(signedBlock.message.body.attestations, (attestation) =>
    getIndexedAttestationSignatureSet(state, state.getIndexedAttestation(attestation))
  );
}
