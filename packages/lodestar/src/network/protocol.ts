import PeerId from "peer-id";
import {INetwork} from "./interface";

/**
 * TODO: Maybe used to filter peers that we know don't support a protocol
 */
export function peersThatSupportProtocols(network: INetwork, peers: PeerId[], protocols: string[]): PeerId[] {
  return peers.filter((peer) => {
    const libp2pPeer = network.getPeerFromPeerStore(peer);
    return (
      libp2pPeer &&
      (libp2pPeer.protocols.length === 0 || protocols.every((protocol) => libp2pPeer.protocols.includes(protocol)))
    );
  });
}
