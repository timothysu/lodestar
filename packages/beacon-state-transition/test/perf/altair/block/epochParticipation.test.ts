import {itBench} from "@dapplion/benchmark";
import {VALIDATOR_REGISTRY_LIMIT} from "@chainsafe/lodestar-params";
import {ssz} from "@chainsafe/lodestar-types";
import {LeafNode, Node, subtreeFillToContents, Tree} from "@chainsafe/persistent-merkle-tree";
import {List, ListType} from "@chainsafe/ssz";

describe("epochParticipation", () => {
  const vc = 250_016;
  const depth = 35 + 1;
  const nodeCount = Math.ceil(vc / 32);
  const currentFlags = 6;

  let flags = 0;
  for (let i = 0; i < 4; i++) {
    flags |= currentFlags << (8 * i);
  }

  const indexes: number[] = [];
  for (let i = 0; i < vc; i++) {
    indexes.push(i);
  }

  const nodes: LeafNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
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

  itBench(`Read all flags for each flag index - ${vc} vc`, () => {
    const flags: number[] = [];
    for (let cIdx = 0; cIdx < nodeCount; cIdx++) {
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

  itBench(`Read all flags - ${vc} vc`, () => {
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

  itBench(`Read all nodes - ${vc} vc`, () => {
    for (let i = 0; i < vc; i++) {
      const chunkIdx = Math.floor(i / 32);
      const bitstring = epochParticipation.getGindexBitStringAtChunkIndex(chunkIdx);
      tree.getNode(bitstring);
    }
  });

  itBench(`Read all nodes cached - ${vc} vc`, () => {
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

  // Initialize 3939 LeafNode(s) costs 50us
  itBench("Create 3939 hashObjects", () => {
    // 3939 is the number of new nodes that are created in the 250_000 vc perf test for epoch participation
    const prevNode = new LeafNode({
      h0: 1,
      h1: 2,
      h2: 3,
      h3: 4,
      h4: 5,
      h5: 6,
      h6: 7,
      h7: 8,
    });
    for (let i = 0; i < 3939; i++) {
      new LeafNode({
        h0: prevNode.h0 + i,
        h1: prevNode.h1,
        h2: prevNode.h2,
        h3: prevNode.h3,
        h4: prevNode.h4,
        h5: prevNode.h5,
        h6: prevNode.h6,
        h7: prevNode.h7,
      });
    }
  });

  /** Average number of nodes that are changed in altair processAttestation */
  const editedNodeCount = 3939;

  itBench<LeafNode[], LeafNode[]>({
    id: `Build a ${nodeCount} node tree - subtreeFillToContents`,
    before: () => {
      const node = new LeafNode({h0: 1, h1: 2, h2: 3, h3: 4, h4: 5, h5: 6, h6: 7, h7: 8});
      const nodes: LeafNode[] = [];
      for (let i = 0; i < nodeCount; i++) nodes.push(node);
      return nodes;
    },
    beforeEach: (nodes) => nodes,
    fn: (nodes) => {
      subtreeFillToContents(nodes, depth);
    },
  });

  itBench<Tree, Tree>({
    id: `Read a ${nodeCount} node tree - getNodesAtDepth`,
    before: () => {
      const node = new LeafNode({h0: 1, h1: 2, h2: 3, h3: 4, h4: 5, h5: 6, h6: 7, h7: 8});
      const nodes: LeafNode[] = [];
      for (let i = 0; i < nodeCount; i++) nodes.push(node);
      return new Tree(subtreeFillToContents(nodes, depth));
    },
    beforeEach: (tree) => tree,
    fn: (tree) => {
      tree.getNodesAtDepth(depth, 0, nodeCount);
    },
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
