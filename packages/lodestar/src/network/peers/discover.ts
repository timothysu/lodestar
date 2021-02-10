import PeerId from "peer-id";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {ILogger} from "@chainsafe/lodestar-utils";
import {Discv5, Discv5Discovery} from "@chainsafe/discv5";
import {Libp2pPeerMetadataStore} from "./metastore";
import {getConnectedPeerIds} from "./utils";

/** Target number of peers we'd like to have connected to a given long-lived subnet */
const TARGET_SUBNET_PEERS = 6;

export type SubnetToDiscover = {
  subnetId: number;
  minTtl: number;
};

export type PeerDiscoveryOpts = {
  maxPeers: number;
};

export class PeerDiscovery {
  private libp2p: LibP2p;
  private logger: ILogger;
  private config: IBeaconConfig;
  private peerMetadataStore: Libp2pPeerMetadataStore;

  /** The maximum number of peers we allow (exceptions for subnet peers) */
  private maxPeers: number;

  constructor(
    libp2p: LibP2p,
    logger: ILogger,
    config: IBeaconConfig,
    peerMetadataStore: Libp2pPeerMetadataStore,
    opts: PeerDiscoveryOpts
  ) {
    this.libp2p = libp2p;
    this.logger = logger;
    this.config = config;
    this.peerMetadataStore = peerMetadataStore;
    this.maxPeers = opts.maxPeers;
  }

  /**
   * Request to find peers on a given subnet.
   */
  async discoverSubnetPeers(subnetsToDiscover: SubnetToDiscover[]): Promise<void> {
    const connectedPeers = getConnectedPeerIds(this.libp2p);
    const subnetsToDiscoverFiltered: typeof subnetsToDiscover = [];

    for (const subnet of subnetsToDiscover) {
      // TODO: Consider optimizing this to only deserialize metadata once
      const peersOnSubnet = connectedPeers.filter((peer) => this.peerMetadataStore.onSubnet(peer, subnet.subnetId));

      // Extend min_ttl of connected peers on required subnets
      for (const peer of peersOnSubnet) {
        const currentMinTtl = this.peerMetadataStore.getMinTtl(peer);
        // Don't overwrite longer TTL
        this.peerMetadataStore.setMinTtl(peer, Math.max(currentMinTtl, subnet.minTtl));
      }

      // Already have target number of peers, no need for subnet discovery
      const peersToDiscover = TARGET_SUBNET_PEERS - peersOnSubnet.length;
      if (peersToDiscover <= 0) {
        continue;
      }

      // TODO:
      // Queue an outgoing connection request to the cached peers that are on `s.subnet_id`.
      // If we connect to the cached peers before the discovery query starts, then we potentially
      // save a costly discovery query.

      // Get cached ENRs from the discovery service that are in the requested `subnetId`, but not connected yet
      const discPeersOnSubnet = await this.getDiscoveryPeersOnSubnet(subnet.subnetId, peersToDiscover);
      this.peersDiscovered(discPeersOnSubnet);

      // Query a discv5 query if more peers are needed
      if (TARGET_SUBNET_PEERS - peersOnSubnet.length - discPeersOnSubnet.length > 0) {
        subnetsToDiscoverFiltered.push(subnet);
      }
    }

    // Run a discv5 subnet query to try to discover new peers
    if (subnetsToDiscoverFiltered.length > 0) {
      void this.runSubnetQuery(subnetsToDiscoverFiltered.map((subnet) => subnet.subnetId));
    }
  }

  /**
   * List existing peers that declare being part of a target subnet
   */
  private async getDiscoveryPeersOnSubnet(subnet: number, maxPeersToDiscover: number): Promise<PeerId[]> {
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
      // this("peer", peer => {
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

  private async runSubnetQuery(subnets: number[]): Promise<void> {
    subnets;

    // TODO: Run a discv5 query for a specific set of queries
  }

  /**
   * Handles DiscoveryEvent::QueryResult
   * Peers that have been returned by discovery requests are dialed here if they are suitable.
   */
  private peersDiscovered(discoveredPeers: PeerId[]): void {
    const connectedPeersCount = getConnectedPeerIds(this.libp2p).length;
    const toDialPeers: PeerId[] = [];

    for (const peer of discoveredPeers) {
      if (
        connectedPeersCount + toDialPeers.length < this.maxPeers &&
        !this.libp2p.connectionManager.get(peer)
        // TODO:
        // && !this.peers.isBannedOrDisconnected(peer)
      ) {
        // we attempt a connection if this peer is a subnet peer or if the max peer count
        // is not yet filled (including dialing peers)
        toDialPeers.push(peer);
      }
    }

    for (const peer of toDialPeers) {
      // Note: PeerDiscovery adds the multiaddrTCP beforehand
      this.logger.debug("Dialing discovered peer", {peer: peer.toB58String()});

      // Note: `libp2p.dial()` is what libp2p.connectionManager autoDial calls
      // Note: You must listen to the connected events to listen for a successful conn upgrade
      this.libp2p.dial(peer).catch((e) => {
        this.logger.debug("Error dialing discovered peer", {peer: peer.toB58String()}, e);
      });
    }
  }
}
