import {expect} from "chai";
import supertest from "supertest";

import {getPeers} from "../../../../../src/api/rest/node/getPeers";
import {ApiResponseBody, urlJoin} from "../utils";
import {NODE_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {StubbedNodeApi} from "../../../../utils/stub/nodeApi";

describe("rest - node - getPeers", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const nodeStub = ctx.rest.server.api.node as StubbedNodeApi;
    nodeStub.getPeers.withArgs(["connected"], undefined).resolves([
      {
        lastSeenP2pAddress: "/ip4/127.0.0.1/tcp/36000",
        direction: "inbound",
        enr: "enr-",
        peerId: "16",
        state: "connected",
      },
    ]);
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(NODE_PREFIX, getPeers.url))
      .query({state: "connected"})
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data).to.not.be.empty;
    expect((response.body as ApiResponseBody).data.length).to.equal(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data[0].peer_id).to.equal("16");
  });
});
