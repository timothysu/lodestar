import {allForks} from "@chainsafe/lodestar-types";
import {ContainerType} from "@chainsafe/ssz";
import {IBeaconBlocksApi} from "../../../interface/beacon";
import {RestApi} from "./abstract";

export class RestBeaconBlocksApi extends RestApi implements IBeaconBlocksApi {
  async publishBlock(block: allForks.SignedBeaconBlock): Promise<void> {
    return this.client.post(
      "/blocks",
      (this.config.getTypes(block.message.slot).SignedBeaconBlock as ContainerType<
        allForks.SignedBeaconBlock
      >).toJson(block, {case: "snake"})
    );
  }
}
