import {
  BeaconBlocksByRangeRequest,
  BeaconBlocksByRootRequest,
  RequestBody,
  ResponseBody,
} from "@chainsafe/lodestar-types";
import {IBeaconChain} from "../../../chain";
import {Method} from "../../../constants";
import {IBeaconDb} from "../../../db";
import {onBeaconBlocksByRange} from "./beaconBlocksByRange";
import {onBeaconBlocksByRoot} from "./beaconBlocksByRoot";

/**
 * The ReqRespHandler module handles app-level requests / responses from other peers,
 * fetching state from the chain and database as needed.
 */
export class ReqRespHandler {
  private db: IBeaconDb;
  private chain: IBeaconChain;

  public constructor({db, chain}: {db: IBeaconDb; chain: IBeaconChain}) {
    this.db = db;
    this.chain = chain;
  }

  public async *onRequest(method: Method, requestBody: RequestBody): AsyncIterable<ResponseBody> {
    switch (method) {
      case Method.Status:
        yield await this.chain.getStatus();
        break;

      case Method.BeaconBlocksByRange:
        yield* onBeaconBlocksByRange(requestBody as BeaconBlocksByRangeRequest, this.chain, this.db);
        break;

      case Method.BeaconBlocksByRoot:
        yield* onBeaconBlocksByRoot(requestBody as BeaconBlocksByRootRequest, this.db);
        break;
    }
  }
}
