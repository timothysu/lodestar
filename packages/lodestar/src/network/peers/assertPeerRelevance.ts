import {computeStartSlotAtEpoch, getBlockRootAtSlot} from "@chainsafe/lodestar-beacon-state-transition";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {Epoch, Root, Status} from "@chainsafe/lodestar-types";
import {toHexString} from "@chainsafe/ssz";
import {IBeaconChain} from "../../chain";
import {GENESIS_EPOCH} from "../../constants";

// TODO: Why this value? (From Lighthouse)
const FUTURE_SLOT_TOLERANCE = 1;

class IrrelevantNetworkPeer extends Error {}

/**
 * Process a `Status` message to determine if a peer is relevant to us. If the peer is
 * irrelevant the reason is returned.
 */
export async function assertPeerRelevance(remote: Status, chain: IBeaconChain, config: IBeaconConfig): Promise<void> {
  const local = await chain.getStatus();

  // The node is on a different network/fork
  if (!config.types.ForkDigest.equals(local.forkDigest, remote.forkDigest)) {
    throw new IrrelevantNetworkPeer(
      `Incompatible forks ours: ${toHexString(local.forkDigest)} Theirs: ${toHexString(remote.forkDigest)}`
    );
  }

  // The remote's head is on a slot that is significantly ahead of what we consider the
  // current slot. This could be because they are using a different genesis time, or that
  // their or our system's clock is incorrect.
  if (remote.headSlot > chain.clock.currentSlot + FUTURE_SLOT_TOLERANCE) {
    throw new IrrelevantNetworkPeer("Different system clocks or genesis time");
  }

  // TODO: Is this check necessary?
  if (remote.finalizedEpoch === GENESIS_EPOCH && !isZeroRoot(config, remote.finalizedRoot)) {
    throw new IrrelevantNetworkPeer("Genesis finalized root must be zeroed");
  }

  // The remote's finalized epoch is less than or equal to ours, but the block root is
  // different to the one in our chain. Therefore, the node is on a different chain and we
  // should not communicate with them.
  if (remote.finalizedEpoch === local.finalizedEpoch) {
    if (!config.types.Root.equals(remote.finalizedRoot, local.finalizedRoot)) {
      throw new IrrelevantNetworkPeer("Different finalized chain");
    }
  } else if (remote.finalizedEpoch < local.finalizedEpoch) {
    // This will get the latest known block at the start of the epoch.
    const localRoot = await getRootAtHistoricalEpoch(config, chain, remote.finalizedEpoch);
    if (!config.types.Root.equals(remote.finalizedRoot, localRoot)) {
      throw new IrrelevantNetworkPeer("Different finalized chain");
    }
  }

  // Note: Accept request status finalized checkpoint in the future, we do not know if it is a true finalized root
}

export function isZeroRoot(config: IBeaconConfig, root: Root): boolean {
  const ZERO_ROOT = config.types.Root.defaultValue();
  return config.types.Root.equals(root, ZERO_ROOT);
}

async function getRootAtHistoricalEpoch(config: IBeaconConfig, chain: IBeaconChain, epoch: Epoch): Promise<Root> {
  const headState = await chain.getHeadState();

  const slot = computeStartSlotAtEpoch(config, epoch);

  // This will get the latest known block at the start of the epoch.
  // NOTE: Throws if the epoch if from a long-ago epoch
  return getBlockRootAtSlot(config, headState, slot);

  // NOTE: Previous code tolerated long-ago epochs
  // ^^^^
  // finalized checkpoint of status is from an old long-ago epoch.
  // We need to ask the chain for most recent canonical block at the finalized checkpoint start slot.
  // The problem is that the slot may be a skip slot.
  // And the block root may be from multiple epochs back even.
  // The epoch in the checkpoint is there to checkpoint the tail end of skip slots, even if there is no block.
  // TODO: accepted for now. Need to maintain either a list of finalized block roots,
  // or inefficiently loop from finalized slot backwards, until we find the block we need to check against.
}
