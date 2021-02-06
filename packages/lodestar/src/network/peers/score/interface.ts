import PeerId from "peer-id";

export enum RpcScoreEvent {
  // void event that wont affect score, useful to simplify fooToScoreEvent fns
  NONE,
  // on successful block range fetch
  SUCCESS_BLOCK_RANGE,
  // on successful block by root fetch
  SUCCESS_BLOCK_ROOT,
  // peer returned block by range response but was missing blocks
  MISSING_BLOCKS,
  RESPONSE_TIMEOUT,
  UNSUPPORTED_PROTOCOL,
  UNKNOWN_ERROR,
}

export enum PeerAction {
  /** Immediately ban peer */
  Fatal = "Fatal",
  /**
   * Not malicious action, but it must not be tolerated
   * ~5 occurrences will get the peer banned
   */
  LowToleranceError = "LowToleranceError",
  /**
   * Negative action that can be tolerated only sometimes
   * ~10 occurrences will get the peer banned
   */
  MidToleranceError = "MidToleranceError",
  /**
   * Some error that can be tolerated multiple times
   * ~50 occurrences will get the peer banned
   */
  HighToleranceError = "HighToleranceError",
}

export interface IRpcScoreTracker {
  getScore(peer: PeerId): number;
  update(peer: PeerId, event: RpcScoreEvent): void;
  applyAction(peer: PeerId, action: PeerAction, actionName?: string): void;
  reset(peer: PeerId): void;
}
