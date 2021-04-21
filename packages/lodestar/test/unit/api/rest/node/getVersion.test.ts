import {expect} from "chai";
import supertest from "supertest";

import {getVersion} from "../../../../../src/api/rest/node/getVersion";
import {ApiResponseBody, urlJoin} from "../utils";
import {NODE_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {StubbedNodeApi} from "../../../../utils/stub/nodeApi";

describe("rest - node - getVersion", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const nodeStub = ctx.rest.server.api.node as StubbedNodeApi;
    nodeStub.getVersion.resolves("test");
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(NODE_PREFIX, getVersion.url))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.not.be.empty;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.version).to.equal("test");
  });
});
