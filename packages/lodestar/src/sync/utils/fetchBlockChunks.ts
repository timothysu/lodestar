import PeerId from "peer-id";
import {AbortSignal} from "abort-controller";
import {SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {sleep} from "@chainsafe/lodestar-utils";
import {ILogger} from "@chainsafe/lodestar-utils";
import {IReqResp} from "../../network";
import {ISlotRange} from "../interface";
import {getBlockRange} from "./getBlockRange";

// timeout for getBlockRange is 3 minutes
const GET_BLOCK_RANGE_TIMEOUT = 3 * 60 * 1000;

export function fetchBlockChunks(
  logger: ILogger,
  reqResp: IReqResp,
  getPeers: () => Promise<PeerId[]>,
  signal?: AbortSignal
): (source: AsyncIterable<ISlotRange>) => AsyncGenerator<SignedBeaconBlock[] | null> {
  return async function* (source) {
    for await (const slotRange of source) {
      let peers = await getPeers();
      let retry = 0;
      while (peers.length === 0 && retry < 5) {
        logger.info("Waiting for peers...");
        await sleep(6000, signal);
        peers = await getPeers();
        retry++;
      }
      if (peers.length === 0) {
        logger.error("Can't find new peers");
        yield null;
        return;
      }
      try {
        // a work around of timeout issue that cause our sync stall
        let timer: NodeJS.Timeout | null = null;
        yield (await Promise.race([
          getBlockRange(logger, reqResp, peers, slotRange),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error("beacon_blocks_by_range timeout"));
            }, GET_BLOCK_RANGE_TIMEOUT);
          }),
        ])) as SignedBeaconBlock[] | null;
        if (timer) clearTimeout(timer);
      } catch (e) {
        logger.debug("Failed to get block range", {...slotRange}, e);
        yield null;
        return;
      }
    }
  };
}
