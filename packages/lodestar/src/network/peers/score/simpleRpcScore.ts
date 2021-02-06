import {RpcScoreEvent, IRpcScoreTracker, PeerAction} from "./interface";
import {IPeerMetadataStore} from "../interface";
import PeerId from "peer-id";

const scoreConstants: Record<RpcScoreEvent, number> = {
  [RpcScoreEvent.NONE]: 0,
  [RpcScoreEvent.SUCCESS_BLOCK_RANGE]: 10,
  [RpcScoreEvent.SUCCESS_BLOCK_ROOT]: 5,
  [RpcScoreEvent.RESPONSE_TIMEOUT]: -20,
  [RpcScoreEvent.UNSUPPORTED_PROTOCOL]: -100,
  [RpcScoreEvent.MISSING_BLOCKS]: -15,
  [RpcScoreEvent.UNKNOWN_ERROR]: -10,
};

export const DEFAULT_RPC_SCORE = 100;
const MAX_SCORE = 200;
const MIN_SCORE = 0;

export const peerActionScore: Record<PeerAction, number> = {
  [PeerAction.Fatal]: -MAX_SCORE,
  [PeerAction.LowToleranceError]: -20,
  [PeerAction.MidToleranceError]: -10,
  [PeerAction.HighToleranceError]: -2,
};

export class SimpleRpcScoreTracker implements IRpcScoreTracker {
  private readonly store: IPeerMetadataStore;

  constructor(store: IPeerMetadataStore) {
    this.store = store;
  }

  public getScore(peer: PeerId): number {
    return this.store.getRpcScore(peer) ?? DEFAULT_RPC_SCORE;
  }

  public reset(peer: PeerId): void {
    this.store.setRpcScore(peer, DEFAULT_RPC_SCORE);
  }

  public update(peer: PeerId, event: RpcScoreEvent): void {
    this.add(peer, scoreConstants[event]);
  }

  public applyAction(peer: PeerId, action: PeerAction, actionName?: string): void {
    this.add(peer, peerActionScore[action]);

    // TODO: Log action to debug
    actionName;
  }

  private add(peer: PeerId, scoreDelta: number): void {
    let score = this.getScore(peer) + scoreDelta;
    if (score > MAX_SCORE) score = MAX_SCORE;
    if (score < MIN_SCORE) score = MIN_SCORE;
    this.store.setRpcScore(peer, score);
  }
}
