import {generateEmptySignedBlock} from "../../../utils/block";
import {BeaconBlocksByRangeRequest, SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {assertSequentialBlocksInRange} from "../../../../src/sync/utils";

describe("sync / utils / assertSequentialBlocksInRange", function () {
  it("Should assert correct blocksInRange", () => {
    const request: BeaconBlocksByRangeRequest = {startSlot: 10, count: 10, step: 1};

    const blocks: SignedBeaconBlock[] = [];
    for (let i = request.startSlot; i < request.startSlot + request.count; i += request.step) {
      const block = generateEmptySignedBlock();
      block.message.slot = i;
      blocks.push(block);
    }

    assertSequentialBlocksInRange(blocks, request);
  });
});
