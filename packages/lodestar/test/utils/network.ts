import {ENR, Discv5Discovery} from "@chainsafe/discv5";
import Bootstrap from "libp2p-bootstrap";
import MDNS from "libp2p-mdns";
import PeerId from "peer-id";
import Multiaddr from "multiaddr";
import {Libp2pNetwork} from "../../src/network";
import {NodejsNode} from "../../src/network/nodejs";
import {createPeerId} from "../../src/network";
import {defaultDiscv5Options} from "../../src/network/options";
import {ATTESTATION_SUBNET_COUNT} from "../../src/constants";

export async function createNode(
  multiaddr: string,
  inPeerId?: PeerId,
  peerDiscovery?: (typeof Bootstrap | typeof MDNS | typeof Discv5Discovery)[]
): Promise<NodejsNode> {
  const peerId = inPeerId || (await createPeerId());
  const enr = ENR.createFromPeerId(peerId);
  const randomPort = Math.round(Math.random() * 40000) + 1000;
  const bindAddr = `/ip4/127.0.0.1/udp/${randomPort}`;
  return new NodejsNode({
    peerId,
    addresses: {listen: [multiaddr]},
    autoDial: false,
    discv5: {...defaultDiscv5Options, enr, bindAddr},
    peerDiscovery,
  });
}

// Helpers to manipulate network's libp2p instance for testing only

export async function connect(network: Libp2pNetwork, peer: PeerId, multiaddr: Multiaddr[]): Promise<void> {
  network["libp2p"].peerStore.addressBook.add(peer, multiaddr);
  await network["libp2p"].dial(peer);
}

export async function disconnect(network: Libp2pNetwork, peer: PeerId): Promise<void> {
  await network["libp2p"].hangUp(peer);
}

export function onPeerConnect(network: Libp2pNetwork): Promise<void> {
  return new Promise<void>((resolve) => network["libp2p"].connectionManager.on("peer:connect", () => resolve()));
}

export function onPeerDisconnect(network: Libp2pNetwork): Promise<void> {
  return new Promise<void>((resolve) => network["libp2p"].connectionManager.on("peer:disconnect", () => resolve()));
}

/**
 * Generate valid filled attnets BitVector
 */
export function getAttnets(subnetIds: number[] = []): boolean[] {
  const attnets = new Array(ATTESTATION_SUBNET_COUNT).fill(false);
  for (const subnetId of subnetIds) {
    attnets[subnetId] = true;
  }
  return attnets;
}
