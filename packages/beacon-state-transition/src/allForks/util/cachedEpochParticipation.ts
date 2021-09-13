import {BasicListType, List, TreeBacked} from "@chainsafe/ssz";
import {TIMELY_HEAD_FLAG_INDEX, TIMELY_SOURCE_FLAG_INDEX, TIMELY_TARGET_FLAG_INDEX} from "@chainsafe/lodestar-params";
import {ParticipationFlags, Uint8} from "@chainsafe/lodestar-types";
import {MutableVector, PersistentVector, TransientVector} from "@chainsafe/persistent-ts";
import {BranchNode, GindexBitstring, LeafNode, Node, Tree} from "@chainsafe/persistent-merkle-tree";
import {unsafeUint8ArrayToTree} from "./unsafeUint8ArrayToTree";

export interface IParticipationStatus {
  timelyHead: boolean;
  timelyTarget: boolean;
  timelySource: boolean;
}

type PendingFlagUpdate = {index: number; flags: number};

/** Same to https://github.com/ethereum/eth2.0-specs/blob/v1.1.0-alpha.5/specs/altair/beacon-chain.md#has_flag */
const TIMELY_SOURCE = 1 << TIMELY_SOURCE_FLAG_INDEX;
const TIMELY_TARGET = 1 << TIMELY_TARGET_FLAG_INDEX;
const TIMELY_HEAD = 1 << TIMELY_HEAD_FLAG_INDEX;

// TODO: No need to do math! All these operations can be cached before hand in a giant if
export function toParticipationFlags(data: IParticipationStatus): ParticipationFlags {
  return (
    ((data.timelySource && TIMELY_SOURCE) as number) |
    ((data.timelyHead && TIMELY_HEAD) as number) |
    ((data.timelyTarget && TIMELY_TARGET) as number)
  );
}

export function fromParticipationFlags(flags: ParticipationFlags): IParticipationStatus {
  return {
    timelySource: (TIMELY_SOURCE & flags) === TIMELY_SOURCE,
    timelyTarget: (TIMELY_TARGET & flags) === TIMELY_TARGET,
    timelyHead: (TIMELY_HEAD & flags) === TIMELY_HEAD,
  };
}

interface ICachedEpochParticipationOpts {
  type?: BasicListType<List<Uint8>>;
  tree?: Tree;
  persistent: MutableVector<IParticipationStatus>;
}

export class CachedEpochParticipation implements List<ParticipationFlags> {
  [index: number]: ParticipationFlags;
  type?: BasicListType<List<Uint8>>;
  tree?: Tree;
  persistent: MutableVector<IParticipationStatus>;
  private pendingUpdates: PendingFlagUpdate[] = [];

  constructor(opts: ICachedEpochParticipationOpts) {
    this.type = opts.type;
    this.tree = opts.tree;
    this.persistent = opts.persistent;
  }

  get length(): number {
    return this.persistent.length;
  }

  get(index: number): ParticipationFlags | undefined {
    const inclusionData = this.getStatus(index);
    if (!inclusionData) return undefined;
    return toParticipationFlags(inclusionData);
  }

  set(index: number, value: ParticipationFlags): void {
    this.persistent.set(index, fromParticipationFlags(value));
    if (this.type && this.tree) this.type.tree_setProperty(this.tree, index, value);
  }

  getStatus(index: number): IParticipationStatus | undefined {
    return this.persistent.get(index) ?? undefined;
  }

  setStatus(index: number, data: IParticipationStatus): void {
    if (this.type && this.tree) this.type.tree_setProperty(this.tree, index, toParticipationFlags(data));
    return this.persistent.set(index, data);
  }

  setPending(update: PendingFlagUpdate): void {
    this.persistent.set(update.index, fromParticipationFlags(update.flags));
    this.pendingUpdates.push(update);
  }

  applySetPending(): void {
    if (this.pendingUpdates.length < 1) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const type = this.type!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tree = this.tree!;

    // Costs ~ 1ms
    this.pendingUpdates.sort((a, b) => a.index - b.index);

    // TODO: Only get necessary nodes
    const gindexes: GindexBitstring[] = [];
    const updateToNodeIdx: number[] = [];

    // On average we edit 50% of all nodes per block
    // const leafNodes = tree.getNodesAtDepth(type.getChunkDepth(), 0, length);

    let j = -1;
    for (let i = 0, len = this.pendingUpdates.length; i < len; i++) {
      const index = this.pendingUpdates[i].index;
      const bitstring = type.getGindexBitStringAtChunkIndex(index);

      // indexes are sorted, it's only necessary to compare with previous value
      if (gindexes[j] !== bitstring) {
        gindexes.push(bitstring);
        j++;
      }

      updateToNodeIdx[i] = j;
    }

    const prevNodes = getNodes(tree, Array.from(gindexes.values()));
    const newNodes: Node[] = [];
    for (let i = 0, len = prevNodes.length; i < len; i++) {
      newNodes.push(new LeafNode(prevNodes[i]));
    }

    for (let i = 0, len = this.pendingUpdates.length; i < len; i++) {
      const {index, flags} = this.pendingUpdates[i];

      // Nodes are already cloned and may be mutated
      const node = newNodes[i];

      // hashObject h{i} index. 4 bytes per h{i}
      const hIdx = Math.floor((index % 32) / 4);
      // validator byte index in each h{i}
      const vHIdx = index % 4;
      if (hIdx === 0) node.h0 |= flags << (8 * vHIdx);
      if (hIdx === 1) node.h1 |= flags << (8 * vHIdx);
      if (hIdx === 2) node.h2 |= flags << (8 * vHIdx);
      if (hIdx === 3) node.h3 |= flags << (8 * vHIdx);
      if (hIdx === 4) node.h4 |= flags << (8 * vHIdx);
      if (hIdx === 5) node.h5 |= flags << (8 * vHIdx);
      if (hIdx === 6) node.h6 |= flags << (8 * vHIdx);
      if (hIdx === 7) node.h7 |= flags << (8 * vHIdx);
    }

    setNodes(tree, gindexes, newNodes);

    this.pendingUpdates.splice(0, this.pendingUpdates.length);
  }

  updateAllStatus(data: PersistentVector<IParticipationStatus> | TransientVector<IParticipationStatus>): void {
    this.persistent.vector = data;

    if (this.type && this.tree) {
      const packedData = new Uint8Array(data.length);
      data.forEach((d, i) => (packedData[i] = toParticipationFlags(d)));
      this.tree.rootNode = unsafeUint8ArrayToTree(packedData, this.type.getChunkDepth());
      this.type.tree_setLength(this.tree, data.length);
    }
  }

  pushStatus(data: IParticipationStatus): void {
    this.persistent.push(data);
    if (this.type && this.tree) this.type.tree_push(this.tree, toParticipationFlags(data));
  }

  push(value: ParticipationFlags): number {
    this.pushStatus(fromParticipationFlags(value));
    return this.persistent.length;
  }

  pop(): ParticipationFlags {
    const popped = this.persistent.pop();
    if (this.type && this.tree) this.type.tree_pop(this.tree);
    if (!popped) return (undefined as unknown) as ParticipationFlags;
    return toParticipationFlags(popped);
  }

  *[Symbol.iterator](): Iterator<ParticipationFlags> {
    for (const data of this.persistent) {
      yield toParticipationFlags(data);
    }
  }

  *iterateStatus(): IterableIterator<IParticipationStatus> {
    yield* this.persistent[Symbol.iterator]();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  find(fn: (value: ParticipationFlags, index: number, list: this) => boolean): ParticipationFlags | undefined {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findIndex(fn: (value: ParticipationFlags, index: number, list: this) => boolean): number {
    return -1;
  }

  forEach(fn: (value: ParticipationFlags, index: number, list: this) => void): void {
    this.persistent.forEach((value, index) =>
      (fn as (value: ParticipationFlags, index: number) => void)(toParticipationFlags(value), index)
    );
  }

  map<T>(fn: (value: ParticipationFlags, index: number) => T): T[] {
    return this.persistent.map((value, index) => fn(toParticipationFlags(value), index));
  }

  forEachStatus(fn: (value: IParticipationStatus, index: number, list: this) => void): void {
    this.persistent.forEach(fn as (t: IParticipationStatus, i: number) => void);
  }

  mapStatus<T>(fn: (value: IParticipationStatus, index: number) => T): T[] {
    return this.persistent.map((value, index) => fn(value, index));
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const CachedEpochParticipationProxyHandler: ProxyHandler<CachedEpochParticipation> = {
  get(target: CachedEpochParticipation, key: PropertyKey): unknown {
    if (!Number.isNaN(Number(String(key)))) {
      return target.get(key as number);
    } else if (target[key as keyof CachedEpochParticipation]) {
      return target[key as keyof CachedEpochParticipation];
    } else {
      if (target.type && target.tree) {
        const treeBacked = target.type.createTreeBacked(target.tree);
        if (key in treeBacked) {
          return treeBacked[key as keyof TreeBacked<List<ParticipationFlags>>];
        }
      }
      return undefined;
    }
  },
  set(target: CachedEpochParticipation, key: PropertyKey, value: ParticipationFlags): boolean {
    if (!Number.isNaN(Number(key))) {
      target.set(key as number, value);
      return true;
    }
    return false;
  },
};

/**
 * Set multiple nodes in batch, editing and traversing nodes strictly once.
 * gindexes MUST be sorted in ascending order beforehand. All gindexes must be
 * at the exact same depth.
 *
 * Strategy: for each gindex in `gindexes` navigate to the depth of its parent,
 * and create a new parent. Then calculate the closest common depth with the next
 * gindex and navigate upwards creating or caching nodes as necessary. Loop and repeat.
 */
function getNodes(tree: Tree, bitstrings: GindexBitstring[]): Node[] {
  const one = "1";
  const parentNodeStack: Node[] = [tree.rootNode];
  const nodes: Node[] = [];

  // depth   gindexes
  // 0          1
  // 1        2   3
  // 2       4 5 6 7
  // '10' means, at depth 1, node is at the left

  // Ignore first bit "1", then substract 1 to get to the parent
  const parentDepth = bitstrings[0].length - 2;
  let depth = 1;
  let node = tree.rootNode;

  for (let i = 0; i < bitstrings.length; i++) {
    const bitstring = bitstrings[i];

    // Navigate down until parent depth, and store the chain of nodes
    for (let d = depth; d <= parentDepth; d++) {
      node = bitstring[d] === "0" ? node.left : node.right;
      parentNodeStack[d] = node;
    }

    depth = parentDepth;

    // If this is the left node, check first it the next node is on the right
    //
    //   -    If both nodes exist, create new
    //  / \
    // x   x
    //
    //   -    If only the left node exists, rebindLeft
    //  / \
    // x   -
    //
    //   -    If this is the right node, only the right node exists, rebindRight
    //  / \
    // -   x

    const lastBit = bitstring[parentDepth + 1];
    if (lastBit === "0") {
      // Next node is the very next to the right of current node
      if (bitstrings[i] + one === bitstrings[i + 1]) {
        nodes.push(node.left, node.right);
        // Move pointer one extra forward since node has consumed two nodes
        i++;
      } else {
        nodes.push(node.left);
        node = new BranchNode(nodes[i], node.right);
      }
    } else {
      nodes.push(node.right);
    }

    // Here `node` is the new BranchNode at depth `parentDepth`

    // Now climb upwards until finding the common node with the next index
    // For the last iteration, diffDepth will be 1
    const diffDepth = findDiffDepth(bitstring, bitstrings[i + 1] || "1");
    const isLastBitstring = i >= bitstrings.length - 1;

    if (isLastBitstring) {
      // Done, set root node
      tree.rootNode = node;
    } else {
      // Prepare next loop
      // Go to the parent of the depth with diff, to switch branches to the right
      depth = diffDepth;
      node = parentNodeStack[depth - 1];
    }
  }

  return nodes;
}

/**
 * Set multiple nodes in batch, editing and traversing nodes strictly once.
 * gindexes MUST be sorted in ascending order beforehand. All gindexes must be
 * at the exact same depth.
 *
 * Strategy: for each gindex in `gindexes` navigate to the depth of its parent,
 * and create a new parent. Then calculate the closest common depth with the next
 * gindex and navigate upwards creating or caching nodes as necessary. Loop and repeat.
 */
function setNodes(tree: Tree, bitstrings: GindexBitstring[], nodes: Node[]): void {
  const one = "1";
  const leftParentNodeStack: (Node | null)[] = [];
  const parentNodeStack: Node[] = [tree.rootNode];

  // depth   gindexes
  // 0          1
  // 1        2   3
  // 2       4 5 6 7
  // '10' means, at depth 1, node is at the left

  // Ignore first bit "1", then substract 1 to get to the parent
  const parentDepth = bitstrings[0].length - 2;
  let depth = 1;
  let node = tree.rootNode;

  for (let i = 0; i < bitstrings.length; i++) {
    const bitstring = bitstrings[i];

    // Navigate down until parent depth, and store the chain of nodes
    for (let d = depth; d <= parentDepth; d++) {
      node = bitstring[d] === "0" ? node.left : node.right;
      parentNodeStack[d] = node;
    }

    depth = parentDepth;

    // If this is the left node, check first it the next node is on the right
    //
    //   -    If both nodes exist, create new
    //  / \
    // x   x
    //
    //   -    If only the left node exists, rebindLeft
    //  / \
    // x   -
    //
    //   -    If this is the right node, only the right node exists, rebindRight
    //  / \
    // -   x

    const lastBit = bitstring[parentDepth + 1];
    if (lastBit === "0") {
      // Next node is the very next to the right of current node
      if (bitstrings[i] + one === bitstrings[i + 1]) {
        node = new BranchNode(nodes[i], nodes[i + 1]);
        // Move pointer one extra forward since node has consumed two nodes
        i++;
      } else {
        node = new BranchNode(nodes[i], node.right);
      }
    } else {
      node = new BranchNode(node.left, nodes[i]);
    }

    // Here `node` is the new BranchNode at depth `parentDepth`

    // Now climb upwards until finding the common node with the next index
    // For the last iteration, diffDepth will be 1
    const diffDepth = findDiffDepth(bitstring, bitstrings[i + 1] || "1");
    const isLastBitstring = i >= bitstrings.length - 1;

    // When climbing up from a left node there are two possible paths
    // 1. Go to the right of the parent: Store left node to rebind latter
    // 2. Go another level up: Will never visit the left node again, so must rebind now

    // 🡼 \     Rebind left only, will never visit this node again
    // 🡽 /\
    //
    //    / 🡽  Rebind left only (same as above)
    // 🡽 /\
    //
    // 🡽 /\ 🡾  Store left node to rebind the entire node when returning
    //
    // 🡼 \     Rebind right with left if exists, will never visit this node again
    //   /\ 🡼
    //
    //    / 🡽  Rebind right with left if exists (same as above)
    //   /\ 🡼

    for (let d = parentDepth; d >= diffDepth; d--) {
      // If node is on the left, store for latter
      // If node is on the right merge with stored left node
      if (bitstring[d] === "0") {
        if (isLastBitstring || d !== diffDepth) {
          // If it's last bitstring, bind with parent since it won't navigate to the right anymore
          // Also, if still has to move upwards, rebind since the node won't be visited anymore
          node = new BranchNode(node, parentNodeStack[d - 1].right);
        } else {
          // Only store the left node if it's at d = diffDepth
          leftParentNodeStack[d] = node;
          node = parentNodeStack[d - 1];
        }
      } else {
        const leftNode = leftParentNodeStack[d];

        if (leftNode) {
          node = new BranchNode(leftNode, node);
          leftParentNodeStack[d] = null;
        } else {
          node = new BranchNode(parentNodeStack[d - 1].left, node);
        }
      }
    }

    if (isLastBitstring) {
      // Done, set root node
      tree.rootNode = node;
    } else {
      // Prepare next loop
      // Go to the parent of the depth with diff, to switch branches to the right
      depth = diffDepth;
      node = parentNodeStack[depth - 1];
    }
  }
}

function findDiffDepth(bitstringA: GindexBitstring, bitstringB: GindexBitstring): number {
  for (let i = 1; i < bitstringA.length; i++) {
    if (bitstringA[i] !== bitstringB[i]) {
      return i;
    }
  }
  return bitstringA.length;
}
