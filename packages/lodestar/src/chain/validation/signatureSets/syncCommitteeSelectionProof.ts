import {DOMAIN_SYNC_COMMITTEE_SELECTION_PROOF} from "@chainsafe/lodestar-params";
import {altair, ssz} from "@chainsafe/lodestar-types";
import {
  computeSigningRoot,
  EpochContext,
  ISignatureSet,
  SignatureSetType,
} from "@chainsafe/lodestar-beacon-state-transition";

export function getSyncCommitteeSelectionProofSignatureSet(
  epochCtx: EpochContext,
  contributionAndProof: altair.ContributionAndProof
): ISignatureSet {
  const slot = contributionAndProof.contribution.slot;
  const domain = epochCtx.config.getDomain(DOMAIN_SYNC_COMMITTEE_SELECTION_PROOF, slot);
  const signingData: altair.SyncAggregatorSelectionData = {
    slot,
    subcommitteeIndex: contributionAndProof.contribution.subcommitteeIndex,
  };
  return {
    type: SignatureSetType.single,
    pubkey: epochCtx.index2pubkey[contributionAndProof.aggregatorIndex],
    signingRoot: computeSigningRoot(ssz.altair.SyncAggregatorSelectionData, signingData, domain),
    signature: contributionAndProof.selectionProof,
  };
}
