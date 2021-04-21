import supertest from "supertest";

import {getHealth} from "../../../../../src/api/rest/node/getHealth";
import {urlJoin} from "../utils";
import {NODE_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {StubbedNodeApi} from "../../../../utils/stub/nodeApi";

describe("rest - node - getHealth", function () {
  const ctx = setupRestApiTestServer();

  it("ready", async function () {
    const nodeStub = ctx.rest.server.api.node as StubbedNodeApi;
    nodeStub.getNodeStatus.resolves("ready");
    await supertest(ctx.rest.server.server).get(urlJoin(NODE_PREFIX, getHealth.url)).expect(200);
  });

  it("syncing", async function () {
    const nodeStub = ctx.rest.server.api.node as StubbedNodeApi;
    nodeStub.getNodeStatus.resolves("syncing");
    await supertest(ctx.rest.server.server).get(urlJoin(NODE_PREFIX, getHealth.url)).expect(206);
  });

  it("error", async function () {
    const nodeStub = ctx.rest.server.api.node as StubbedNodeApi;
    nodeStub.getNodeStatus.resolves("error");
    await supertest(ctx.rest.server.server).get(urlJoin(NODE_PREFIX, getHealth.url)).expect(503);
  });
});
