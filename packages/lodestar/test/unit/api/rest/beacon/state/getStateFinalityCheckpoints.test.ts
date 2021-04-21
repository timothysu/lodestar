import {expect} from "chai";
import supertest from "supertest";
import {getStateFinalityCheckpoints} from "../../../../../../src/api/rest/beacon/state/getStateFinalityCheckpoints";
import {generateState} from "../../../../../utils/state";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {BeaconStateApi} from "../../../../../../src/api/impl/beacon/state";
import {SinonStubbedInstance} from "sinon";

describe("rest - beacon - getStateFinalityCheckpoints", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const beaconStateStub = ctx.rest.server.api.beacon.state as SinonStubbedInstance<BeaconStateApi>;
    beaconStateStub.getState.withArgs("head").resolves(generateState());
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getStateFinalityCheckpoints.url.replace(":stateId", "head")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.finalized).to.not.be.undefined;
  });
});
