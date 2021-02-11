import PeerId from "peer-id";
import {AttestationSubnets} from "@chainsafe/lodestar-types";
import {shuffle} from "../../util/shuffle";
import {sortBy} from "../../util/sortBy";
import {Discv5Query} from "./interface";

/** Target number of peers we'd like to have connected to a given long-lived subnet */
const MAX_TARGET_SUBNET_PEERS = 6;

/**
 * Prioritize which peers to disconect and which to connect. Conditions:
 * - Reach `targetPeers`
 * - Don't exceed `maxPeers`
 * - Ensure there are enough peers per active subnet
 * - Prioritize peers with good score
 */
export function prioritizePeers(
  connectedPeers: {id: PeerId; attnets: AttestationSubnets; score: number}[],
  activeSubnetIds: number[],
  {targetPeers, maxPeers}: {targetPeers: number; maxPeers: number}
): {peersToDisconnect: PeerId[]; peersToConnect: number; discv5Queries: Discv5Query[]} {
  const peersToDisconnect: PeerId[] = [];
  let peersToConnect = 0;
  const discv5Queries: Discv5Query[] = [];

  // Dynamically compute TARGET_PEERS_PER_SUBNET
  const targetPeersPerSubnet = Math.min(
    MAX_TARGET_SUBNET_PEERS,
    Math.max(1, Math.floor(maxPeers / activeSubnetIds.length))
  );

  // We want `targetPeersPerSubnet` for each `activeSubnets`
  const peerHasDuty = new Map<string, boolean>();

  if (activeSubnetIds.length > 0) {
    /** Map of peers per subnet, peer may be in multiple arrays */
    const peersPerSubnet = new Map<number, number>();

    for (const peer of connectedPeers) {
      const attnets = peer.attnets;
      for (const subnetId of activeSubnetIds) {
        if (attnets && attnets[subnetId]) {
          peerHasDuty.set(peer.id.toB58String(), true);
          peersPerSubnet.set(subnetId, 1 + (peersPerSubnet.get(subnetId) || 0));
        }
      }
    }

    for (const subnetId of activeSubnetIds) {
      const peers = peersPerSubnet.get(subnetId) ?? 0;
      if (peers < targetPeersPerSubnet) {
        // We need more peers
        discv5Queries.push({subnetId, maxPeersToDiscover: targetPeersPerSubnet - peers});
      }
    }
  }

  const peerCount = connectedPeers.length;

  if (peerCount < targetPeers) {
    // Need more peers,
    peersToConnect = targetPeers - peerCount;
  } else if (peerCount > targetPeers) {
    // Too much peers, disconnect worst

    // Current peer sorting:
    // - All connected with no future duty, sorted by score (worst first) (ties broken random)

    // TODO: Priotize peers for disconection better, don't just filter by duty but
    // reduce their probability of being disconected, mantaining `targetPeersPerSubnet`

    const connectedPeersWithoutDuty = connectedPeers.filter((peer) => !peerHasDuty.get(peer.id.toB58String()));
    const worstPeers = sortBy(shuffle(connectedPeersWithoutDuty), (peer) => peer.score);
    for (const peer of worstPeers.slice(0, peerCount - targetPeers)) {
      peersToDisconnect.push(peer.id);
    }
  }

  return {
    peersToDisconnect,
    peersToConnect,
    discv5Queries,
  };
}
