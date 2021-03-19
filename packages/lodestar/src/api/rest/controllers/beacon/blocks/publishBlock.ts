import {allForks} from "@chainsafe/lodestar-types";
import {ValidationError} from "../../../../impl/errors/validation";
import {ApiController} from "../../types";

export const publishBlock: ApiController = {
  url: "/blocks",

  handler: async function (req, resp) {
    let block: allForks.SignedBeaconBlock;
    try {
      block = this.config
        .getTypes(parseInt(req.body.message.slot))
        .SignedBeaconBlock.fromJson(req.body, {case: "snake"});
    } catch (e) {
      throw new ValidationError("Failed to deserialize block");
    }
    await this.api.beacon.blocks.publishBlock(block);
    resp.code(200).type("application/json").send();
  },

  opts: {
    schema: {
      body: {
        type: "object",
      },
    },
  },
};
