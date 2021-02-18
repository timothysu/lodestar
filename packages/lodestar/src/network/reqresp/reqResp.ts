/**
 * @module network
 */
import {EventEmitter} from "events";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {
  BeaconBlocksByRangeRequest,
  BeaconBlocksByRootRequest,
  Goodbye,
  Metadata,
  Ping,
  RequestBody,
  ResponseBody,
  SignedBeaconBlock,
  Status,
} from "@chainsafe/lodestar-types";
import {ILogger} from "@chainsafe/lodestar-utils";
import {AbortController} from "abort-controller";
import LibP2p from "libp2p";
import PeerId from "peer-id";
import {IReqResp, ReqRespEvent, ReqRespEmitter, IReqRespModules, ILibP2pStream} from "./interface";
import {sendRequest} from "./request";
import {handleRequest} from "./response";
import {Method, ReqRespEncoding, timeoutOptions} from "../../constants";
import {onOutgoingReqRespError} from "./score";
import {IPeerMetadataStore} from "../peers/interface";
import {IPeerRpcScoreStore} from "../peers/score";
import {createRpcProtocol} from "../util";
import {MetadataController} from "../metadata";
import {IReqRespHandler} from "./handlers";

export type IReqRespOptions = Partial<typeof timeoutOptions>;

/**
 * Implementation of eth2 p2p Req/Resp domain.
 * For the spec that this code is based on, see:
 * https://github.com/ethereum/eth2.0-specs/blob/dev/specs/phase0/p2p-interface.md#the-reqresp-domain
 */
export class ReqResp extends (EventEmitter as {new (): ReqRespEmitter}) implements IReqResp {
  private config: IBeaconConfig;
  private libp2p: LibP2p;
  private logger: ILogger;
  private reqRespHandler: IReqRespHandler;
  private metadataController: MetadataController;
  private peerMetadata: IPeerMetadataStore;
  private peerRpcScores: IPeerRpcScoreStore;
  private controller: AbortController | undefined;
  private options?: IReqRespOptions;
  private reqCount = 0;
  private respCount = 0;

  public constructor(
    modules: IReqRespModules & {metadata: MetadataController; reqRespHandler: IReqRespHandler},
    options?: IReqRespOptions
  ) {
    super();
    this.config = modules.config;
    this.libp2p = modules.libp2p;
    this.reqRespHandler = modules.reqRespHandler;
    this.peerMetadata = modules.peerMetadata;
    this.metadataController = modules.metadata;
    this.logger = modules.logger;
    this.peerRpcScores = modules.peerRpcScores;
    this.options = options;
  }

  public start(): void {
    this.controller = new AbortController();
    for (const method of Object.values(Method)) {
      for (const encoding of Object.values(ReqRespEncoding)) {
        this.libp2p.handle(createRpcProtocol(method, encoding), async ({connection, stream}) => {
          const peerId = connection.remotePeer;

          // TODO: Do we really need this now that there is only one encoding?
          // Remember the prefered encoding of this peer
          if (method === Method.Status) {
            this.peerMetadata.encoding.set(peerId, encoding);
          }

          try {
            await handleRequest(
              {config: this.config, logger: this.logger},
              this.onRequest.bind(this),
              stream as ILibP2pStream,
              peerId,
              method,
              encoding,
              this.respCount++
            );
            // TODO: Do success peer scoring here
          } catch (e) {
            // TODO: Do error peer scoring here
            // Must not throw since this is an event handler
          }
        });
      }
    }
  }

  public stop(): void {
    for (const method of Object.values(Method)) {
      for (const encoding of Object.values(ReqRespEncoding)) {
        this.libp2p.unhandle(createRpcProtocol(method, encoding));
      }
    }
    this.controller?.abort();
  }

  public async status(peerId: PeerId, request: Status): Promise<Status> {
    return await this.sendRequest<Status>(peerId, Method.Status, request);
  }

  public async goodbye(peerId: PeerId, request: Goodbye): Promise<void> {
    // NOTE: Responding node may terminate the stream before completing the ReqResp protocol
    // TODO: Consider doing error handling here for `SSZ_SNAPPY_ERROR_SOURCE_ABORTED`
    await this.sendRequest<Goodbye>(peerId, Method.Goodbye, request);
  }

  public async ping(peerId: PeerId): Promise<Ping> {
    return await this.sendRequest<Ping>(peerId, Method.Ping, this.metadataController.seqNumber);
  }

  public async metadata(peerId: PeerId): Promise<Metadata> {
    return await this.sendRequest<Metadata>(peerId, Method.Metadata, null);
  }

  public async beaconBlocksByRange(peerId: PeerId, request: BeaconBlocksByRangeRequest): Promise<SignedBeaconBlock[]> {
    return (
      (await this.sendRequest<SignedBeaconBlock[]>(peerId, Method.BeaconBlocksByRange, request, request.count)) || []
    );
  }

  public async beaconBlocksByRoot(peerId: PeerId, request: BeaconBlocksByRootRequest): Promise<SignedBeaconBlock[]> {
    return (
      (await this.sendRequest<SignedBeaconBlock[]>(peerId, Method.BeaconBlocksByRoot, request, request.length)) || []
    );
  }

  // Helper to reduce code duplication
  private async sendRequest<T extends ResponseBody | ResponseBody[]>(
    peerId: PeerId,
    method: Method,
    body: RequestBody,
    maxResponses?: number
  ): Promise<T> {
    try {
      const encoding = this.peerMetadata.encoding.get(peerId) ?? ReqRespEncoding.SSZ_SNAPPY;
      const result = await sendRequest<T>(
        {libp2p: this.libp2p, logger: this.logger, config: this.config},
        peerId,
        method,
        encoding,
        body,
        maxResponses,
        this.controller?.signal,
        this.options,
        this.reqCount++
      );

      return result;
    } catch (e) {
      const peerAction = onOutgoingReqRespError(e, method);
      if (peerAction !== null) this.peerRpcScores.applyAction(peerId, peerAction);

      throw e;
    }
  }

  private async *onRequest(method: Method, requestBody: RequestBody, peerId: PeerId): AsyncIterable<ResponseBody> {
    switch (method) {
      case Method.Ping:
        yield this.metadataController.seqNumber;
        break;

      case Method.Metadata:
        yield this.metadataController.all;
        break;

      case Method.Goodbye:
        yield BigInt(0);
        break;

      // Don't bubble Ping, Metadata, and, Goodbye requests to the app layer

      case Method.Status:
      case Method.BeaconBlocksByRange:
      case Method.BeaconBlocksByRoot:
        // TODO: Consider just moving the handlers here
        yield* this.reqRespHandler.onRequest(method, requestBody);
        break;

      default:
        throw Error(`Unsupported method ${method}`);
    }

    // Allow onRequest to return and close the stream
    // For Goodbye there may be a race condition where the listener of `receivedGoodbye`
    // disconnects in the same syncronous call, preventing the stream from ending cleanly
    setTimeout(() => {
      try {
        switch (method) {
          case Method.Ping:
            this.emit(ReqRespEvent.receivedPing, peerId, requestBody as Ping);
            break;
          case Method.Goodbye:
            this.emit(ReqRespEvent.receivedGoodbye, peerId, requestBody as Goodbye);
            break;
          case Method.Status:
            this.emit(ReqRespEvent.receivedStatus, peerId, requestBody as Status);
            break;
        }
      } catch (e) {
        this.logger.error("Error emitting onRequest event", {}, e);
      }
    }, 0);
  }
}
