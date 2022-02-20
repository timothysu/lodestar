import {allForks, phase0} from "@chainsafe/lodestar-types";
import {ISignatureSet} from "../../util";
import {EpochContext} from "../../cache/epochContext";
import {getIndexedAttestationSignatureSet} from "./indexedAttestation";

/** Get signature sets from a single AttesterSlashing object */
export function getAttesterSlashingSignatureSets(
  epochCtx: EpochContext,
  attesterSlashing: phase0.AttesterSlashing
): ISignatureSet[] {
  return [attesterSlashing.attestation1, attesterSlashing.attestation2].map((attestation) =>
    getIndexedAttestationSignatureSet(epochCtx, attestation)
  );
}

/** Get signature sets from all AttesterSlashing objects in a block */
export function getAttesterSlashingsSignatureSets(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet[] {
  return signedBlock.message.body.attesterSlashings
    .map((attesterSlashing) => getAttesterSlashingSignatureSets(epochCtx, attesterSlashing))
    .flat(1);
}
