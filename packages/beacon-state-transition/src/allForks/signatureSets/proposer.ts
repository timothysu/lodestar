import {DOMAIN_BEACON_PROPOSER} from "@chainsafe/lodestar-params";
import {allForks} from "@chainsafe/lodestar-types";
import {computeSigningRoot} from "../../util";
import {ISignatureSet, SignatureSetType, verifySignatureSet} from "../../util/signatureSets";
import {EpochContext} from "../../cache/epochContext";

export function verifyProposerSignature(epochCtx: EpochContext, signedBlock: allForks.SignedBeaconBlock): boolean {
  const signatureSet = getProposerSignatureSet(epochCtx, signedBlock);
  return verifySignatureSet(signatureSet);
}

export function getProposerSignatureSet(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet {
  const domain = epochCtx.config.getDomain(DOMAIN_BEACON_PROPOSER, signedBlock.message.slot);

  return {
    type: SignatureSetType.single,
    pubkey: epochCtx.index2pubkey[signedBlock.message.proposerIndex],
    signingRoot: computeSigningRoot(
      epochCtx.config.getForkTypes(signedBlock.message.slot).BeaconBlock,
      signedBlock.message,
      domain
    ),
    signature: signedBlock.signature,
  };
}
