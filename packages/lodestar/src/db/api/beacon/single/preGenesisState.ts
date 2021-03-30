import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {Bucket, IDatabaseController} from "@chainsafe/lodestar-db";
import {allForks} from "@chainsafe/lodestar-types";
import {CompositeType, TreeBacked} from "@chainsafe/ssz";

export class PreGenesisState {
  private readonly bucket: Bucket;
  private readonly type: CompositeType<TreeBacked<allForks.BeaconState>>;
  private readonly db: IDatabaseController<Buffer, Buffer>;
  private readonly key: Buffer;

  constructor(config: IBeaconConfig, db: IDatabaseController<Buffer, Buffer>) {
    this.db = db;
    //TODO: fix fork support
    this.type = (config.types.phase0.BeaconState as unknown) as CompositeType<TreeBacked<allForks.BeaconState>>;
    this.bucket = Bucket.phase0_preGenesisState as Bucket;
    this.key = Buffer.from(new Uint8Array([this.bucket]));
  }

  async put(value: TreeBacked<allForks.BeaconState>): Promise<void> {
    await this.db.put(this.key, this.type.serialize(value) as Buffer);
  }

  async get(): Promise<TreeBacked<allForks.BeaconState> | null> {
    const value = await this.db.get(this.key);
    return value ? this.type.createTreeBackedFromBytes(value) : null;
  }

  async delete(): Promise<void> {
    await this.db.delete(this.key);
  }
}
