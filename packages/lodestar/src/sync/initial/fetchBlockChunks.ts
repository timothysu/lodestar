import PeerId from "peer-id";
import {AbortSignal} from "abort-controller";
import {SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {sleep, withTimeout} from "@chainsafe/lodestar-utils";
import {ILogger} from "@chainsafe/lodestar-utils";
import {IReqResp} from "../../network";
import {ISlotRange} from "../interface";
import {getBlockRange} from "../utils";

// timeout for getBlockRange is 3 minutes
const GET_BLOCK_RANGE_TIMEOUT = 3 * 60 * 1000;

export async function fetchBlockChunks(
  slotRange: ISlotRange,
  logger: ILogger,
  reqResp: IReqResp,
  getPeers: () => Promise<PeerId[]>,
  signal?: AbortSignal
): Promise<SignedBeaconBlock[] | null> {
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
    return null;
  }
  try {
    // a work around of timeout issue that cause our sync stall
    return await withTimeout(
      async () => await getBlockRange(logger, reqResp, peers, slotRange),
      GET_BLOCK_RANGE_TIMEOUT,
      signal
    );
  } catch (e) {
    logger.debug("Failed to get block range", {...slotRange}, e);
    return null;
  }
}
