/**
 * @module chain/blockAssembly
 */

import {CachedBeaconState, EMPTY_SIGNATURE} from "@chainsafe/lodestar-beacon-state-transition";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {allForks, Bytes32, Bytes96, lightclient, phase0, Slot} from "@chainsafe/lodestar-types";
import {BitVector, List} from "@chainsafe/ssz";
import {IBeaconDb} from "../../../db";
import {IEth1ForBlockProduction} from "../../../eth1";

export async function assembleBody(
  config: IBeaconConfig,
  db: IBeaconDb,
  eth1: IEth1ForBlockProduction,
  currentState: CachedBeaconState<allForks.BeaconState>,
  slot: Slot,
  randaoReveal: Bytes96,
  graffiti: Bytes32
): Promise<allForks.BeaconBlockBody> {
  const [proposerSlashings, attesterSlashings, attestations, voluntaryExits, {eth1Data, deposits}] = await Promise.all([
    db.proposerSlashing.values({limit: config.params.MAX_PROPOSER_SLASHINGS}),
    db.attesterSlashing.values({limit: config.params.MAX_ATTESTER_SLASHINGS}),
    db.aggregateAndProof
      .getBlockAttestations(currentState)
      .then((value) => value.slice(0, config.params.MAX_ATTESTATIONS)),
    db.voluntaryExit.values({limit: config.params.MAX_VOLUNTARY_EXITS}),
    eth1.getEth1DataAndDeposits(currentState),
  ]);
  let body = config.getTypes(slot).BeaconBlockBody.defaultValue();
  body = {
    ...body,
    randaoReveal,
    graffiti,
    eth1Data,
    proposerSlashings: proposerSlashings as List<phase0.ProposerSlashing>,
    attesterSlashings: attesterSlashings as List<phase0.AttesterSlashing>,
    attestations: attestations as List<phase0.Attestation>,
    deposits: deposits as List<phase0.Deposit>,
    voluntaryExits: voluntaryExits as List<phase0.SignedVoluntaryExit>,
  };

  if (slot >= config.params.LIGHTCLIENT_PATCH_FORK_SLOT) {
    (body as lightclient.BeaconBlockBody).syncCommitteeBits = getSyncCommitteeBits(config);
    (body as lightclient.BeaconBlockBody).syncCommitteeSignature = EMPTY_SIGNATURE;
  }
  return body;
}

function getSyncCommitteeBits(config: IBeaconConfig): BitVector {
  return Array.from({length: config.params.SYNC_COMMITTEE_SIZE}, () => false);
}
