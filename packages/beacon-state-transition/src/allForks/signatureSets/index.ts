import {allForks, altair} from "@chainsafe/lodestar-types";
import {computeEpochAtSlot, ISignatureSet} from "../../util";
import {EpochContext} from "../../cache/epochContext";
import {getProposerSlashingsSignatureSets} from "./proposerSlashings";
import {getAttesterSlashingsSignatureSets} from "./attesterSlashings";
import {getAttestationsSignatureSets} from "./indexedAttestation";
import {getProposerSignatureSet} from "./proposer";
import {getRandaoRevealSignatureSet} from "./randao";
import {getVoluntaryExitsSignatureSets} from "./voluntaryExits";
import {getSyncCommitteeSignatureSet} from "../../altair/block/processSyncCommittee";

export * from "./attesterSlashings";
export * from "./indexedAttestation";
export * from "./proposer";
export * from "./proposerSlashings";
export * from "./randao";
export * from "./voluntaryExits";

/**
 * Includes all signatures on the block (except the deposit signatures) for verification.
 * Deposits are not included because they can legally have invalid signatures.
 */
export function getAllBlockSignatureSets(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet[] {
  return [
    getProposerSignatureSet(epochCtx, signedBlock),
    ...getAllBlockSignatureSetsExceptProposer(epochCtx, signedBlock),
  ];
}

/**
 * Includes all signatures on the block (except the deposit signatures) for verification.
 * Useful since block proposer signature is verified beforehand on gossip validation
 */
export function getAllBlockSignatureSetsExceptProposer(
  epochCtx: EpochContext,
  signedBlock: allForks.SignedBeaconBlock
): ISignatureSet[] {
  const signatureSets = [
    getRandaoRevealSignatureSet(epochCtx, signedBlock.message),
    ...getProposerSlashingsSignatureSets(epochCtx, signedBlock),
    ...getAttesterSlashingsSignatureSets(epochCtx, signedBlock),
    ...getAttestationsSignatureSets(epochCtx, signedBlock),
    ...getVoluntaryExitsSignatureSets(epochCtx, signedBlock),
  ];

  // Only after altair fork, validate tSyncCommitteeSignature
  if (computeEpochAtSlot(signedBlock.message.slot) >= epochCtx.config.ALTAIR_FORK_EPOCH) {
    const syncCommitteeSignatureSet = getSyncCommitteeSignatureSet(
      epochCtx,
      (signedBlock as altair.SignedBeaconBlock).message
    );
    // There may be no participants in this syncCommitteeSignature, so it must not be validated
    if (syncCommitteeSignatureSet) {
      signatureSets.push(syncCommitteeSignatureSet);
    }
  }

  return signatureSets;
}
