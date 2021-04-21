import {expect} from "chai";
import supertest from "supertest";

import {getBlock} from "../../../../../../src/api/rest/beacon/blocks/getBlock";
import {generateEmptySignedBlock} from "../../../../../utils/block";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {IBeaconBlocksApi} from "../../../../../../src/api/impl/beacon/blocks";

describe("rest - beacon - getBlock", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    (ctx.rest.server.api.beacon.blocks as SinonStubbedInstance<IBeaconBlocksApi>).getBlock
      .withArgs("head")
      .resolves(generateEmptySignedBlock());

    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getBlock.url.replace(":blockId", "head")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
  });
});
