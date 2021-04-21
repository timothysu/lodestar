import {config} from "@chainsafe/lodestar-config/minimal";
import {BeaconParams} from "@chainsafe/lodestar-params";
import {urlJoin} from "@chainsafe/lodestar-validator/src/util";
import {expect} from "chai";
import supertest from "supertest";
import {CONFIG_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {getSpec} from "../../../../../src/api/rest/config/getSpec";
import {SinonStubbedInstance} from "sinon";
import {ConfigApi} from "../../../../../src/api/impl/config";
import {ApiResponseBody} from "../utils";

describe("rest - config - getSpec", function () {
  const ctx = setupRestApiTestServer();

  it("ready", async function () {
    const configStub = ctx.rest.server.api.config as SinonStubbedInstance<ConfigApi>;
    configStub.getSpec.resolves(config.params);
    const response = await supertest(ctx.rest.server.server).get(urlJoin(CONFIG_PREFIX, getSpec.url)).expect(200);
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.deep.equal(BeaconParams.toJson(config.params));
  });
});
