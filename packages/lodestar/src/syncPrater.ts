// This is POC to recreate a memory issue in Prater
// It will download a past state and sync a bunch of blocks

import {init} from "@chainsafe/bls";
import {notNullish, WinstonLogger} from "@chainsafe/lodestar-utils";
import {LevelDbController} from "@chainsafe/lodestar-db";
import {BeaconDb} from "./db";
import {BeaconChain} from "./chain";
import {createIBeaconConfig, createIChainForkConfig} from "@chainsafe/lodestar-config";
import {praterChainConfig} from "@chainsafe/lodestar-config/networks";
import {TreeBacked} from "@chainsafe/ssz";
import {allForks, altair, ssz} from "@chainsafe/lodestar-types";
import {getClient} from "@chainsafe/lodestar-api";
import {getInfuraUrl} from "@chainsafe/lodestar-beacon-state-transition/test/perf/infura";
import {computeEpochAtSlot} from "@chainsafe/lodestar-beacon-state-transition";
import {computeStartSlotAtEpoch} from "@chainsafe/lodestar-beacon-state-transition/src";
import {linspace} from "./util/numpy";

const dbPath = "./test-prater";

async function run(): Promise<void> {
  await init("blst-native");

  const logger = new WinstonLogger();
  const config = createIChainForkConfig(praterChainConfig);
  const baseUrl = getInfuraUrl("prater");
  const api = getClient(config, {baseUrl, timeoutMs: 120 * 1000});

  const {data: head} = await api.beacon.getBlockHeader("head");
  const headSlot = head.header.message.slot;
  const headEpoch = computeEpochAtSlot(headSlot);
  const startEpoch = headEpoch - 500;
  const startSlot = computeStartSlotAtEpoch(startEpoch);

  console.log("Getting state at slot", startSlot);
  const stateBytes = await api.debug.getStateV2(String(startSlot), "ssz");
  const anchorState = ssz.altair.BeaconState.createTreeBackedFromBytes(stateBytes);
  console.log("Got state at slot", startSlot);

  const beaconConfig = createIBeaconConfig(config, anchorState.genesisValidatorsRoot);

  const db = new BeaconDb({
    config,
    controller: new LevelDbController({name: dbPath}, {logger}),
  });

  const chain = new BeaconChain(
    {},
    {
      config: beaconConfig,
      db,
      logger: logger,
      metrics: null,
      anchorState: anchorState as TreeBacked<allForks.BeaconState>,
    }
  );

  let i = 0;
  for (let epoch = startEpoch; epoch <= headEpoch; epoch++) {
    try {
      const fromSlot = computeStartSlotAtEpoch(epoch);
      const toSlot = computeStartSlotAtEpoch(epoch + 1) - 1;
      const slots = linspace(fromSlot, toSlot);

      const blocksWithNull = await Promise.all(
        slots.map(async (slot) => {
          try {
            const {data: block} = await api.beacon.getBlockV2(slot);
            return ssz.altair.SignedBeaconBlock.createTreeBackedFromStruct(block as altair.SignedBeaconBlock);
          } catch (e) {
            if ((e as Error).message.includes("Not Found")) {
              return null;
            } else {
              throw e;
            }
          }
        })
      );
      const blocks = blocksWithNull.filter(notNullish);

      await chain.processChainSegment(blocks, {prefinalized: true, trusted: false});
      console.log("Processed blocks", i++, epoch, process.memoryUsage().heapUsed / 1e6, "MB");
    } catch (e) {
      console.error(e);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
