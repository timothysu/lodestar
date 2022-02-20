import {DOMAIN_BEACON_ATTESTER} from "@chainsafe/lodestar-params";
import {allForks, phase0, ssz} from "@chainsafe/lodestar-types";
import {
  computeSigningRoot,
  computeStartSlotAtEpoch,
  ISignatureSet,
  SignatureSetType,
  verifySignatureSet,
} from "../../util";
import {EpochContext} from "../../cache/epochContext";

export function verifyIndexedAttestationSignature(
  epochCtx: EpochContext,
  indexedAttestation: phase0.IndexedAttestation,
  indices?: number[]
): boolean {
  return verifySignatureSet(getIndexedAttestationSignatureSet(epochCtx, indexedAttestation, indices));
}

export function getAttestationWithIndicesSignatureSet(
  epochCtx: EpochContext,
  attestation: Pick<phase0.Attestation, "data" | "signature">,
  indices: number[]
): ISignatureSet {
  const slot = computeStartSlotAtEpoch(attestation.data.target.epoch);
  const domain = epochCtx.config.getDomain(DOMAIN_BEACON_ATTESTER, slot);

  return {
    type: SignatureSetType.aggregate,
    pubkeys: indices.map((i) => epochCtx.index2pubkey[i]),
    signingRoot: computeSigningRoot(ssz.phase0.AttestationData, attestation.data, domain),
    signature: attestation.signature,
  };
}

export function getIndexedAttestationSignatureSet(
  epochCtx: EpochContext,
  indexedAttestation: phase0.IndexedAttestation,
  indices?: number[]
): ISignatureSet {
  return getAttestationWithIndicesSignatureSet(
    epochCtx,
    indexedAttestation,
    indices ?? indexedAttestation.attestingIndices
  );
}

export function getAttestationsSignatureSets(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet[] {
  return signedBlock.message.body.attestations.map((attestation) =>
    getIndexedAttestationSignatureSet(epochCtx, epochCtx.getIndexedAttestation(attestation))
  );
}
