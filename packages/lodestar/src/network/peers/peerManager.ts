import {EventEmitter} from "events";
import StrictEventEmitter from "strict-event-emitter-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {Metadata, Ping, Status} from "@chainsafe/lodestar-types";
import {Goodbye} from "@chainsafe/lodestar-types/src";
import {ILogger, LodestarError} from "@chainsafe/lodestar-utils";
import PeerId from "peer-id";
import {IBeaconChain} from "../../chain";
import {GoodByeReasonCode, GOODBYE_KNOWN_CODES} from "../../constants";
import {IBeaconMetrics} from "../../metrics";
import {IReqResp, ReqRespEvent} from "../reqresp";
import {Libp2pPeerMetadataStore} from "./metastore";
import {PeerDiscovery} from "./discover";
import {IPeerRpcScoreStore, ScoreState} from "./score";
import {
  getConnectedPeerIds,
  PeerMapDelay,
  SubnetMap,
  RequestedSubnet,
  assertPeerRelevance,
  prioritizePeers,
} from "./utils";

export enum PeerManagerEvent {
  /** A relevant peer has connected or has been re-STATUS'd */
  peerConnected = "PeerManager-peerConnected",
  peerDisconnected = "PeerManager-peerDisconnected",
}

type PeerManagerEvents = {
  [PeerManagerEvent.peerConnected]: (peer: PeerId, status: Status) => void;
  [PeerManagerEvent.peerDisconnected]: (peer: PeerId) => void;
};

type PeerManagerEmitter = StrictEventEmitter<EventEmitter, PeerManagerEvents>;

export interface IPeerManager extends PeerManagerEmitter {
  getConnectedPeerIds(): PeerId[];
  goodbyeAndDisconnectAllPeers(): Promise<void>;
  requestAttSubnets(requestedSubnets: RequestedSubnet[]): void;
  reStatusPeers(peers: PeerId[]): void;
}

/** heartbeat performs regular updates such as updating reputations and performing discovery requests */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
/** The time in seconds between PING events. We do not send a ping if the other peer has PING'd us */
const PING_INTERVAL_INBOUND_MS = 14 * 1000; // 1 second faster than lighthouse
const PING_INTERVAL_OUTBOUND_MS = 17 * 1000;
/** The time in seconds between re-status's peers. */
const STATUS_INTERVAL_MS = 5 * 60 * 1000;
/** Expect a STATUS request from on inbound peer for some time. Afterwards the node does a request */
const STATUS_INBOUND_GRACE_PERIOD = 15 * 1000;

// TODO:
// maxPeers and targetPeers should be dynamic on the num of validators connected
// The Node should compute a recomended value every interval and log a warning
// to terminal if it deviates significantly from the user's settings

export type PeerManagerOpts = {
  /** The target number of peers we would like to connect to. */
  targetPeers: number;
  /** The maximum number of peers we allow (exceptions for subnet peers) */
  maxPeers: number;
};

export type PeerManagerModules = {
  libp2p: LibP2p;
  reqResp: IReqResp;
  logger: ILogger;
  metrics: IBeaconMetrics;
  chain: IBeaconChain;
  config: IBeaconConfig;
  peerMetadata: Libp2pPeerMetadataStore;
  peerRpcScores: IPeerRpcScoreStore;
};

/**
 * Tasks:
 * - Ping peers every `PING_INTERVAL_MS`
 * - Status peers every `STATUS_INTERVAL_MS`
 * - Execute discovery query if under target peers
 * - Execute discovery query if need peers on some subnet: TODO
 * - Disconnect peers if over target peers
 */
export class PeerManager extends (EventEmitter as {new (): PeerManagerEmitter}) implements IPeerManager {
  // TODO: Reorg - TEMP
  private libp2p: LibP2p;
  private reqResp: IReqResp;
  private logger: ILogger;
  private metrics: IBeaconMetrics;
  private chain: IBeaconChain;
  private config: IBeaconConfig;
  private peerMetadata: Libp2pPeerMetadataStore;
  private peerRpcScores: IPeerRpcScoreStore;
  private discovery: PeerDiscovery;

  /** Map of PeerId -> Time of last PING'd request in ms */
  private peersToPingOutbound = new PeerMapDelay(PING_INTERVAL_INBOUND_MS);
  private peersToPingInbound = new PeerMapDelay(PING_INTERVAL_OUTBOUND_MS);
  /** Map of PeerId -> Time of last STATUS'd request in ms */
  private peersToStatus = new PeerMapDelay(STATUS_INTERVAL_MS);
  private opts: PeerManagerOpts;

  /** Map of subnets and the slot until they are needed */
  private subnets = new SubnetMap();

  constructor(modules: PeerManagerModules, opts: PeerManagerOpts, signal: AbortSignal) {
    super();
    this.libp2p = modules.libp2p;
    this.reqResp = modules.reqResp;
    this.logger = modules.logger;
    this.metrics = modules.metrics;
    this.chain = modules.chain;
    this.config = modules.config;
    this.peerMetadata = modules.peerMetadata;
    this.peerRpcScores = modules.peerRpcScores;
    this.opts = opts;

    this.discovery = new PeerDiscovery(modules, opts);

    const {libp2p, reqResp} = modules;
    libp2p.connectionManager.on("peer:connect", this.onLibp2pPeerConnect);
    libp2p.connectionManager.on("peer:disconnect", this.onLibp2pPeerDisconnect);
    reqResp.on(ReqRespEvent.receivedPing, this.onPing);
    reqResp.on(ReqRespEvent.receivedGoodbye, this.onGoodbye);
    reqResp.on(ReqRespEvent.receivedStatus, this.onStatus);

    const intervalPing = setInterval(() => this.pingAndStatusTimeouts(), 2 * 1000);
    const intervalHeartbeat = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);

    signal.addEventListener("abort", () => {
      libp2p.connectionManager.removeListener("peer:connect", this.onLibp2pPeerConnect);
      libp2p.connectionManager.removeListener("peer:disconnect", this.onLibp2pPeerDisconnect);
      reqResp.off(ReqRespEvent.receivedPing, this.onPing);
      reqResp.off(ReqRespEvent.receivedGoodbye, this.onGoodbye);
      reqResp.off(ReqRespEvent.receivedStatus, this.onStatus);

      clearInterval(intervalPing);
      clearInterval(intervalHeartbeat);
    });

    // On start-up will connected to existing peers in libp2p.peerStore, same as autoDial behaviour
    this.heartbeat();
  }

  /**
   * Return peers with at least one connection in status "open"
   */
  getConnectedPeerIds(): PeerId[] {
    return getConnectedPeerIds(this.libp2p);
  }

  async goodbyeAndDisconnectAllPeers(): Promise<void> {
    await Promise.all(
      // Filter by peers that support the goodbye protocol: {supportsProtocols: [goodbyeProtocol]}
      this.getConnectedPeerIds().map(async (peer) => this.goodbyeAndDisconnect(peer, GoodByeReasonCode.CLIENT_SHUTDOWN))
    );
  }

  /**
   * Request to find peers on a given subnet.
   */
  requestAttSubnets(requestedSubnets: RequestedSubnet[]): void {
    this.subnets.request(requestedSubnets);

    // TODO:
    // Only if the slot is more than epoch away, add an event to start looking for peers

    // Request to run heartbeat fn
    this.heartbeat();
  }

  /**
   * The app layer needs to refresh the status of some peers. The sync have reached a target
   */
  reStatusPeers(peers: PeerId[]): void {
    for (const peer of peers) this.peersToStatus.requestNow(peer);
    this.pingAndStatusTimeouts();
  }

  /**
   * Handle a PING request + response (rpc handler responds with PONG automatically)
   */
  private onPing = (peer: PeerId, seqNumber: Ping): void => {
    // if the sequence number is unknown update the peer's metadata
    const metadata = this.peerMetadata.metadata.get(peer);
    if (!metadata || metadata.seqNumber < seqNumber) {
      void this.requestMetadata(peer);
    }
  };

  /**
   * Handle a METADATA request + response (rpc handler responds with METADATA automatically)
   */
  private onMetadata = (peer: PeerId, metadata: Metadata): void => {
    // Store metadata always in case the peer updates attnets but not the sequence number
    // Trust that the peer always sends the latest metadata (From Lighthouse)
    this.peerMetadata.metadata.set(peer, metadata);
  };

  /**
   * Handle a GOODBYE request (rpc handler responds automatically)
   */
  private onGoodbye = (peer: PeerId, goodbyeReason: Goodbye): void => {
    const description = GOODBYE_KNOWN_CODES[goodbyeReason.toString()] || "";
    this.logger.verbose("Received goodbye request", {peer: peer.toB58String(), reason: goodbyeReason, description});

    // TODO: Consider register that we are banned, if discovery keeps attempting to connect to the same peers

    void this.disconnect(peer);
  };

  /**
   * Handle a STATUS request + response (rpc handler responds with STATUS automatically)
   */
  private onStatus = async (peer: PeerId, status: Status): Promise<void> => {
    // reset the to-status timer for this peer
    this.peersToStatus.requestAfter(peer);

    try {
      await assertPeerRelevance(status, this.chain, this.config);
    } catch (e) {
      this.logger.debug("Irrelevant peer", {
        peer: peer.toB58String(),
        reason: e instanceof LodestarError ? e.getMetadata() : e.message,
      });
      await this.goodbyeAndDisconnect(peer, GoodByeReasonCode.IRRELEVANT_NETWORK);
      return;
    }

    // Peer is usable, send it to the rangeSync
    // NOTE: Peer may not be connected anymore at this point, potential race condition
    // libp2p.connectionManager.get() returns not null if there's +1 open connections with `peer`
    if (this.libp2p.connectionManager.get(peer)) {
      this.emit(PeerManagerEvent.peerConnected, peer, status);
    }
  };

  private async requestMetadata(peer: PeerId): Promise<void> {
    try {
      this.onMetadata(peer, await this.reqResp.metadata(peer));
    } catch (e) {
      // TODO: Downvote peer here or in the reqResp layer
    }
  }

  private async requestPing(peer: PeerId): Promise<void> {
    try {
      this.onPing(peer, await this.reqResp.ping(peer));
    } catch (e) {
      // TODO: Downvote peer here or in the reqResp layer
    }
  }

  private async requestStatus(peer: PeerId, localStatus: Status): Promise<void> {
    try {
      await this.onStatus(peer, await this.reqResp.status(peer, localStatus));
    } catch (e) {
      // TODO: Failed to get peer latest status: downvote but don't disconnect
    }
  }

  private async requestStatusMany(peers: PeerId[]): Promise<void> {
    try {
      const localStatus = this.chain.getStatus();
      await Promise.all(peers.map(async (peer) => this.requestStatus(peer, localStatus)));
    } catch (e) {
      this.logger.verbose("Error requesting new status to peers", {}, e);
    }
  }

  /**
   * The Peer manager's heartbeat maintains the peer count and maintains peer reputations.
   * It will request discovery queries if the peer count has not reached the desired number of peers.
   * NOTE: Discovery should only add a new query if one isn't already queued.
   */
  private heartbeat(): void {
    const connectedPeers = this.getConnectedPeerIds();

    // ban and disconnect peers with bad score, collect rest of healthy peers
    const connectedHealthPeers: PeerId[] = [];
    for (const peer of connectedPeers) {
      switch (this.peerRpcScores.getScoreState(peer)) {
        case ScoreState.Banned:
          void this.goodbyeAndDisconnect(peer, GoodByeReasonCode.BANNED);
          break;
        case ScoreState.Disconnected:
          void this.goodbyeAndDisconnect(peer, GoodByeReasonCode.SCORE_TOO_LOW);
          break;
        case ScoreState.Healthy:
          connectedHealthPeers.push(peer);
      }
    }

    const {peersToDisconnect, discv5Queries, peersToConnect} = prioritizePeers(
      connectedPeers.map((peer) => ({
        id: peer,
        attnets: this.peerMetadata.metadata.get(peer)?.attnets ?? [],
        score: this.peerRpcScores.getScore(peer),
      })),
      // Collect subnets which we need peers for in the current slot
      this.subnets.getActive(this.chain.clock.currentSlot),
      this.opts
    );

    if (discv5Queries.length > 0) {
      // It's a promise due to crypto lib calls only
      void this.discovery.discoverSubnetPeers(discv5Queries);
    }

    if (peersToConnect > 0) {
      this.discovery.discoverPeers(peersToConnect);
    }

    for (const peer of peersToDisconnect) {
      void this.goodbyeAndDisconnect(peer, GoodByeReasonCode.TOO_MANY_PEERS);
    }
  }

  private pingAndStatusTimeouts(): void {
    // Every interval request to send some peers our seqNumber and process theirs
    // If the seqNumber is different it must request the new metadata
    const peersToPing = [...this.peersToPingInbound.pollNext(), ...this.peersToPingOutbound.pollNext()];
    for (const peer of peersToPing) {
      void this.requestPing(peer);
    }

    // TODO: Consider sending status request to peers that do support status protocol
    // {supportsProtocols: getStatusProtocols()}

    // Every interval request to send some peers our status, and process theirs
    // Must re-check if this peer is relevant to us and emit an event if the status changes
    // So the sync layer can update things
    const peersToStatus = this.peersToStatus.pollNext();
    if (peersToStatus.length > 0) {
      void this.requestStatusMany(peersToStatus);
    }
  }

  /**
   * The libp2p Upgrader has successfully upgraded a peer connection on a particular multiaddress
   * This event is routed through the connectionManager
   *
   * Registers a peer as connected. The `direction` parameter determines if the peer is being
   * dialed or connecting to us.
   */
  private onLibp2pPeerConnect = (libp2pConnection: LibP2pConnection): void => {
    const {direction, status} = libp2pConnection.stat;
    const peer = libp2pConnection.remotePeer;

    // On connection:
    // - Outbound connections: send a STATUS and PING request
    // - Inbound connections: expect to be STATUS'd, schedule STATUS and PING for latter
    // NOTE: libp2p may emit two "peer:connect" events: One for inbound, one for outbound
    // If that happens, it's okay. Only the "outbound" connection triggers immediate action
    if (direction === "outbound") {
      this.peersToStatus.requestNow(peer);
      this.peersToPingOutbound.requestNow(peer);
      this.peersToPingInbound.delete(peer);
    } else {
      this.peersToStatus.requestAfter(peer, STATUS_INBOUND_GRACE_PERIOD);
      this.peersToPingInbound.requestAfter(peer);
      this.peersToPingOutbound.delete(peer);
    }

    this.pingAndStatusTimeouts();

    this.logger.verbose("peer connected", {peerId: peer.toB58String(), direction, status});
    // NOTE: The peerConnect event is not emitted here here, but after asserting peer relevance
    this.runPeersMetrics();
  };

  /**
   * The libp2p Upgrader has ended a connection
   */
  private onLibp2pPeerDisconnect = (libp2pConnection: LibP2pConnection): void => {
    const {direction, status} = libp2pConnection.stat;
    const peer = libp2pConnection.remotePeer;

    // remove the ping and status timer for the peer
    this.peersToPingInbound.delete(peer);
    this.peersToPingOutbound.delete(peer);
    this.peersToStatus.delete(peer);

    this.libp2p.connectionManager.connections;

    this.logger.verbose("peer disconnected", {peerId: peer.toB58String(), direction, status});
    this.emit(PeerManagerEvent.peerDisconnected, peer);
    this.runPeersMetrics(); // Last in case it throws
  };

  private async disconnect(peerId: PeerId): Promise<void> {
    try {
      await this.libp2p.hangUp(peerId);
    } catch (e) {
      this.logger.warn("Unclean disconnect", {reason: e.message});
    }
  }

  private async goodbyeAndDisconnect(peer: PeerId, reason: GoodByeReasonCode): Promise<void> {
    try {
      await this.reqResp.goodbye(peer, BigInt(reason));
    } catch (e) {
      this.logger.verbose("Failed to send goodbye", {error: e.message});
      await this.disconnect(peer);
    }
  }

  /** Register peer count metrics */
  private runPeersMetrics(): void {
    let total = 0;
    const peersByDirection = new Map<string, number>();
    for (const connections of this.libp2p.connectionManager.connections.values()) {
      const cnx = connections.find((cnx) => cnx.stat.status === "open");
      if (cnx) {
        const direction = cnx.stat.direction;
        peersByDirection.set(direction, 1 + (peersByDirection.get(direction) ?? 0));
        total++;
      }
    }

    for (const [direction, peers] of peersByDirection.entries()) {
      this.metrics.peersByDirection.set({direction}, peers);
    }

    this.metrics.peers.set(total);
  }
}
