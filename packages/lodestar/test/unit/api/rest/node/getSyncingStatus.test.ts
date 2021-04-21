import {expect} from "chai";
import supertest from "supertest";

import {getSyncingStatus} from "../../../../../src/api/rest/node/getSyncingStatus";
import {ApiResponseBody, urlJoin} from "../utils";
import {NODE_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {StubbedNodeApi} from "../../../../utils/stub/nodeApi";

describe("rest - node - getSyncingStatus", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const nodeStub = ctx.rest.server.api.node as StubbedNodeApi;
    nodeStub.getSyncingStatus.resolves({
      headSlot: BigInt(3),
      syncDistance: BigInt(2),
    });
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(NODE_PREFIX, getSyncingStatus.url))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.not.be.empty;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.head_slot).to.equal("3");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.sync_distance).to.equal("2");
  });
});
