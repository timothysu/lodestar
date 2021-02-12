import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {config} from "@chainsafe/lodestar-config/minimal";
import {Status} from "@chainsafe/lodestar-types";
import {MockBeaconChain} from "../../../utils/mocks/chain/chain";
import {generateEmptySignedBlock} from "../../../utils/block";
import {generateState} from "../../../utils/state";
import {
  assertPeerRelevance,
  IrrelevantPeerError,
  IrrelevantPeerErrorCode,
} from "../../../../src/network/peers/assertPeerRelevance";
import {expectRejectedWithLodestarError} from "../../../utils/errors";
import {toHexString} from "@chainsafe/ssz";

chai.use(chaiAsPromised);

describe("network / peers / assertPeerRelevance", () => {
  const block = generateEmptySignedBlock();
  const state = generateState({
    finalizedCheckpoint: {
      epoch: 0,
      root: config.types.BeaconBlock.hashTreeRoot(block.message),
    },
  });

  const chain = new MockBeaconChain({
    genesisTime: 0,
    chainId: 0,
    networkId: BigInt(0),
    state,
    config,
  });

  const correctForkDigest = chain.getForkDigest();
  const differentForkDigest = Buffer.alloc(4, 1);
  const ZERO_HASH = Buffer.alloc(32, 0);
  const differedRoot = Buffer.alloc(32, 1);

  const testCases: {id: string; remote: Status; error?: IrrelevantPeerError}[] = [
    {
      id: "Reject incompatible forks",
      remote: {
        forkDigest: differentForkDigest,
        finalizedRoot: ZERO_HASH,
        finalizedEpoch: 0,
        headRoot: ZERO_HASH,
        headSlot: 0,
      },
      error: new IrrelevantPeerError({
        code: IrrelevantPeerErrorCode.INCOMPATIBLE_FORKS,
        ours: correctForkDigest,
        theirs: differentForkDigest,
      }),
    },
    {
      id: "Head is too far away from our clock",
      remote: {
        forkDigest: correctForkDigest,
        finalizedRoot: differedRoot,
        finalizedEpoch: 0,
        headRoot: ZERO_HASH,
        headSlot: 100, // Too far from current slot (= 0)
      },
      error: new IrrelevantPeerError({code: IrrelevantPeerErrorCode.DIFFERENT_CLOCKS, slotDiff: 100}),
    },
    {
      id: "Reject non zeroed genesis",
      remote: {
        forkDigest: correctForkDigest,
        finalizedRoot: differedRoot, // non zero root
        finalizedEpoch: 0, // at genesis
        headRoot: ZERO_HASH,
        headSlot: 0,
      },
      error: new IrrelevantPeerError({code: IrrelevantPeerErrorCode.GENESIS_NONZERO, root: toHexString(differedRoot)}),
    },
    {
      id: "Accept a finalized epoch equal to ours, with same root",
      remote: {
        forkDigest: correctForkDigest,
        finalizedRoot: ZERO_HASH,
        finalizedEpoch: 0,
        headRoot: ZERO_HASH,
        headSlot: 0,
      },
    },
    {
      id: "Accept finalized epoch greater than ours",
      remote: {
        forkDigest: correctForkDigest,
        finalizedRoot: ZERO_HASH,
        finalizedEpoch: 100, // Greater than ours (= 0)
        headRoot: ZERO_HASH,
        headSlot: 0,
      },
    },
  ];

  for (const {id, remote, error} of testCases) {
    it(id, async () => {
      const promise = assertPeerRelevance(remote, chain, config);
      if (error) {
        expect;
        await expectRejectedWithLodestarError(promise, error);
      } else {
        await promise;
      }
    });
  }
});
