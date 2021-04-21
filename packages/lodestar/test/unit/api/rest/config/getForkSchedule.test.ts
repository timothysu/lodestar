import {phase0} from "@chainsafe/lodestar-types";
import {urlJoin} from "@chainsafe/lodestar-validator/src/util";
import {expect} from "chai";
import supertest from "supertest";
import {CONFIG_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {getForkSchedule} from "../../../../../src/api/rest/config/getForkSchedule";
import {SinonStubbedInstance} from "sinon";
import {ConfigApi} from "../../../../../src/api/impl/config";
import {ApiResponseBody} from "../utils";

describe("rest - config - getForkSchedule", function () {
  const ctx = setupRestApiTestServer();

  it("ready", async function () {
    const configStub = ctx.rest.server.api.config as SinonStubbedInstance<ConfigApi>;
    const expectedData: phase0.Fork[] = [];
    configStub.getForkSchedule.resolves(expectedData);
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(CONFIG_PREFIX, getForkSchedule.url))
      .expect(200);
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.deep.equal(expectedData);
  });
});
