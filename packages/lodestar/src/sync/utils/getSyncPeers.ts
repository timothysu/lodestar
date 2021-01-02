import {getSyncProtocols, INetwork} from "../../network";
import PeerId from "peer-id";

export type PeerFilterConditionCallback = (peer: PeerId) => boolean;

export function getGoodPeersToSyncFrom(
  network: INetwork,
  condition: PeerFilterConditionCallback = () => true,
  maxPeers = 10,
  minScore = 60
): PeerId[] {
  return network
    .getPeers({connected: true, supportsProtocols: getSyncProtocols()})
    .map((peer) => peer.id)
    .filter((peer) => network.peerRpcScores.getScore(peer) > minScore && condition(peer))
    .sort((p1, p2) => network.peerRpcScores.getScore(p2) - network.peerRpcScores.getScore(p1))
    .slice(0, maxPeers);
}
