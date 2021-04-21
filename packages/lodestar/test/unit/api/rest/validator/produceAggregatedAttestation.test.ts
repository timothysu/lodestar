import {config} from "@chainsafe/lodestar-config/minimal";
import {toHexString} from "@chainsafe/ssz";
import {expect} from "chai";
import supertest from "supertest";
import {produceAggregatedAttestation} from "../../../../../src/api/rest/validator/produceAggregatedAttestation";
import {generateEmptyAttestation} from "../../../../utils/attestation";
import {ApiResponseBody, urlJoin} from "../utils";
import {setupRestApiTestServer, VALIDATOR_PREFIX} from "../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {ValidatorApi} from "../../../../../src/api";

/* eslint-disable @typescript-eslint/naming-convention */

describe("rest - validator - produceAggregatedAttestation", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const root = config.types.Root.defaultValue();
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.getAggregatedAttestation.resolves(generateEmptyAttestation());
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceAggregatedAttestation.url))
      .query({attestation_data_root: toHexString(root), slot: 0})
      .expect(200);
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect(validatorStub.getAggregatedAttestation.withArgs(root, 0).calledOnce).to.be.true;
  });

  it("missing param", async function () {
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.getAggregatedAttestation.resolves();
    await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceAggregatedAttestation.url))
      .query({slot: 0})
      .expect(400);
    expect(validatorStub.getAggregatedAttestation.notCalled).to.be.true;
  });
});
