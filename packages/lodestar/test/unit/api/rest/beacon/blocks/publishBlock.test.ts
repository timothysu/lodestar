import {config} from "@chainsafe/lodestar-config/minimal";
import {expect} from "chai";
import supertest from "supertest";
import {publishBlock} from "../../../../../../src/api/rest/beacon/blocks/publishBlock";
import {generateEmptySignedBlock} from "../../../../../utils/block";
import {urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconBlockApi} from "../../../../../../src/api/impl/beacon/blocks";

describe("rest - beacon - publishBlock", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const block = generateEmptySignedBlock();
    const beaconBlocksStub = ctx.rest.server.api.beacon.blocks as SinonStubbedInstance<BeaconBlockApi>;
    beaconBlocksStub.publishBlock.resolves();
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, publishBlock.url))
      .send(config.types.phase0.SignedBeaconBlock.toJson(block, {case: "snake"}) as Record<string, unknown>)
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
  });

  it("bad body", async function () {
    const beaconBlocksStub = ctx.rest.server.api.beacon.blocks as SinonStubbedInstance<BeaconBlockApi>;
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, publishBlock.url))
      .send({})
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect(beaconBlocksStub.publishBlock.notCalled).to.be.true;
  });
});
