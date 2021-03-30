import {CompositeType, TreeBacked} from "@chainsafe/ssz";
import {allForks, Epoch, Root, Slot} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {Bucket, encodeKey, IDatabaseController, Repository} from "@chainsafe/lodestar-db";
import {bytesToInt, intToBytes} from "@chainsafe/lodestar-utils";
export class StateArchiveRepository extends Repository<Slot, TreeBacked<allForks.BeaconState>> {
  constructor(config: IBeaconConfig, db: IDatabaseController<Buffer, Buffer>) {
    super(
      config,
      db,
      Bucket.phase0_stateArchive,
      //TODO: fix fork support
      (config.types.phase0.BeaconState as unknown) as CompositeType<TreeBacked<allForks.BeaconState>>
    );
  }

  async put(key: Slot, value: TreeBacked<allForks.BeaconState>): Promise<void> {
    await Promise.all([super.put(key, value), this.storeRootIndex(key, value.hashTreeRoot())]);
  }

  getId(state: TreeBacked<allForks.BeaconState>): Epoch {
    return state.slot;
  }

  decodeKey(data: Buffer): number {
    return bytesToInt((super.decodeKey(data) as unknown) as Uint8Array, "be");
  }

  decodeValue(data: Buffer): TreeBacked<allForks.BeaconState> {
    return ((this.type as unknown) as CompositeType<allForks.BeaconState>).createTreeBackedFromBytes(data);
  }

  async getByRoot(stateRoot: Root): Promise<TreeBacked<allForks.BeaconState> | null> {
    const slot = await this.getSlotByRoot(stateRoot);
    if (slot !== null && Number.isInteger(slot)) {
      return this.get(slot);
    }
    return null;
  }

  private async getSlotByRoot(root: Root): Promise<Slot | null> {
    const value = await this.db.get(this.getRootIndexKey(root));
    if (value) {
      return bytesToInt(value, "be");
    }
    return null;
  }

  private storeRootIndex(slot: Slot, stateRoot: Root): Promise<void> {
    return this.db.put(this.getRootIndexKey(stateRoot), intToBytes(slot, 64, "be"));
  }

  private getRootIndexKey(root: Root): Buffer {
    return encodeKey(Bucket.index_stateArchiveRootIndex, root.valueOf() as Uint8Array);
  }
}
