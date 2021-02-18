/**
 * @module network
 */
import {ENR} from "@chainsafe/discv5/lib";
import {EventEmitter} from "events";
import Multiaddr from "multiaddr";
import PeerId from "peer-id";
import StrictEventEmitter from "strict-event-emitter-types";
import {IGossip} from "./gossip/interface";
import {MetadataController} from "./metadata";
import {IPeerMetadataStore, RequestedSubnet} from "./peers/interface";
import {PeerManager} from "./peers/peerManager";
import {IPeerRpcScoreStore} from "./peers/score";
import {IReqResp} from "./reqresp";

export enum NetworkEvent {
  peerConnect = "peer:connect",
  peerDisconnect = "peer:disconnect",
  gossipStart = "gossip:start",
  gossipStop = "gossip:stop",
  gossipHeartbeat = "gossipsub:heartbeat",
}

export interface INetworkEvents {
  [NetworkEvent.peerConnect]: (peerId: PeerId, direction: PeerDirection) => void;
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
  peerRpcScores: IPeerRpcScoreStore;
  peerManager: PeerManager;
  /** Our network identity */
  peerId: PeerId;
  localMultiaddrs: Multiaddr[];
  getEnr(): ENR | undefined;
  getConnectionsByPeer(): Map<string, LibP2pConnection[]>;
  getConnectedPeers(): PeerId[];
  /** Search peers joining subnets */
  requestAttSubnets(requestedSubnets: RequestedSubnet[]): void;
  reStatusPeers(peers: PeerId[]): void;
  // Service
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type PeerDirection = LibP2pConnection["stat"]["direction"];
export type PeerStatus = LibP2pConnection["stat"]["status"];
export type PeerState = "disconnected" | "connecting" | "connected" | "disconnecting";
