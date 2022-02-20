import {PublicKey} from "@chainsafe/bls";
import {altair, ssz} from "@chainsafe/lodestar-types";
import {DOMAIN_SYNC_COMMITTEE} from "@chainsafe/lodestar-params";
import {computeSigningRoot, ISignatureSet, SignatureSetType} from "@chainsafe/lodestar-beacon-state-transition";
import {IBeaconConfig} from "@chainsafe/lodestar-config";

export function getSyncCommitteeContributionSignatureSet(
  config: IBeaconConfig,
  contribution: altair.SyncCommitteeContribution,
  pubkeys: PublicKey[]
): ISignatureSet {
  const domain = config.getDomain(DOMAIN_SYNC_COMMITTEE, contribution.slot);
  return {
    type: SignatureSetType.aggregate,
    pubkeys,
    signingRoot: computeSigningRoot(ssz.Root, contribution.beaconBlockRoot, domain),
    signature: contribution.signature,
  };
}
