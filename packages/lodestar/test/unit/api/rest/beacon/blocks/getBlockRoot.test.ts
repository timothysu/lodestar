import {expect} from "chai";
import supertest from "supertest";
import {toHexString} from "@chainsafe/ssz";
import {config} from "@chainsafe/lodestar-config/minimal";

import {getBlockRoot} from "../../../../../../src/api/rest/beacon/blocks/getBlockRoot";
import {generateEmptySignedBlock} from "../../../../../utils/block";
import {urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconBlockApi} from "../../../../../../src/api/impl/beacon/blocks";

describe("rest - beacon - getBlockRoot", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const block = generateEmptySignedBlock();
    const beaconBlocksStub = ctx.rest.server.api.beacon.blocks as SinonStubbedInstance<BeaconBlockApi>;
    beaconBlocksStub.getBlock.withArgs("head").resolves(block);
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getBlockRoot.url.replace(":blockId", "head")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.root).to.be.equal(
      toHexString(config.types.phase0.BeaconBlock.hashTreeRoot(block.message))
    );
  });
});
