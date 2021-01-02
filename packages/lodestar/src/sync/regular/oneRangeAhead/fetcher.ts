import {AbortSignal} from "abort-controller";
import {SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {SlotRoot} from "@chainsafe/lodestar-types";
import {ErrorAborted, sleep, withTimeout} from "@chainsafe/lodestar-utils";
import PeerId from "peer-id";
import {IRegularSyncModules} from "..";
import {IRegularSyncOptions} from "../options";
import {ISlotRange} from "../../interface";
import {ZERO_HASH} from "../../../constants";
import {assertLinearChainSegment, getBlockRange} from "../../utils";

// timeout for getBlockRange is 3 minutes
const GET_BLOCK_RANGE_TIMEOUT = 3 * 60 * 1000;

/**
 * Get next range by issuing beacon_blocks_by_range requests.
 * Returned result may miss some blocks or contain blocks of a different forkchoice branch.
 * This is ok, we handle that by beacon_blocks_by_root in sync service.
 */
async function getNextBlockRange(
  modules: IRegularSyncModules,
  getPeers: (exludedPeers: Set<string>) => Promise<PeerId[]>,
  signal: AbortSignal,
  options: Partial<IRegularSyncOptions>
): Promise<SignedBeaconBlock[]> {
  const {config, network, chain, logger} = modules;

  // always set range based on last fetch block bc sometimes the previous fetch may not return all blocks
  // this.lastFetchCheckpoint.slot + 1 maybe an orphaned block and peers will return empty range
  let lastFetchCheckpoint: SlotRoot = {root: ZERO_HASH, slot: 0};
  const rangeStart = lastFetchCheckpoint.slot;
  // due to exclusive endSlot in chunkify, we want `currentSlot + 1`
  // since we want to check linear chain, query 1 additional slot
  let rangeEnd = Math.min(rangeStart + (options.blockPerChunk ?? 1) + 1, chain.clock.currentSlot + 1);

  const badPeers = new Set<string>();

  // expect at least 2 blocks since we check linear chain
  while (!signal.aborted) {
    const slotRange: ISlotRange = {start: rangeStart, end: rangeEnd};

    try {
      const peers = await getPeers(badPeers);
      const peer = peers[0];
      // result = await getBlockRange(logger, this.network.reqResp, peers, slotRange);
      // Work around of https://github.com/ChainSafe/lodestar/issues/1690

      const blocks = await withTimeout(
        async () =>
          await network.reqResp.beaconBlocksByRange(peer, {
            startSlot: slotRange!.start,
            step: 1,
            count: slotRange!.end - slotRange!.start + 1,
          }),
        GET_BLOCK_RANGE_TIMEOUT,
        signal
      );

      // Handle empty range, or range too empty
      if (!blocks || blocks.length < 2) {
        const range = {start: rangeStart, end: rangeEnd};
        const peerHeadSlot = network.peerMetadata.getStatus(peer)?.headSlot ?? 0;
        const numBlocks = blocks ? blocks.length : 0;
        logger.verbose("Not enough blocks for range", {range, numBlocks});

        if (range.end <= peerHeadSlot) {
          // range contains skipped slots, query for next range
          logger.verbose("Regular Sync: queried range is behind peer head, fetch next range", {
            ...range,
            peerHead: peerHeadSlot,
          });

          // don't trust empty range as it's rarely happen, peer may return it incorrectly most of the time
          // same range start, expand range end
          // slowly increase rangeEnd, using getNewTarget() may cause giant range very quickly
          rangeEnd += 1;
        } else {
          logger.verbose("Regular Sync: Queried range passed peer head, sleep then try again", {
            range,
            peerHead: peerHeadSlot,
          });

          // don't want to disturb our peer if we pass peer head
          await sleep(config.params.SECONDS_PER_SLOT * 1000);
        }

        // peers may return incorrect empty range, or 1 block, or 2 blocks or unlinear chain segment
        // if we try the same peer it'll just return same result so switching peer here
        // TODO: We should downscore here, instead of adding another bad peer tracking system
        badPeers.add(peer.toB58String());

        // Try again
        continue;
      }

      // we queried from last fetched block
      const blocksWithoutFirst = blocks.filter(
        (signedBlock) =>
          !config.types.Root.equals(
            lastFetchCheckpoint.root,
            config.types.BeaconBlock.hashTreeRoot(signedBlock.message)
          )
      );

      // 0-1 block result should go through and we'll handle it in next round
      if (blocks.length > 1) {
        assertLinearChainSegment(config, blocks);
      }

      // return blocksWithoutFirst;

      // success, ignore last block (there should be >= 2 blocks) since we can't validate parent-child
      blocks.splice(blocks.length - 1, 1);
      const lastBlock = blocks[blocks.length - 1].message;
      lastFetchCheckpoint = {root: config.types.BeaconBlock.hashTreeRoot(lastBlock), slot: lastBlock.slot};
      return blocks;
    } catch (e) {
      logger.verbose("Regular Sync: Failed to get block range ", {...(slotRange ?? {}), error: e.message});

      // Okay to abort sync
      if (e instanceof ErrorAborted) {
        return [];
      }
    }
  }
}
