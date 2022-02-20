import {DOMAIN_SYNC_COMMITTEE} from "@chainsafe/lodestar-params";
import {altair, ssz} from "@chainsafe/lodestar-types";
import {
  computeSigningRoot,
  EpochContext,
  ISignatureSet,
  SignatureSetType,
} from "@chainsafe/lodestar-beacon-state-transition";

export function getSyncCommitteeSignatureSet(
  epochCtx: EpochContext,
  syncCommittee: altair.SyncCommitteeMessage
): ISignatureSet {
  const domain = epochCtx.config.getDomain(DOMAIN_SYNC_COMMITTEE, syncCommittee.slot);

  return {
    type: SignatureSetType.single,
    pubkey: epochCtx.index2pubkey[syncCommittee.validatorIndex],
    signingRoot: computeSigningRoot(ssz.Root, syncCommittee.beaconBlockRoot, domain),
    signature: syncCommittee.signature,
  };
}
