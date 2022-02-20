import {DOMAIN_BEACON_PROPOSER} from "@chainsafe/lodestar-params";
import {allForks, phase0, ssz} from "@chainsafe/lodestar-types";
import {computeSigningRoot, ISignatureSet, SignatureSetType} from "../../util";
import {EpochContext} from "../../cache/epochContext";

/**
 * Extract signatures to allow validating all block signatures at once
 */
export function getProposerSlashingSignatureSets(
  epochCtx: EpochContext,
  proposerSlashing: phase0.ProposerSlashing
): ISignatureSet[] {
  const pubkey = epochCtx.index2pubkey[proposerSlashing.signedHeader1.message.proposerIndex];

  return [proposerSlashing.signedHeader1, proposerSlashing.signedHeader2].map(
    (signedHeader): ISignatureSet => {
      const domain = epochCtx.config.getDomain(DOMAIN_BEACON_PROPOSER, signedHeader.message.slot);
      const beaconBlockHeaderType = ssz.phase0.BeaconBlockHeader;

      return {
        type: SignatureSetType.single,
        pubkey,
        signingRoot: computeSigningRoot(beaconBlockHeaderType, signedHeader.message, domain),
        signature: signedHeader.signature,
      };
    }
  );
}

export function getProposerSlashingsSignatureSets(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet[] {
  return signedBlock.message.body.proposerSlashings
    .map((proposerSlashing) => getProposerSlashingSignatureSets(epochCtx, proposerSlashing))
    .flat(1);
}
