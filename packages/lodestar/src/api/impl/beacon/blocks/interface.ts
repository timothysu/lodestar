import {Root, phase0, Slot, allForks} from "@chainsafe/lodestar-types";

export interface IBeaconBlocksApi {
  getBlockHeaders(filters: Partial<{slot: Slot; parentRoot: Root}>): Promise<phase0.SignedBeaconHeaderResponse[]>;
  getBlockHeader(blockId: BlockId): Promise<phase0.SignedBeaconHeaderResponse | null>;
  getBlock(blockId: BlockId): Promise<allForks.SignedBeaconBlock | null>;
  publishBlock(block: allForks.SignedBeaconBlock): Promise<void>;
}

export type BlockId = string | "head" | "genesis" | "finalized";
