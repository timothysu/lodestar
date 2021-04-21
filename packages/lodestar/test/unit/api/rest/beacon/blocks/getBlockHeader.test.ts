import {expect} from "chai";
import supertest from "supertest";
import {getBlockHeader} from "../../../../../../src/api/rest/beacon/blocks/getBlockHeader";
import {generateSignedBeaconHeaderResponse} from "../../../../../utils/api";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {IBeaconBlocksApi} from "../../../../../../src/api/impl/beacon/blocks";

describe("rest - beacon - getBlockHeader", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    (ctx.rest.server.api.beacon.blocks as SinonStubbedInstance<IBeaconBlocksApi>).getBlockHeader
      .withArgs("head")
      .resolves(generateSignedBeaconHeaderResponse());

    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getBlockHeader.url.replace(":blockId", "head")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
  });
});
