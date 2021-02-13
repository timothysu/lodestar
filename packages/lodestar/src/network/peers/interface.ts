import PeerId from "peer-id";
import {Metadata, Slot, Status} from "@chainsafe/lodestar-types";
import {ReqRespEncoding} from "../../constants";

export type Discv5Query = {subnetId: number; maxPeersToDiscover: number};

export type RequestedSubnet = {
  subnetId: number;
  /**
   * Slot after which the network will stop to mantain a min number of peers
   *  connected to `subnetId`
   */
  toSlot: Slot;
};

export type PeerMetadataStoreItem<T> = {
  set: (peer: PeerId, value: T) => void;
  get: (peer: PeerId) => T | undefined;
};

/**
 * Get/set data about peers.
 */
export interface IPeerMetadataStore {
  encoding: PeerMetadataStoreItem<ReqRespEncoding>;
  metadata: PeerMetadataStoreItem<Metadata>;
  status: PeerMetadataStoreItem<Status>;
  rpcScore: PeerMetadataStoreItem<number>;
  rpcScoreLastUpdate: PeerMetadataStoreItem<number>;
}
