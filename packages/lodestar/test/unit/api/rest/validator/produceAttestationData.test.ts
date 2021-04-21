import {expect} from "chai";
import supertest from "supertest";
import {produceAttestationData} from "../../../../../src/api/rest/validator/produceAttestationData";
import {generateEmptyAttestation} from "../../../../utils/attestation";
import {ApiResponseBody, urlJoin} from "../utils";
import {setupRestApiTestServer, VALIDATOR_PREFIX} from "../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {ValidatorApi} from "../../../../../src/api";

/* eslint-disable @typescript-eslint/naming-convention */

describe("rest - validator - produceAttestationData", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.produceAttestationData.resolves(generateEmptyAttestation().data);
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceAttestationData.url))
      .query({committee_index: 1, slot: 0})
      .expect(200);
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect(validatorStub.produceAttestationData.withArgs(1, 0).calledOnce).to.be.true;
  });

  it("missing param", async function () {
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.getAggregatedAttestation.resolves();
    await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceAttestationData.url))
      .query({slot: 0})
      .expect(400);
    expect(validatorStub.produceAttestationData.notCalled).to.be.true;
  });
});
