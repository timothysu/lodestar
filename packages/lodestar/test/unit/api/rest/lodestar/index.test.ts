import supertest from "supertest";

import {getLatestWeakSubjectivityCheckpointEpoch} from "../../../../../src/api/rest/lodestar";
import {urlJoin} from "../utils";
import {LODESTAR_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {StubbedLodestarApi} from "../../../../utils/stub/lodestarApi";

describe("rest - lodestar - getLatestWeakSubjectivityCheckpointEpoch", function () {
  const ctx = setupRestApiTestServer();

  it("success", async function () {
    const lodestarApiStub = ctx.rest.server.api.lodestar as StubbedLodestarApi;
    lodestarApiStub.getLatestWeakSubjectivityCheckpointEpoch.resolves(0);
    await supertest(ctx.rest.server.server)
      .get(urlJoin(LODESTAR_PREFIX, getLatestWeakSubjectivityCheckpointEpoch.url))
      .expect(200);
  });
});
