import {expect} from "chai";
import supertest from "supertest";
import {generateState} from "../../../../../utils/state";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {getStateFork} from "../../../../../../src/api/rest/beacon/state/getStateFork";
import {SinonStubbedInstance} from "sinon";
import {BeaconStateApi} from "../../../../../../src/api/impl/beacon/state";

describe("rest - beacon - getStateFork", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const beaconStateStub = ctx.rest.server.api.beacon.state as SinonStubbedInstance<BeaconStateApi>;
    beaconStateStub.getFork.withArgs("head").resolves(generateState().fork);
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getStateFork.url.replace(":stateId", "head")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.current_version).to.not.be.undefined;
  });
});
