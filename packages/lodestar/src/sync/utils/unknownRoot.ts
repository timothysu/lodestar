import PeerId, {createFromCID} from "peer-id";
import {Root, SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {List} from "@chainsafe/ssz";
import {getUnknownRootProtocols, INetwork} from "../../network";
import {peersThatSupportProtocols} from "../../network/protocol";
import {RoundRobinArray} from "./robin";

export async function fetchUnknownBlockRoot(unknownAncestorRoot: Root, network: INetwork): Promise<SignedBeaconBlock> {
  const unknownRootPeers = getUnknownRootPeers(network);
  const maxRetries = unknownRootPeers.length;
  const peerBalancer = new RoundRobinArray(unknownRootPeers);
  let retry = 0;

  while (retry < maxRetries) {
    const peer = peerBalancer.next();
    if (!peer) {
      break;
    }

    const blocks = await network.reqResp.beaconBlocksByRoot(peer, [unknownAncestorRoot] as List<Root>);
    if (blocks && blocks[0]) {
      return blocks[0];
    }

    retry++;
  }

  throw Error(`Max retries ${maxRetries}`);
}

function getUnknownRootPeers(network: INetwork): PeerId[] {
  const peerIdStrs = Array.from(network.getConnectionsByPeer().keys());
  const peerIds = peerIdStrs.map((peerIdStr) => createFromCID(peerIdStr));

  return peersThatSupportProtocols(network, peerIds, getUnknownRootProtocols()).filter(
    (peer) => !!network.peerMetadata.getStatus(peer) && network.peerRpcScores.getScore(peer) > 50
  );
}
