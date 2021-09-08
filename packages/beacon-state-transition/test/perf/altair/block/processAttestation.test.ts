import {itBench} from "@dapplion/benchmark";
import {generatePerfTestCachedStateAltair, perfStateId} from "../../util";
import {allForks} from "../../../../src";
import {BlockAltairOpts, getBlockAltair} from "../../phase0/block/util";
import {StateBlock} from "../../types";
import {MAX_ATTESTATIONS} from "@chainsafe/lodestar-params";

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
        const block = getBlockAltair(state, opts);
        state.hashTreeRoot();
        return {state, block};
      },
      beforeEach: ({state, block}) => ({state: state.clone(), block}),
      fn: ({state, block}) => {
        allForks.stateTransition(state, block, {
          verifyProposer: false,
          verifySignatures: false,
          verifyStateRoot: false,
        });
      },
    });
  }
});
