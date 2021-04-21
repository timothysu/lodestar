import {toHexString} from "@chainsafe/ssz";
import {expect} from "chai";
import supertest from "supertest";
import {produceBlockController} from "../../../../../src/api/rest/validator/produceBlock";
import {generateEmptyBlock} from "../../../../utils/block";
import {ApiResponseBody, urlJoin} from "../utils";
import {setupRestApiTestServer, VALIDATOR_PREFIX} from "../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {ValidatorApi} from "../../../../../src/api";

/* eslint-disable @typescript-eslint/naming-convention */

describe("rest - validator - produceBlock", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.produceBlock.resolves(generateEmptyBlock());
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceBlockController.url.replace(":slot", "5")))
      .query({randao_reveal: toHexString(Buffer.alloc(32, 1)), graffiti: "0x2123"})
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect(validatorStub.produceBlock.withArgs(5, Buffer.alloc(32, 1), "0x2123"));
  });

  it("missing randao reveal", async function () {
    await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceBlockController.url.replace(":slot", "5")))
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");
  });

  it("invalid slot", async function () {
    await supertest(ctx.rest.server.server)
      .get(urlJoin(VALIDATOR_PREFIX, produceBlockController.url.replace(":slot", "0")))
      .query({randao_reveal: toHexString(Buffer.alloc(32, 1))})
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");
  });
});
