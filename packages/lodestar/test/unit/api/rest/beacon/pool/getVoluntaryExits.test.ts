import {expect} from "chai";
import supertest from "supertest";
import {getVoluntaryExits} from "../../../../../../src/api/rest/beacon/pool/getVoluntaryExits";
import {generateEmptySignedVoluntaryExit} from "../../../../../utils/attestation";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool";

describe("rest - beacon - getVoluntaryExits", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    (ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>).getVoluntaryExits
      .withArgs()
      .resolves([generateEmptySignedVoluntaryExit()]);

    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getVoluntaryExits.url))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data.length).to.be.equal(1);
  });
});
