import {IPeerMetadataStore, PeerMetadataStoreItem} from "./interface";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import PeerId from "peer-id";
import {Metadata, Status} from "@chainsafe/lodestar-types";
import {BasicType, ContainerType} from "@chainsafe/ssz";
import {notNullish} from "../../util/notNullish";
import {ReqRespEncoding} from "../../constants";

enum MetadataKey {
  ENCODING = "encoding",
  METADATA = "metadata",
  STATUS = "status",
  SCORE = "score",
  SCORE_LAST_UPDATE = "score-last-update",
}

type Item<T> = PeerMetadataStoreItem<T>; // shorter alias for readability

/**
 * Wrapper around Libp2p.peerstore.metabook
 * that uses ssz serialization to store data
 */
export class Libp2pPeerMetadataStore implements IPeerMetadataStore {
  encoding: Item<ReqRespEncoding>;
  metadata: Item<Metadata>;
  status: Item<Status>;
  rpcScore: Item<number>;
  rpcScoreLastUpdate: Item<number>;

  private readonly config: IBeaconConfig;
  private readonly metabook: MetadataBook;

  constructor(config: IBeaconConfig, metabook: MetadataBook) {
    this.config = config;
    this.metabook = metabook;
    this.encoding = this.typedStore(MetadataKey.ENCODING, new StringType());
    this.metadata = this.typedStore(MetadataKey.METADATA, this.config.types.Metadata);
    this.status = this.typedStore(MetadataKey.STATUS, this.config.types.Status);
    this.rpcScore = this.typedStore(MetadataKey.SCORE, this.config.types.Number64);
    this.rpcScoreLastUpdate = this.typedStore(MetadataKey.SCORE_LAST_UPDATE, this.config.types.Number64);
  }

  private typedStore<T>(key: MetadataKey, type: BasicType<T> | ContainerType<T>): Item<T> {
    const set = (peer: PeerId, value: T): void => this.set(peer, key, type, value);
    const get = (peer: PeerId): T | undefined => this.get(peer, key, type);
    return {set, get};
  }

  private set<T>(peer: PeerId, key: MetadataKey, type: BasicType<T> | ContainerType<T>, value: T | null): void {
    if (notNullish(value)) {
      this.metabook.set(peer, key, Buffer.from(type.serialize(value)));
    } else {
      this.metabook.deleteValue(peer, key);
    }
  }

  private get<T>(peer: PeerId, key: MetadataKey, type: BasicType<T> | ContainerType<T>): T | undefined {
    const value = this.metabook.getValue(peer, key);
    if (value) {
      return type.deserialize(value);
    }
  }
}

/**
 * Dedicated string type only used here, so not worth to keep it in `lodestar-types`
 */
class StringType<T extends string> extends BasicType<T> {
  serialize(value: T): Uint8Array {
    return Buffer.from(value);
  }

  deserialize(data: Uint8Array): T {
    return (Buffer.from(data).toString() as unknown) as T;
  }
}
