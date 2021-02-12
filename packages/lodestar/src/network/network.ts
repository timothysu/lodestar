/**
 * @module network
 */

import {EventEmitter} from "events";
import {AbortController} from "abort-controller";
import LibP2p from "libp2p";
import PeerId from "peer-id";
import Multiaddr from "multiaddr";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {ILogger} from "@chainsafe/lodestar-utils";
import {IBeaconMetrics} from "../metrics";
import {ReqResp, IReqRespOptions} from "./reqresp/reqResp";
import {INetworkOptions} from "./options";
import {INetwork, NetworkEventEmitter} from "./interface";
import {Gossip} from "./gossip/gossip";
import {IGossip, IGossipMessageValidator} from "./gossip/interface";
import {IBeaconChain} from "../chain";
import {MetadataController} from "./metadata";
import {Discv5Discovery, ENR} from "@chainsafe/discv5";
import {IPeerMetadataStore, RequestedSubnet} from "./peers";
import {Libp2pPeerMetadataStore} from "./peers/metastore";
import {PeerManager} from "./peers/peerManager";
import {IPeerRpcScoreStore, SimpleRpcScore} from "./peers/score";
import {IReqRespHandler} from "./reqresp/handlers";

// peer connection
// - If more peers are needed, run a discv5 query
// - Prioritize the discovered peers and maybe connect to some
// - On outbound connection:
//   1. Send STATUS, receive STATUS
//   2. Check if peer status is relevant:
//     YES: Register peer as usable by sync
//     NO: Disconnect peer
// - On inbound connection:
//      Expect STATUS message, repeat process above
// - Every interval:
//   - Ping pending peers
//   - Status pending peers
//   - Run heartbeat:
//     - Disconnect peers with very bad scores
//     - Prioritize existing peers and run discv5 query if necessary

interface ILibp2pModules {
  config: IBeaconConfig;
  libp2p: LibP2p;
  logger: ILogger;
  metrics: IBeaconMetrics;
  validator: IGossipMessageValidator;
  chain: IBeaconChain;
  reqRespHandler: IReqRespHandler;
}

export class Libp2pNetwork extends (EventEmitter as {new (): NetworkEventEmitter}) implements INetwork {
  public reqResp: ReqResp;
  public gossip: IGossip;
  public metadata: MetadataController;
  public peerMetadata: IPeerMetadataStore;
  public peerRpcScores: IPeerRpcScoreStore;

  public peerManager: PeerManager;
  private opts: INetworkOptions;
  private config: IBeaconConfig;
  private libp2p: LibP2p;
  private logger: ILogger;
  private metrics: IBeaconMetrics;
  private controller = new AbortController();

  public constructor(
    opts: INetworkOptions & IReqRespOptions,
    {config, libp2p, logger, metrics, validator, chain, reqRespHandler}: ILibp2pModules
  ) {
    super();
    this.opts = opts;
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.libp2p = libp2p;
    const metadata = new MetadataController({}, {config, chain, logger});
    const peerMetadata = new Libp2pPeerMetadataStore(config, libp2p.peerStore.metadataBook);
    const peerRpcScores = new SimpleRpcScore(peerMetadata);
    this.metadata = metadata;
    this.peerMetadata = peerMetadata;
    this.peerRpcScores = peerRpcScores;
    this.reqResp = new ReqResp({config, libp2p, reqRespHandler, peerMetadata, metadata, peerRpcScores, logger}, opts);
    this.gossip = (new Gossip(opts, {config, libp2p, logger, validator, chain}) as unknown) as IGossip;

    this.peerManager = new PeerManager(
      libp2p,
      this.reqResp,
      logger,
      metrics,
      chain,
      config,
      this.controller.signal,
      peerMetadata,
      peerRpcScores,
      {targetPeers: opts.minPeers, maxPeers: opts.maxPeers}
    );
  }

  public async start(): Promise<void> {
    this.controller = new AbortController();
    await this.libp2p.start();
    this.reqResp.start();
    await this.metadata.start(this.getEnr()!);
    await this.gossip.start();
    const multiaddresses = this.libp2p.multiaddrs.map((m) => m.toString()).join(",");
    this.logger.info(`PeerId ${this.libp2p.peerId.toB58String()}, Multiaddrs ${multiaddresses}`);
  }

  public async stop(): Promise<void> {
    this.controller.abort();
    // Must goodbye and disconnect before stopping libp2p
    await this.peerManager.goodbyeAndDisconnectAllPeers();
    await this.metadata.stop();
    await this.gossip.stop();
    this.reqResp.stop();
    await this.libp2p.stop();
  }

  get localMultiaddrs(): Multiaddr[] {
    return this.libp2p.multiaddrs;
  }

  get peerId(): PeerId {
    return this.libp2p.peerId;
  }

  public getEnr(): ENR | undefined {
    const discv5Discovery = this.libp2p._discovery.get("discv5") as Discv5Discovery;
    return discv5Discovery?.discv5?.enr ?? undefined;
  }

  public getConnectionsByPeer(): Map<string, LibP2pConnection[]> {
    return this.libp2p.connectionManager.connections;
  }

  public getPeerFromPeerStore(peer: PeerId): LibP2p.Peer | null {
    return this.libp2p.peerStore.get(peer) ?? null;
  }

  public subscribeCoreTopics(): void {
    // TODO:
  }

  /**
   * Request att subnets up `toSlot`. Network will ensure to mantain some peers for each
   */
  public async requestAttSubnets(requestedSubnets: RequestedSubnet[]): Promise<void> {
    // TODO: Attach min_ttl to the requested subnets and connect to them
    // this.peerManager.discoverSubnetPeers(subnets);
    await this.peerManager.requestAttSubnets(requestedSubnets);
  }
}
