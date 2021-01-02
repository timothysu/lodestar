import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {SignedBeaconBlock, Slot} from "@chainsafe/lodestar-types";
import {SlotRoot} from "@chainsafe/lodestar-types";
import {AbortController} from "abort-controller";
import {ILogger, sleep} from "@chainsafe/lodestar-utils";
import {toHexString} from "@chainsafe/ssz";
import {EventEmitter} from "events";
import PeerId from "peer-id";
import {IRegularSync, IRegularSyncOptions, RegularSyncEventEmitter} from "..";
import {ChainEvent, IBeaconChain} from "../../../chain";
import {INetwork} from "../../../network";
import {GossipEvent} from "../../../network/gossip/constants";
import {getPeersRegularSync, sortBlocks, isGoodPeerRegularSync} from "../../utils";
import {BlockRangeFetcher} from "./fetcher";
import {IBlockRangeFetcher, ORARegularSyncModules} from "./interface";

/**
 * One Range Ahead regular sync: fetch one range in advance and buffer blocks.
 * Fetch next range and process blocks at the same time.
 * Fetcher may return blocks of a different forkchoice branch.
 * This is ok, we handle that by beacon_blocks_by_root in sync service.
 */
export class ORARegularSync extends (EventEmitter as {new (): RegularSyncEventEmitter}) implements IRegularSync {
  private readonly config: IBeaconConfig;
  private readonly network: INetwork;
  private readonly chain: IBeaconChain;
  private readonly logger: ILogger;
  private bestPeer: PeerId | undefined;
  private fetcher: IBlockRangeFetcher;
  private controller: AbortController;
  private blockBuffer: SignedBeaconBlock[];

  constructor(options: Partial<IRegularSyncOptions>, modules: ORARegularSyncModules) {
    super();
    this.config = modules.config;
    this.network = modules.network;
    this.chain = modules.chain;
    this.logger = modules.logger;
    this.fetcher = modules.fetcher || new BlockRangeFetcher(options, modules, this.getSyncPeers.bind(this));
    this.blockBuffer = [];
    this.controller = new AbortController();
  }

  public async start(): Promise<void> {
    const headSlot = this.chain.forkChoice.getHead().slot;
    const currentSlot = this.chain.clock.currentSlot;
    this.logger.info("Started regular syncing", {currentSlot, headSlot});
    this.logger.verbose("Regular Sync: Current slot at start", {currentSlot});
    this.controller = new AbortController();
    this.network.gossip.subscribeToBlock(await this.chain.getForkDigest(), this.onGossipBlock);
    const head = this.chain.forkChoice.getHead();
    this.setLastProcessedBlock({slot: head.slot, root: head.blockRoot});
    this.sync().catch((e) => {
      this.logger.error("Regular Sync", e);
    });
  }

  public async stop(): Promise<void> {
    if (this.controller && !this.controller.signal.aborted) {
      this.controller.abort();
    }
    this.network.gossip.unsubscribe(await this.chain.getForkDigest(), GossipEvent.BLOCK, this.onGossipBlock);
  }

  public setLastProcessedBlock(lastProcessedBlock: SlotRoot): void {
    this.fetcher.setLastProcessedBlock(lastProcessedBlock);
  }

  public getHighestBlock(): Slot {
    const lastBlock = this.blockBuffer.length > 0 ? this.blockBuffer[this.blockBuffer.length - 1].message.slot : 0;
    return lastBlock ?? this.chain.forkChoice.getHead().slot;
  }

  /**
   * TODO: Why is this a condition to stop the sync?
   * Could a random peer send us an old block by gossip to stop our sync?
   */
  private onGossipBlock = async (block: SignedBeaconBlock): Promise<void> => {
    const gossipParentBlockRoot = block.message.parentRoot;
    if (this.chain.forkChoice.hasBlock(gossipParentBlockRoot as Uint8Array)) {
      this.logger.important("Regular Sync: caught up to gossip block parent " + toHexString(gossipParentBlockRoot));
      this.emit("syncCompleted");
      await this.stop();
    }
  };

  private async sync(): Promise<void> {
    this.blockBuffer = await this.fetcher.getNextBlockRange();
    while (!this.controller.signal.aborted) {
      // blockBuffer is always not empty
      const lastSlot = this.blockBuffer[this.blockBuffer.length - 1].message.slot;
      const [nextBlockRange] = await Promise.all([
        this.fetcher.getNextBlockRange(),
        this.processBlocksUntilComplete([...this.blockBuffer]),
      ]);
      if (!nextBlockRange || nextBlockRange.length === 0) {
        // node is stopped
        this.logger.info("Regular Sync: fetcher returns empty array, finish sync now");
        return;
      }
      this.blockBuffer = nextBlockRange;
      this.logger.info("Regular Sync: Synced up to slot", {
        lastProcessedSlot: lastSlot,
        currentSlot: this.chain.clock.currentSlot,
      });

      // TODO: From `this.chain.emitter.on(ChainEvent.block, this.onProcessedBlock);`
      // Check sync progress and stop
      if (signedBlock.message.slot >= this.chain.clock.currentSlot) {
        this.logger.info("Regular Sync: processed up to current slot", {slot: signedBlock.message.slot});
        this.emit("syncCompleted");
        await this.stop();
      }
    }
  }

  /**
   * TODO: From BlockRangeProcessor class
   * TODO: Cancel promise if signal is aborted
   */
  private async processBlocksUntilComplete(blocks: SignedBeaconBlock[]): Promise<void> {
    if (!blocks || !blocks.length) return;

    const sortedBlocks = sortBlocks(blocks);

    this.logger.info("Imported blocks for slots", {blocks: sortedBlocks.map((block) => block.message.slot)});
    for (const block of sortedBlocks) {
      // TODO: Do error handling on each error type
      //       BlockErrorCode.BLOCK_IS_ALREADY_KNOWN > OK
      await this.chain.processBlockJob(block);
    }
  }

  /**
   * Make sure the best peer is not disconnected and it's better than us.
   * @param excludedPeers don't want to return peers in this list
   */
  private getSyncPeers = async (excludedPeers: Set<string>): Promise<PeerId[]> => {
    const ourHeadSlot = this.chain.forkChoice.getHead().slot;

    if (
      !this.bestPeer ||
      excludedPeers.has(this.bestPeer.toB58String()) ||
      !isGoodPeerRegularSync(this.bestPeer, this.network, ourHeadSlot)
    ) {
      this.logger.info("Regular Sync: wait for best peer");

      // statusSyncTimer is per slot
      const waitingTime = this.config.params.SECONDS_PER_SLOT * 1000;

      while (!this.bestPeer) {
        const {checkpoint, peers} = getPeersRegularSync(this.network, ourHeadSlot);
        // TODO: Store multiple best peers with same checkpoint, not only one
        const bestPeer = peers[0];
        if (bestPeer) {
          this.bestPeer = bestPeer.peerId;
          this.logger.info("Regular Sync: Found best peer", {
            peerId: bestPeer.peerId.toB58String(),
            peerHeadSlot: checkpoint.slot,
            currentSlot: this.chain.clock.currentSlot,
          });
          break;
        }

        // continue to find best peer
        await sleep(waitingTime, this.controller.signal);
      }

      if (this.controller.signal.aborted) return [];
    }

    return [this.bestPeer];
  };
}
