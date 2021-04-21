import {config} from "@chainsafe/lodestar-config/minimal";
import {expect} from "chai";
import supertest from "supertest";
import {proposerDutiesController} from "../../../../../src/api/rest/validator/duties/proposerDuties";
import {urlJoin} from "../utils";
import {setupRestApiTestServer, VALIDATOR_PREFIX} from "../setupApiImplTestServer";
import {ValidatorApi} from "../../../../../src/api";
import {SinonStubbedInstance} from "sinon";
import {ProposerDuty} from "@chainsafe/lodestar-types/phase0";

describe("rest - validator - proposerDuties", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.getProposerDuties.resolves([
      config.types.phase0.ProposerDuty.defaultValue(),
      config.types.phase0.ProposerDuty.defaultValue(),
    ]);
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, proposerDutiesController.url.replace(":epoch", "1")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as {data: ProposerDuty}).data).to.be.instanceOf(Array);
    expect((response.body as {data: ProposerDuty}).data).to.have.length(2);
    expect(validatorStub.getProposerDuties.withArgs(1).calledOnce).to.be.true;
  });

  it("invalid epoch", async function () {
    await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, proposerDutiesController.url.replace(":epoch", "a")))
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");
  });
});
