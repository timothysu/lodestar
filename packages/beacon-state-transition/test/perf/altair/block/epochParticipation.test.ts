import {itBench} from "@dapplion/benchmark";
import {VALIDATOR_REGISTRY_LIMIT} from "@chainsafe/lodestar-params";
import {ssz} from "@chainsafe/lodestar-types";
import {LeafNode, Node, subtreeFillToContents, Tree} from "@chainsafe/persistent-merkle-tree";
import {List, ListType} from "@chainsafe/ssz";

describe("epochParticipation", () => {
  const vc = 250_016;
  const depth = 35 + 1;
  const currentFlags = 6;
  const newFlags = 7;

  let flags = 0;
  for (let i = 0; i < 4; i++) {
    flags |= currentFlags << (8 * i);
  }

  const indexes: number[] = [];
  for (let i = 0; i < vc; i++) {
    indexes.push(i);
  }

  const nodes: LeafNode[] = [];
  for (let i = 0; i < vc / 32; i++) {
    const node = new LeafNode({
      h0: i + 1,
      h1: flags,
      h2: flags,
      h3: flags,
      h4: flags,
      h5: flags,
      h6: flags,
      h7: flags,
    });
    nodes.push(node);
  }
  const tree = new Tree(subtreeFillToContents(nodes, depth));

  const epochParticipation = new ListType<List<number>>({
    elementType: ssz.ParticipationFlags,
    limit: VALIDATOR_REGISTRY_LIMIT,
  });

  it("test", () => {
    const vIdx = 124_354;

    const chunkIdx = Math.floor(vIdx / 32);
    const bitstring = epochParticipation.getGindexBitStringAtChunkIndex(chunkIdx);
    const node = tree.getNode(bitstring);
    const hIdx = vIdx % 8;
    const hValue = getHFromIdx(node, hIdx);
    console.log(node, hIdx, hValue);

    const vHIdx = vIdx % 4;
    let vFlags = 0;
    for (let i = 0; i < 4; i++) {
      if (hValue & (1 << (8 * vHIdx + i))) {
        vFlags |= 1 << i;
      }
    }
    console.log({vFlags});
  });

  itBench("Read all flags for each flag index", () => {
    const flags: number[] = [];
    const chunkCount = Math.ceil(vc / 32);
    for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
      const node = tree.getNode(epochParticipation.getGindexBitStringAtChunkIndex(cIdx));
      for (let hIdx = 0; hIdx < 8; hIdx++) {
        const hValue = getHFromIdx(node, hIdx);
        for (let vHIdx = 0; vHIdx < 4; vHIdx++) {
          let vFlags = 0;
          for (let i = 0; i < 4; i++) {
            if (hValue & (1 << (8 * vHIdx + i))) {
              vFlags |= 1 << i;
            }
          }
          flags.push(vFlags);
        }
      }
    }
  });

  itBench("Read all flags", () => {
    const flags: number[] = [];
    const chunkCount = Math.ceil(vc / 32);
    for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
      const node = tree.getNode(epochParticipation.getGindexBitStringAtChunkIndex(cIdx));
      for (let hIdx = 0; hIdx < 8; hIdx++) {
        const hValue = getHFromIdx(node, hIdx);
        for (let vHIdx = 0; vHIdx < 4; vHIdx++) {
          const vFlags = (hValue >> (8 * vHIdx)) & 255;
          flags.push(vFlags);
        }
      }
    }
  });

  itBench.skip("Read all nodes", () => {
    for (let i = 0; i < vc; i++) {
      const chunkIdx = Math.floor(i / 32);
      const bitstring = epochParticipation.getGindexBitStringAtChunkIndex(chunkIdx);
      tree.getNode(bitstring);
    }
  });

  itBench("Read all nodes cached", () => {
    const nodeCache: Node[] = [];

    for (let i = 0; i < vc; i++) {
      const chunkIdx = Math.floor(i / 32);
      let node = nodeCache[chunkIdx];
      if (!node) {
        const bitstring = epochParticipation.getGindexBitStringAtChunkIndex(chunkIdx);
        node = tree.getNode(bitstring);
        nodeCache[chunkIdx] = node;
      }
    }
  });

  function getHFromIdx(node: Node, hIdx: number): number {
    if (hIdx === 0) return node.h0;
    if (hIdx === 1) return node.h1;
    if (hIdx === 2) return node.h2;
    if (hIdx === 3) return node.h3;
    if (hIdx === 4) return node.h4;
    if (hIdx === 5) return node.h5;
    if (hIdx === 6) return node.h6;
    if (hIdx === 7) return node.h7;
    throw Error("Wrong hIdx");
  }

  // Switch (or if, or pick a value in an array of N) between 8 options 250_000 times = 350us
  // Bitopts for
});
