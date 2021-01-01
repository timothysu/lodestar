import {Status} from "@chainsafe/lodestar-types";
import {getStatusProtocols, INetwork} from "../../network";

/**
 * Send status request to all connected peers and store their status replies in peerMetadata
 * @param network
 * @param status
 */
export async function sendStatusToAllPeers(network: INetwork, status: Status): Promise<void> {
  await Promise.all(
    network.getPeers({connected: true, supportsProtocols: getStatusProtocols()}).map(async (peer) => {
      try {
        network.peerMetadata.setStatus(peer.id, await network.reqResp.status(peer.id, status));
        // eslint-disable-next-line no-empty
      } catch {}
    })
  );
}
