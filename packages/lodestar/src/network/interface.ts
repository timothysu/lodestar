/**
 * @module network
 */
import {ENR} from "@chainsafe/discv5/lib";
import {
  BeaconBlocksByRangeRequest,
  BeaconBlocksByRootRequest,
  Goodbye,
  Metadata,
  Ping,
  SignedBeaconBlock,
  Status,
} from "@chainsafe/lodestar-types";
import {EventEmitter} from "events";
import Multiaddr from "multiaddr";
import PeerId from "peer-id";
import StrictEventEmitter from "strict-event-emitter-types";
import {IGossip} from "./gossip/interface";
import {MetadataController} from "./metadata";
import {IPeerMetadataStore} from "./peers/interface";
import {PeerManager} from "./peers/peerManager";
import {IRpcScoreTracker} from "./peers/score";

export interface IReqResp {
  status(peerId: PeerId, request: Status): Promise<Status>;
  goodbye(peerId: PeerId, request: Goodbye): Promise<void>;
  ping(peerId: PeerId, request: Ping): Promise<Ping>;
  metadata(peerId: PeerId): Promise<Metadata>;
  beaconBlocksByRange(peerId: PeerId, request: BeaconBlocksByRangeRequest): Promise<SignedBeaconBlock[]>;
  beaconBlocksByRoot(peerId: PeerId, request: BeaconBlocksByRootRequest): Promise<SignedBeaconBlock[]>;
}

export enum NetworkEvent {
  peerConnect = "peer:connect",
  peerDisconnect = "peer:disconnect",
  gossipStart = "gossip:start",
  gossipStop = "gossip:stop",
  gossipHeartbeat = "gossipsub:heartbeat",
}

export interface INetworkEvents {
  [NetworkEvent.peerConnect]: (peerId: PeerId, direction: "inbound" | "outbound") => void;
  [NetworkEvent.peerDisconnect]: (peerId: PeerId) => void;
}
export type NetworkEventEmitter = StrictEventEmitter<EventEmitter, INetworkEvents>;

export type PeerSearchOptions = {
  supportsProtocols?: string[];
  count?: number;
};

export interface INetwork extends NetworkEventEmitter {
  reqResp: IReqResp;
  gossip: IGossip;
  metadata: MetadataController;
  peerMetadata: IPeerMetadataStore;
  peerRpcScores: IRpcScoreTracker;
  peerManager: PeerManager;
  /** Our network identity */
  peerId: PeerId;
  localMultiaddrs: Multiaddr[];
  getEnr(): ENR | undefined;
  getConnectionsByPeer(): Map<string, LibP2pConnection[]>;
  getPeerFromPeerStore(peer: PeerId): LibP2p.Peer | null;
  /** Search peers joining subnets */
  searchSubnetPeers(subnets: number[]): Promise<void>;
  subscribeCoreTopics(): void;
  // Service
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type PeerDirection = LibP2pConnection["stat"]["direction"];
export type PeerStatus = LibP2pConnection["stat"]["status"];
export type PeerState = "disconnected" | "connecting" | "connected" | "disconnecting";
