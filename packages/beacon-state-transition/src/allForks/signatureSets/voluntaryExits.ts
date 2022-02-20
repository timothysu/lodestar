import {DOMAIN_VOLUNTARY_EXIT} from "@chainsafe/lodestar-params";
import {allForks, phase0, ssz} from "@chainsafe/lodestar-types";
import {
  computeSigningRoot,
  computeStartSlotAtEpoch,
  ISignatureSet,
  SignatureSetType,
  verifySignatureSet,
} from "../../util";
import {EpochContext} from "../../cache/epochContext";

export function verifyVoluntaryExitSignature(
  epochCtx: EpochContext,
  signedVoluntaryExit: phase0.SignedVoluntaryExit
): boolean {
  return verifySignatureSet(getVoluntaryExitSignatureSet(epochCtx, signedVoluntaryExit));
}

/**
 * Extract signatures to allow validating all block signatures at once
 */
export function getVoluntaryExitSignatureSet(
  epochCtx: EpochContext,
  signedVoluntaryExit: phase0.SignedVoluntaryExit
): ISignatureSet {
  const slot = computeStartSlotAtEpoch(signedVoluntaryExit.message.epoch);
  const domain = epochCtx.config.getDomain(DOMAIN_VOLUNTARY_EXIT, slot);

  return {
    type: SignatureSetType.single,
    pubkey: epochCtx.index2pubkey[signedVoluntaryExit.message.validatorIndex],
    signingRoot: computeSigningRoot(ssz.phase0.VoluntaryExit, signedVoluntaryExit.message, domain),
    signature: signedVoluntaryExit.signature,
  };
}

export function getVoluntaryExitsSignatureSets(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet[] {
  return signedBlock.message.body.voluntaryExits.map((voluntaryExit) =>
    getVoluntaryExitSignatureSet(epochCtx, voluntaryExit)
  );
}
