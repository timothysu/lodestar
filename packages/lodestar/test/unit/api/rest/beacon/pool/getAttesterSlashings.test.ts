import {expect} from "chai";
import supertest from "supertest";
import {getAttesterSlashings} from "../../../../../../src/api/rest/beacon/pool/getAttesterSlashings";
import {generateEmptyAttesterSlashing} from "../../../../../utils/slashings";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool";

describe("rest - beacon - getAttesterSlashings", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    (ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>).getAttesterSlashings.resolves([
      generateEmptyAttesterSlashing(),
    ]);

    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getAttesterSlashings.url))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data.length).to.be.equal(1);
  });
});
