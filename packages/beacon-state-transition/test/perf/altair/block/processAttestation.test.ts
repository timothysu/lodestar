import {itBench} from "@dapplion/benchmark";
import {generatePerfTestCachedStateAltair, perfStateId} from "../../util";
import {allForks} from "../../../../src";
import {BlockAltairOpts, getBlockAltair} from "../../phase0/block/util";
import {StateBlock} from "../../types";
import {MAX_ATTESTATIONS} from "@chainsafe/lodestar-params";
import {processAttestations} from "../../../../src/altair";
import {altair, phase0, ssz} from "@chainsafe/lodestar-types";

// Keep a regular array of h values
// When iterating mark nodes in a new array as dirty
// Rebuild the tree from the dirty nodes

// Current time: 80ms (normalcase)
// TODO:
// - Benchmark the time to recreate the tree from scratch

describe("altair processAttestations", () => {
  type BlockAltairOptsAtt = Pick<BlockAltairOpts, "attestationLen" | "bitsLen">;
  const testCases: {id: string; optsAtt: BlockAltairOptsAtt}[] = [
    {
      id: "normalcase",
      optsAtt: {attestationLen: 90, bitsLen: 90},
    },
    {
      id: "worstcase",
      optsAtt: {attestationLen: MAX_ATTESTATIONS, bitsLen: 128},
    },
  ];

  for (const {id, optsAtt} of testCases) {
    const opts: BlockAltairOpts = {
      ...optsAtt,
      proposerSlashingLen: 0,
      attesterSlashingLen: 0,
      depositsLen: 0,
      voluntaryExitLen: 0,
      syncCommitteeBitsLen: 0,
    };

    itBench<StateBlock, StateBlock>({
      id: `altair processAttestations - ${perfStateId} ${id}`,
      before: () => {
        const state = generatePerfTestCachedStateAltair() as allForks.CachedBeaconState<allForks.BeaconState>;
        const block = ssz.altair.SignedBeaconBlock.createTreeBackedFromStruct(getBlockAltair(state, opts));
        state.hashTreeRoot();
        return {state, block};
      },
      beforeEach: ({state, block}) => ({state: state.clone(), block}),
      fn: ({state, block}) => {
        processAttestations(
          state as allForks.CachedBeaconState<altair.BeaconState>,
          block.message.body.attestations as phase0.Attestation[],
          {},
          false // verifySignatures
        );
      },
    });
  }
});
