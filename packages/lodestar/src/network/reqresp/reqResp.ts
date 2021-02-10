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
import {errorToScoreEvent, successToScoreEvent} from "./score";
import {IPeerMetadataStore} from "../peers/interface";
import {IRpcScoreTracker} from "../peers/score";
import {createRpcProtocol} from "../util";
import {MetadataController} from "../metadata";
import {ReqRespHandler} from "./handlers";

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
  private reqRespHandler: ReqRespHandler;
  private metadataController: MetadataController;
  private peerMetadata: IPeerMetadataStore;
  private peerRpcScores: IRpcScoreTracker;
  private controller: AbortController | undefined;
  private options?: IReqRespOptions;
  private reqCount = 0;
  private respCount = 0;

  public constructor(
    {
      config,
      libp2p,
      reqRespHandler,
      peerMetadata,
      metadata,
      peerRpcScores,
      logger,
    }: IReqRespModules & {metadata: MetadataController; reqRespHandler: ReqRespHandler},
    options?: IReqRespOptions
  ) {
    super();
    this.config = config;
    this.libp2p = libp2p;
    this.reqRespHandler = reqRespHandler;
    this.peerMetadata = peerMetadata;
    this.metadataController = metadata;
    this.logger = logger;
    this.peerRpcScores = peerRpcScores;
    this.options = options;
  }

  public start(): void {
    this.controller = new AbortController();
    for (const method of Object.values(Method)) {
      for (const encoding of Object.values(ReqRespEncoding)) {
        this.libp2p.handle(createRpcProtocol(method, encoding), async ({connection, stream}) => {
          const peerId = connection.remotePeer;

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
    return notNull(await this.sendRequest<Status>(peerId, Method.Status, request));
  }

  public async goodbye(peerId: PeerId, request: Goodbye): Promise<void> {
    await this.sendRequest<Goodbye>(peerId, Method.Goodbye, request);
  }

  public async ping(peerId: PeerId): Promise<Ping> {
    const seqNumber = this.metadataController.seqNumber;
    return notNull(await this.sendRequest<Ping>(peerId, Method.Ping, seqNumber));
  }

  public async metadata(peerId: PeerId): Promise<Metadata> {
    return notNull(await this.sendRequest<Metadata>(peerId, Method.Metadata, null));
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
  ): Promise<T | null> {
    try {
      const encoding = this.peerMetadata.getEncoding(peerId) ?? ReqRespEncoding.SSZ_SNAPPY;
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

      this.peerRpcScores.update(peerId, successToScoreEvent(method));

      return result;
    } catch (e) {
      this.peerRpcScores.update(peerId, errorToScoreEvent(e, method));

      throw e;
    }
  }

  private async *onRequest(method: Method, requestBody: RequestBody, peerId: PeerId): AsyncIterable<ResponseBody> {
    switch (method) {
      case Method.Ping:
        this.emit(ReqRespEvent.receivedPing, peerId, requestBody as Ping);
        yield this.metadataController.seqNumber;
        break;

      case Method.Metadata:
        yield this.metadataController.all;
        break;

      case Method.Goodbye:
        this.emit(ReqRespEvent.receivedGoodbye, peerId, requestBody as Goodbye);
        yield BigInt(0);
        break;

      // Don't bubble Ping, Metadata, and, Goodbye requests to the app layer

      case Method.Status:
        this.emit(ReqRespEvent.receivedStatus, peerId, requestBody as Status);
        yield* this.reqRespHandler.onRequest(method, requestBody);
        break;

      case Method.BeaconBlocksByRange:
      case Method.BeaconBlocksByRoot:
        yield* this.reqRespHandler.onRequest(method, requestBody);
        break;

      default:
        throw Error(`Unsupported method ${method}`);
    }
  }
}

/**
 * Require a ReqResp response to not be null
 */
function notNull<T>(res: T | null): T {
  if (res === null) throw Error("Empty response");
  return res;
}
