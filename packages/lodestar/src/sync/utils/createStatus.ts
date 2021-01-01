import {Status} from "@chainsafe/lodestar-types";
import {IBeaconChain} from "../../chain";
import {GENESIS_EPOCH, ZERO_HASH} from "../../constants";

export async function createStatus(chain: IBeaconChain): Promise<Status> {
  const head = chain.forkChoice.getHead();
  const finalizedCheckpoint = chain.forkChoice.getFinalizedCheckpoint();
  return {
    forkDigest: await chain.getForkDigest(),
    finalizedRoot: finalizedCheckpoint.epoch === GENESIS_EPOCH ? ZERO_HASH : finalizedCheckpoint.root,
    finalizedEpoch: finalizedCheckpoint.epoch,
    headRoot: head.blockRoot,
    headSlot: head.slot,
  };
}
