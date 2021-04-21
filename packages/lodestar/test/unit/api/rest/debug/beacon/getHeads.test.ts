import {expect} from "chai";
import supertest from "supertest";
import {ZERO_HASH} from "@chainsafe/lodestar-beacon-state-transition";
import {SinonStubbedInstance} from "sinon";
import {DebugBeaconApi} from "../../../../../../src/api/impl/debug/beacon";
import {setupRestApiTestServer} from "../../setupApiImplTestServer";
import {ApiResponseBody} from "../../utils";

describe("rest - debug - beacon - getHeads", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const debugBeaconStub = ctx.rest.server.api.debug.beacon as SinonStubbedInstance<DebugBeaconApi>;
    debugBeaconStub.getHeads.resolves([{slot: 100, root: ZERO_HASH}]);
    const response = await supertest(ctx.rest.server.server)
      .get("/eth/v1/debug/beacon/heads")
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
  });
});
