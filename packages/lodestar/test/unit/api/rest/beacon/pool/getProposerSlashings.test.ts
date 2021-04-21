import {expect} from "chai";
import supertest from "supertest";
import {getProposerSlashings} from "../../../../../../src/api/rest/beacon/pool/getProposerSlashings";
import {generateEmptyProposerSlashing} from "../../../../../utils/slashings";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool";

describe("rest - beacon - getProposerSlashings", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    (ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>).getProposerSlashings.resolves([
      generateEmptyProposerSlashing(),
    ]);

    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getProposerSlashings.url))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data.length).to.be.equal(1);
  });
});
