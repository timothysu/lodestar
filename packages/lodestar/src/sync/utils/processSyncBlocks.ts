import {SlotRoot} from "@chainsafe/lodestar-types";
import {SignedBeaconBlock, Slot} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {IBeaconChain} from "../../chain";
import {sortBlocks} from "./getBlockRange";
import {ILogger} from "@chainsafe/lodestar-utils";
import {toHexString} from "@chainsafe/ssz";

/**
 * Bufferes and orders block and passes them to chain.
 * Returns last processed slot if it was successful,
 * current head slot if there was consensus split,
 * previous head slot if it failed to fetch range,
 * or null if there was no slots
 * @param config
 * @param chain
 * @param logger
 * @param isInitialSync
 * @param lastProcessedBlock
 * @param trusted
 */
export function processSyncBlocks(
  config: IBeaconConfig,
  chain: IBeaconChain,
  logger: ILogger,
  isInitialSync: boolean,
  lastProcessedBlock: SlotRoot,
  trusted = false
): (source: AsyncIterable<SignedBeaconBlock[] | null>) => Promise<Slot | null> {
  return async (source) => {
    let blockBuffer: SignedBeaconBlock[] = [];
    let lastProcessedSlot: Slot | null = null;
    let {slot: headSlot, root: headRoot} = lastProcessedBlock;
    for await (const blocks of source) {
      if (!blocks) {
        // failed to fetch range, trigger sync to retry
        logger.warn("Failed to get blocks for range", {headSlot});
        return headSlot;
      }
      logger.info("Imported blocks for slots", {blocks: blocks.map((block) => block.message.slot).join(",")});
      blockBuffer.push(...blocks);
    }
    blockBuffer = sortBlocks(blockBuffer);
    // can't check linear chain for last block
    // so we don't want to import it
    while (blockBuffer.length > 1) {
      const signedBlock = blockBuffer.shift()!;
      const nextBlock = blockBuffer[0];
      const block = signedBlock.message;
      const blockRoot = config.types.BeaconBlock.hashTreeRoot(block);
      // only import blocks that's part of a linear chain
      if (
        !isInitialSync ||
        (isInitialSync &&
          block.slot > headSlot! &&
          config.types.Root.equals(headRoot!, block.parentRoot) &&
          config.types.Root.equals(blockRoot, nextBlock.message.parentRoot))
      ) {
        await chain.receiveBlock(signedBlock, trusted);
        headRoot = blockRoot;
        headSlot = block.slot;
        if (block.slot > lastProcessedSlot!) {
          lastProcessedSlot = block.slot;
        }
      } else {
        logger.warn("Received block parent root doesn't match our head", {
          head: toHexString(headRoot!),
          headSlot,
          blockParent: toHexString(block.parentRoot),
          blockSlot: block.slot,
        });
        // this will trigger sync to retry to fetch this chunk again
        lastProcessedSlot = lastProcessedSlot || headSlot;
        break;
      }
    }
    return lastProcessedSlot;
  };
}
