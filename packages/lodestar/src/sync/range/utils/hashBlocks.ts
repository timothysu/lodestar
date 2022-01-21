import {allForks} from "@chainsafe/lodestar-types";
import {ChainForkConfig} from "@chainsafe/lodestar-config";
import {byteArrayConcat} from "../../../util/bytes";

/**
 * Hash SignedBeaconBlock in a byte form easy to compare only
 * @param blocks
 * @param config
 */
export function hashBlocks(blocks: allForks.SignedBeaconBlock[], config: ChainForkConfig): Uint8Array {
  return byteArrayConcat(
    blocks.map((block) => config.getForkTypes(block.message.slot).SignedBeaconBlock.hashTreeRoot(block))
  );
}
