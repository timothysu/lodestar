import {DOMAIN_CONTRIBUTION_AND_PROOF} from "@chainsafe/lodestar-params";
import {altair, ssz} from "@chainsafe/lodestar-types";
import {
  computeSigningRoot,
  EpochContext,
  ISignatureSet,
  SignatureSetType,
} from "@chainsafe/lodestar-beacon-state-transition";

export function getContributionAndProofSignatureSet(
  epochCtx: EpochContext,
  signedContributionAndProof: altair.SignedContributionAndProof
): ISignatureSet {
  const domain = epochCtx.config.getDomain(
    DOMAIN_CONTRIBUTION_AND_PROOF,
    signedContributionAndProof.message.contribution.slot
  );
  const signingData = signedContributionAndProof.message;
  return {
    type: SignatureSetType.single,
    pubkey: epochCtx.index2pubkey[signedContributionAndProof.message.aggregatorIndex],
    signingRoot: computeSigningRoot(ssz.altair.ContributionAndProof, signingData, domain),
    signature: signedContributionAndProof.signature,
  };
}
