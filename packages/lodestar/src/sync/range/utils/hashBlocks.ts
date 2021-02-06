import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {byteArrayConcat} from "../../../util/bytes";

/**
 * Hash SignedBeaconBlock in a byte form easy to compare only
 * @param blocks
 * @param config
 */
export function hashBlocks(blocks: SignedBeaconBlock[], config: IBeaconConfig): Uint8Array {
  return byteArrayConcat(blocks.map((block) => config.types.SignedBeaconBlock.hashTreeRoot(block)));
}
