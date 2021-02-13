import {EventEmitter} from "events";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import PeerId from "peer-id";
import StrictEventEmitter from "strict-event-emitter-types";
import {ILogger} from "@chainsafe/lodestar-utils";
import {
  RequestBody,
  ResponseBody,
  Ping,
  Goodbye,
  Status,
  BeaconBlocksByRangeRequest,
  BeaconBlocksByRootRequest,
  Metadata,
  SignedBeaconBlock,
} from "@chainsafe/lodestar-types";
import {Method, Methods} from "../../constants";
import {IPeerMetadataStore, IPeerRpcScoreStore} from "../peers";

export enum ReqRespEvent {
  receivedPing = "ReqResp-receivedPing",
  receivedGoodbye = "ReqResp-receivedGoodbye",
  receivedStatus = "ReqResp-receivedStatus",
}

export type ReqRespEvents = {
  [ReqRespEvent.receivedPing]: (peer: PeerId, seqNumber: Ping) => void;
  [ReqRespEvent.receivedGoodbye]: (peer: PeerId, goodbye: Goodbye) => void;
  [ReqRespEvent.receivedStatus]: (peer: PeerId, status: Status) => void;
};

export type ReqRespEmitter = StrictEventEmitter<EventEmitter, ReqRespEvents>;

export interface IReqResp extends ReqRespEmitter {
  status(peerId: PeerId, request: Status): Promise<Status>;
  goodbye(peerId: PeerId, request: Goodbye): Promise<void>;
  ping(peerId: PeerId): Promise<Ping>;
  metadata(peerId: PeerId): Promise<Metadata>;
  beaconBlocksByRange(peerId: PeerId, request: BeaconBlocksByRangeRequest): Promise<SignedBeaconBlock[]>;
  beaconBlocksByRoot(peerId: PeerId, request: BeaconBlocksByRootRequest): Promise<SignedBeaconBlock[]>;
}

export interface IReqRespModules {
  config: IBeaconConfig;
  libp2p: LibP2p;
  logger: ILogger;
  peerMetadata: IPeerMetadataStore;
  peerRpcScores: IPeerRpcScoreStore;
}

export type RequestOrResponseType = Exclude<
  ReturnType<typeof Methods[Method]["responseSSZType"]> | ReturnType<typeof Methods[Method]["requestSSZType"]>,
  null
>;

export type RequestOrResponseBody = ResponseBody | RequestBody;

/**
 * Stream types from libp2p.dialProtocol are too vage and cause compilation type issues
 * These source and sink types are more precise to our usage
 */
export interface ILibP2pStream {
  source: AsyncIterable<Buffer>;
  sink: (source: AsyncIterable<Buffer>) => Promise<void>;
  close: () => void;
  reset: () => void;
}
