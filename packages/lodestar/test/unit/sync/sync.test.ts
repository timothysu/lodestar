import {createIBeaconConfig} from "@chainsafe/lodestar-config";
import {config} from "@chainsafe/lodestar-config/default";
import {SLOTS_PER_EPOCH} from "@chainsafe/lodestar-params";
import {phase0, RootHex, ssz} from "@chainsafe/lodestar-types";
import {sleep} from "@chainsafe/lodestar-utils";
import {toHexString, TreeBacked} from "@chainsafe/ssz";
import {allForks} from "@chainsafe/lodestar-beacon-state-transition";
import {BeaconChain} from "../../../src/chain";
import {ZERO_HASH} from "../../../src/constants";
import {INetwork, IReqResp, NetworkEvent, NetworkEventBus} from "../../../src/network";
import {BeaconSync} from "../../../src/sync";
import {SyncOptions} from "../../../src/sync/options";
import {testLogger} from "../../utils/logger";
import {getValidPeerId} from "../../utils/peer";
import {StubbedBeaconDb} from "../../utils/stub";
import {getClient} from "@chainsafe/lodestar-api";

/* eslint-disable @typescript-eslint/no-empty-function */

describe("sync / full test", function () {
  this.timeout(5000);
  const logger = testLogger();
  const interopPubkey0 = Buffer.from(
    "a99a76ed7796f7be22d5b7e85deeb7c5677e88e511e0b337618f8c4eb61349b4bf2d153f649f7b53359fe8b94a38e44c",
    "hex"
  );

  before("Check mainnet genesis", async () => {
    const network = "mainnet";
    const INFURA_CREDENTIALS = "1sla4tyOFn0bB1ohyCKaH2sLmHu:b8cdb9d881039fd04fe982a5ec57b0b8";
    const baseUrl = `https://${INFURA_CREDENTIALS}@eth2-beacon-${network}.infura.io`;

    const client = getClient(config, {baseUrl});

    const {data: genesisBlock} = await client.beacon.getBlock(0);
    const {data: block1} = await client.beacon.getBlock(1);

    console.log("block0.hash", toHexString(ssz.phase0.BeaconBlock.hashTreeRoot(genesisBlock.message)));
    console.log("block1.parentRoot", toHexString(block1.message.parentRoot));
  });

  it("Sync range with offset", async () => {
    const blocksByRoot = new Map<RootHex, allForks.SignedBeaconBlock>();
    const blocksByNumber: allForks.SignedBeaconBlock[] = [];

    const anchorState = ssz.phase0.BeaconState.defaultTreeBacked() as TreeBacked<allForks.BeaconState>;

    // Create active validator
    const validator = ssz.phase0.Validator.defaultTreeBacked();
    validator.pubkey = interopPubkey0;
    validator.effectiveBalance = 32e9;
    validator.exitEpoch = Infinity;
    validator.withdrawableEpoch = Infinity;

    anchorState.validators.push(validator);
    anchorState.balances.push(validator.effectiveBalance);

    // Set genesisTime to be N epochs away from now
    const epochsToSync = 3;
    anchorState.genesisTime = Math.floor(Date.now() / 1000) - epochsToSync * SLOTS_PER_EPOCH * config.SECONDS_PER_SLOT;

    // Default block with same empty body
    const blockDefault = ssz.phase0.SignedBeaconBlock.defaultTreeBacked();

    let parentRoot = ZERO_HASH as Uint8Array;
    let state = allForks.createCachedBeaconState(config, anchorState);

    const toSlot = epochsToSync * SLOTS_PER_EPOCH;
    for (let slot = 0; slot < toSlot; slot++) {
      const block = ssz.phase0.SignedBeaconBlock.clone(blockDefault);

      if (slot === 0) {
        // MAINNET
        // genesisBlock {
        //   slot: 0,
        //   proposerIndex: 0,
        //   parentRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        //   stateRoot: '0x7e76880eb67bbdc86250aa578958e9d0675e64e714337855204fb5abaaf82c2b',
        //   bodyRoot: '0xccb62460692be0ec813b56be97f68a82cf57abc102e27bf49ebf4190ff22eedd'
        // }
        // genesisBlock hash 0x4d611d5b93fdab69013a7f0a2f961caca0c853f87cfe9595fe50038163079360
        // genesisState.latestBlockHeader {
        //   slot: '0',
        //   proposerIndex: '0',
        //   parentRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        //   stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        //   bodyRoot: '0xccb62460692be0ec813b56be97f68a82cf57abc102e27bf49ebf4190ff22eedd'
        // }
        // genesisState root 0x7e76880eb67bbdc86250aa578958e9d0675e64e714337855204fb5abaaf82c2b

        // Genesis block,
        // Genesis state.latestBlockHeader is empty
        parentRoot = ssz.phase0.BeaconBlockHeader.hashTreeRoot(anchorState.latestBlockHeader);

        // Add genesisBlock body root
        anchorState.latestBlockHeader.bodyRoot = ssz.phase0.BeaconBlockBody.hashTreeRoot(block.message.body);
      } else {
        block.message.slot = slot;
        // assert block.parentRoot == state.latestBlockHeader
        block.message.parentRoot = parentRoot;
        // block.message.proposerIndex = 0 // proposer is always index 0, only 1 validator

        // Mutate preState to postState
        state = allForks.stateTransition(state, block, {
          verifyProposer: false,
          verifySignatures: false,
          verifyStateRoot: false,
        });

        // After running stateTransition, set state root to block, now the header is complete
        block.message.stateRoot = state.hashTreeRoot();

        // Then persist block header in state for the next block
        state.latestBlockHeader = {
          slot: block.message.slot,
          proposerIndex: block.message.proposerIndex,
          parentRoot: block.message.parentRoot,
          stateRoot: block.message.stateRoot,
          bodyRoot: ssz.phase0.BeaconBlockBody.hashTreeRoot(block.message.body),
        };
      }

      const blockRoot = ssz.phase0.BeaconBlock.hashTreeRoot(block.message);
      blocksByRoot.set(toHexString(blockRoot), block);
      blocksByNumber[slot] = block;
      parentRoot = blockRoot;
    }

    console.log(
      Array.from(blocksByRoot.entries()).map(([key, block]) => ({
        root: key,
        parent: toHexString(block.message.parentRoot),
      }))
    );

    // chain:
    // -------------
    // chain.emitter -> to subscribe to peer events
    // chain.clock -> to get current slot, epoch
    // chain.forkChoice -> to check conditions
    // chain.getStatus -> to get current finalizedEpoch
    // chain.processBlock -> validate and import block
    // chain.processChainSegment -> validate and import blocks

    const chain = new BeaconChain(
      {},
      {
        config: createIBeaconConfig(config, ZERO_HASH),
        db: new StubbedBeaconDb(),
        logger,
        metrics: null,
        anchorState,
        transitionStore: null,
      }
    );

    console.log("head", chain.forkChoice.getHead());

    const forkDigest = chain.getStatus().forkDigest;
    // Since genesisTime is in 1970, the current slot is ridiculously far away (~272_000_000)
    const currentSlot = chain.clock.currentSlot;
    const currentEpoch = chain.clock.currentEpoch;

    // network:
    // ---------------
    // network.events
    // network.hasSomeConnectedPeer
    // network.getConnectedPeers
    // network.isSubscribedToGossipCoreTopics
    // network.subscribeGossipCoreTopics
    // network.unsubscribeGossipCoreTopics
    // network.reqResp.beaconBlocksByRoot
    // network.reqResp.beaconBlocksByRange
    // network.peerRpcScores.applyAction
    // network.reStatusPeers

    const reqResp: Partial<IReqResp> = {
      beaconBlocksByRange: async (_peerId, req) => blocksByNumber.slice(req.startSlot, req.startSlot + req.count),
      beaconBlocksByRoot: async (_peerId, req) =>
        Array.from(req)
          .map((root) => blocksByRoot.get(toHexString(root)))
          .filter((block): block is allForks.SignedBeaconBlock => !block),
    };

    const peer = getValidPeerId();
    const network: Partial<INetwork> & Pick<INetwork, "events"> = {
      events: new NetworkEventBus(),
      hasSomeConnectedPeer: () => true,
      getConnectedPeers: () => [peer],
      isSubscribedToGossipCoreTopics: () => false,
      subscribeGossipCoreTopics: () => {},
      unsubscribeGossipCoreTopics: () => {},
      reportPeer: () => {},
      reStatusPeers: () => {},
      reqResp: reqResp as IReqResp,
    };

    // To go fast:
    // - don't connect to the network
    // - don't validate signatures

    const opts: SyncOptions = {};
    const sync = new BeaconSync(opts, {
      config,
      chain,
      metrics: null,
      network: network as INetwork,
      logger,
    });

    const status: phase0.Status = {
      forkDigest: forkDigest,
      finalizedRoot: ZERO_HASH,
      finalizedEpoch: currentEpoch,
      headRoot: ZERO_HASH,
      headSlot: currentSlot,
    };
    network.events.emit(NetworkEvent.peerConnected, peer, status);

    await sleep(2000);
  });
});
