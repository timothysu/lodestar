import {SlotRoot} from "@chainsafe/lodestar-types";
import {SignedBeaconBlock, Slot} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {IBeaconChain} from "../../chain";
import {sortBlocks} from "../utils";
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
export async function processSyncBlocks(
  blocks: SignedBeaconBlock[],
  config: IBeaconConfig,
  chain: IBeaconChain,
  logger: ILogger,
  lastProcessedBlock: SlotRoot,
  trusted = false
): Promise<Slot | null> {
  let lastProcessedSlot: Slot | null = null;
  let {slot: headSlot, root: headRoot} = lastProcessedBlock;

  const blockBuffer = sortBlocks(blocks);
  // can't check linear chain for last block
  // so we don't want to import it
  for (let i = 0; i < blockBuffer.length - 1; i++) {
    const signedBlock = blockBuffer[i];
    const signedBlockNext = blockBuffer[i + 1];
    const block = signedBlock.message;
    const blockRoot = config.types.BeaconBlock.hashTreeRoot(block);
    // only import blocks that's part of a linear chain
    if (
      block.slot > headSlot! &&
      config.types.Root.equals(headRoot, block.parentRoot) &&
      config.types.Root.equals(blockRoot, signedBlockNext.message.parentRoot)
    ) {
      await chain.receiveBlock(signedBlock, trusted);
      headRoot = blockRoot;
      headSlot = block.slot;
      if (lastProcessedSlot === null || block.slot > lastProcessedSlot) {
        lastProcessedSlot = block.slot;
      }
    } else {
      logger.warn("Received block parent root doesn't match our head", {
        head: toHexString(headRoot),
        headSlot,
        blockParent: toHexString(block.parentRoot),
        blockSlot: block.slot,
      });
      // this will trigger sync to retry to fetch this chunk again
      return lastProcessedSlot || headSlot;
    }
  }

  return lastProcessedSlot;
}
