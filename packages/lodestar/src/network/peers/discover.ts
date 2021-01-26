import LibP2p from "libp2p";
import PeerId from "peer-id";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {ILogger} from "@chainsafe/lodestar-utils";
import {Discv5, Discv5Discovery} from "@chainsafe/discv5";

export class PeerDiscovery {
  libp2p: LibP2p;
  logger: ILogger;
  config: IBeaconConfig;

  constructor(libp2p: LibP2p, logger: ILogger, config: IBeaconConfig) {
    this.libp2p = libp2p;
    this.logger = logger;
    this.config = config;
  }

  /**
   * List existing peers that declare being part of a target subnet
   */
  async getDiscoveryPeersOnSubnet(subnet: number, maxPeersToDiscover: number): Promise<PeerId[]> {
    const discovery: Discv5Discovery = this.libp2p._discovery.get("discv5") as Discv5Discovery;
    const discv5: Discv5 = discovery.discv5;

    const peersOnSubnet: PeerId[] = [];

    for (const enr of discv5.kadValues()) {
      if (peersOnSubnet.length > maxPeersToDiscover) {
        break;
      }

      // Regular peer flow: discv5 and libp2p add the multiaddr for TCP to the address book and ignore peers without
      // ````
      // const multiaddrTCP = enr.getLocationMultiaddr("tcp");
      // if (!multiaddrTCP) return;
      // this.emit("peer", { id: await enr.peerId(), multiaddrs: [multiaddrTCP] });
      // ```
      // https://github.com/ChainSafe/discv5/blob/671a9ac8ec59ba9ad6dcce566036ce4758fe50a7/src/libp2p/discv5.ts
      //
      // ```
      // this.discovery("peer", peer => {
      //   if (peer.multiaddrs) this.peerStore.addressBook.add(peer.id, peer.multiaddrs)
      // })
      // ```
      // https://github.com/libp2p/js-libp2p/blob/aec8e3d3bb1b245051b60c2a890550d262d5b062/src/index.js#L638

      try {
        const attnets = enr.get("attnets");
        if (attnets && this.config.types.AttestationSubnets.deserialize(attnets)[subnet]) {
          // async because peerId runs some crypto lib
          const peerId = await enr.peerId();

          const multiaddrTCP = enr.getLocationMultiaddr("tcp");
          if (multiaddrTCP) {
            this.libp2p.peerStore.addressBook.add(peerId, [multiaddrTCP]);
            peersOnSubnet.push(peerId);
          }
        }
      } catch (e) {
        this.logger.debug("Error deserializing ENR", {nodeId: enr.nodeId}, e);
      }
    }

    return peersOnSubnet;
  }

  async runSubnetQuery(subnets: number[]): Promise<void> {
    subnets;

    // TODO: Run a discv5 query for a specific set of queries
  }
}
