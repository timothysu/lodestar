import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {Bucket, encodeKey, IDatabaseController, Repository} from "@chainsafe/lodestar-db";
import {allForks, Epoch, Root, Slot} from "@chainsafe/lodestar-types";
import {bytesToInt, intToBytes} from "@chainsafe/lodestar-utils";
import {CompositeType, ITreeBacked} from "@chainsafe/ssz";

/**
 * A more relaxed form of `TreeBacked<T>`
 *
 * TreeBacked<T> creates incompatibilities with nested values
 * (due to `TreeBacked<T>[keyof TreeBacked<T>]` not being equivilent to `T[keyof T]`)
 *
 * A future version of ssz should not recursively TreeBackedify values to avoid this issue
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type RelaxedTreeBacked<T extends object> = ITreeBacked<T> & T;

export class StateArchiveRepository extends Repository<Slot, RelaxedTreeBacked<allForks.BeaconState>> {
  constructor(config: IBeaconConfig, db: IDatabaseController<Buffer, Buffer>) {
    super(
      config,
      db,
      Bucket.phase0_stateArchive,
      (config.types.phase0.BeaconState as unknown) as CompositeType<RelaxedTreeBacked<allForks.BeaconState>>
    );
  }

  async put(key: Slot, value: RelaxedTreeBacked<allForks.BeaconState>): Promise<void> {
    await Promise.all([super.put(key, value), this.storeRootIndex(key, value.hashTreeRoot())]);
  }

  getId(state: RelaxedTreeBacked<allForks.BeaconState>): Epoch {
    return state.slot;
  }

  decodeKey(data: Buffer): number {
    return bytesToInt((super.decodeKey(data) as unknown) as Uint8Array, "be");
  }

  decodeValue(data: Buffer): RelaxedTreeBacked<allForks.BeaconState> {
    return ((this.type as unknown) as CompositeType<allForks.BeaconState>).tree.deserialize(data);
  }

  async getByRoot(stateRoot: Root): Promise<RelaxedTreeBacked<allForks.BeaconState> | null> {
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
