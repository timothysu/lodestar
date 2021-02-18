import {IBeaconParams} from "@chainsafe/lodestar-params";
import {getDevBeaconNode} from "../../utils/node/beacon";
import {waitForEvent} from "../../utils/events/resolver";
import {Checkpoint, SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {LogLevel, WinstonLogger} from "@chainsafe/lodestar-utils";
import assert from "assert";
import {getDevValidators} from "../../utils/node/validator";
import {config} from "@chainsafe/lodestar-config/minimal";
import {ChainEvent} from "../../../src/chain";
import {Libp2pNetwork} from "../../../src/network";
import {connect} from "../../utils/network";

describe("syncing", function () {
  const validatorCount = 8;
  const beaconParams: Partial<IBeaconParams> = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SECONDS_PER_SLOT: 2,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SLOTS_PER_EPOCH: 8,
  };

  it("should sync from other BN", async function () {
    this.timeout("10 min");

    const debugMode = process.env.DEBUG;
    const levelNode = debugMode ? LogLevel.verbose : LogLevel.info;
    const levelVali = debugMode ? LogLevel.verbose : LogLevel.warn;
    const loggerNodeA = new WinstonLogger({level: levelNode, module: "Node-A"});
    const loggerNodeB = new WinstonLogger({level: levelNode, module: "Node-B"});
    const loggerValiA = new WinstonLogger({level: levelVali, module: "Vali-A"});

    const bn = await getDevBeaconNode({
      params: beaconParams,
      validatorCount,
      logger: loggerNodeA,
    });
    const finalizationEventListener = waitForEvent<Checkpoint>(bn.chain.emitter, ChainEvent.finalized, 240000);
    const validators = getDevValidators(bn, 8, 1, false, loggerValiA);

    await Promise.all(validators.map((validator) => validator.start()));

    try {
      await finalizationEventListener;
      loggerNodeA.important("Node A emitted finalized endpoint");
    } catch (e) {
      assert.fail("Failed to reach finalization");
    }

    const bn2 = await getDevBeaconNode({
      params: beaconParams,
      validatorCount,
      genesisTime: bn.chain.getHeadState().genesisTime,
      logger: loggerNodeB,
    });
    const head = await bn.chain.getHeadBlock()!;
    const waitForSynced = waitForEvent<SignedBeaconBlock>(bn2.chain.emitter, ChainEvent.block, 100000, (block) =>
      config.types.SignedBeaconBlock.equals(block, head!)
    );
    await connect(bn2.network as Libp2pNetwork, bn.network.peerId, bn.network.localMultiaddrs);
    try {
      await waitForSynced;
    } catch (e) {
      assert.fail("Failed to sync to other node in time");
    }
    await bn2.close();
    await Promise.all(validators.map((v) => v.stop()));
    await bn.close();
  });
});
