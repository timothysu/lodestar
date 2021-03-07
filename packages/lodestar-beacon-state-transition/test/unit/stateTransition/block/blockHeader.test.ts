import sinon from "sinon";
import {expect} from "chai";
import {config} from "@chainsafe/lodestar-config/mainnet";
import {rewiremock} from "../../../rewiremock";
import {processBlockHeader} from "../../../../src/phase0/naive/block";

import {generateState} from "../../../utils/state";
import {generateEmptyBlock} from "../../../utils/block";
import {generateValidator} from "../../../utils/validator";

/* eslint-disable no-empty */

describe("process block - block header", function () {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  it("fail to process header - invalid slot", function () {
    const state = generateState({slot: 5});
    const block = generateEmptyBlock();
    block.slot = 4;
    try {
      processBlockHeader(config, state, block);
      expect.fail();
    } catch (e) {}
  });

  it("fail to process header - invalid parent header", function () {
    const state = generateState({slot: 5});
    const block = generateEmptyBlock();
    block.slot = 5;
    block.parentRoot = Buffer.alloc(10, 1);
    try {
      processBlockHeader(config, state, block);
      expect.fail();
    } catch (e) {}
  });

  it("fail to process header - proposerSlashed", function () {
    const state = generateState({slot: 5});
    state.validators.push(generateValidator({activation: 0, exit: 10, slashed: true}));
    const block = generateEmptyBlock();
    block.slot = 5;
    block.parentRoot = config.types.phase0.BeaconBlockHeader.hashTreeRoot(state.latestBlockHeader);
    try {
      processBlockHeader(config, state, block);
      expect.fail();
    } catch (e) {}
  });

  it("should process block", async function () {
    const getBeaconProposeIndexStub = sandbox.stub();
    getBeaconProposeIndexStub.returns(0);

    const {processBlockHeader} = await rewiremock.around(
      () => import("../../../../src/phase0/naive/block"),
      (mock) => {
        mock(() => import("../../../../src/util"))
          .with({
            getBeaconProposerIndex: getBeaconProposeIndexStub,
            getTemporaryBlockHeader: sandbox.stub(),
          })
          .toBeUsed();
      }
    );

    const state = generateState({slot: 5});
    state.validators.push(generateValidator({activation: 0, exit: 10}));
    const block = generateEmptyBlock();
    block.slot = 5;
    block.parentRoot = config.types.phase0.BeaconBlockHeader.hashTreeRoot(state.latestBlockHeader);

    processBlockHeader(config, state, block);
  });
});
