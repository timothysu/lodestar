import {DOMAIN_RANDAO} from "@chainsafe/lodestar-params";
import {allForks, ssz} from "@chainsafe/lodestar-types";
import {computeEpochAtSlot, computeSigningRoot, ISignatureSet, SignatureSetType, verifySignatureSet} from "../../util";
import {EpochContext} from "../../cache/epochContext";

export function verifyRandaoSignature(epochCtx: EpochContext, block: allForks.BeaconBlock): boolean {
  return verifySignatureSet(getRandaoRevealSignatureSet(epochCtx, block));
}

/**
 * Extract signatures to allow validating all block signatures at once
 */
export function getRandaoRevealSignatureSet(epochCtx: EpochContext, block: allForks.BeaconBlock): ISignatureSet {
  // should not get epoch from epochCtx
  const epoch = computeEpochAtSlot(block.slot);
  const domain = epochCtx.config.getDomain(DOMAIN_RANDAO, block.slot);

  return {
    type: SignatureSetType.single,
    pubkey: epochCtx.index2pubkey[block.proposerIndex],
    signingRoot: computeSigningRoot(ssz.Epoch, epoch, domain),
    signature: block.body.randaoReveal,
  };
}
