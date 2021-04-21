import {expect} from "chai";
import supertest from "supertest";
import {config} from "@chainsafe/lodestar-config/minimal";

import {SinonStubbedInstance} from "sinon";
import {DebugBeaconApi} from "../../../../../../src/api/impl/debug/beacon";
import {generateState} from "../../../../../utils/state";
import {ApiResponseBody} from "../../utils";
import {setupRestApiTestServer} from "../../setupApiImplTestServer";

describe("rest - debug - beacon - getState", function () {
  const ctx = setupRestApiTestServer();

  it("should get state json successfully", async function () {
    const debugBeaconStub = ctx.api.debug.beacon as SinonStubbedInstance<DebugBeaconApi>;
    debugBeaconStub.getState.resolves(generateState());
    const response = await supertest(ctx.rest.server.server)
      .get("/eth/v1/debug/beacon/states/0xSomething")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
  });

  it("should get state ssz successfully", async function () {
    const state = generateState();
    const debugBeaconStub = ctx.api.debug.beacon as SinonStubbedInstance<DebugBeaconApi>;
    debugBeaconStub.getState.resolves(state);
    const response = await supertest(ctx.rest.server.server)
      .get("/eth/v1/debug/beacon/states/0xSomething")
      .accept("application/octet-stream")
      .expect(200)
      .expect("Content-Type", "application/octet-stream");
    expect(response.body).to.be.deep.equal(config.getTypes(state.slot).BeaconState.serialize(state));
  });
});
