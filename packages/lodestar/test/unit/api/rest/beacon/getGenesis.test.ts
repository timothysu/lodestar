import supertest from "supertest";
import {expect} from "chai";
import {config} from "@chainsafe/lodestar-config/mainnet";

import {getGenesis} from "../../../../../src/api/rest/beacon/getGenesis";
import {ApiResponseBody, urlJoin} from "../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../setupApiImplTestServer";
import {BeaconApi} from "../../../../../src/api";
import {SinonStubbedInstance} from "sinon";

describe("rest - beacon - getGenesis", function () {
  const ctx = setupRestApiTestServer();

  it("should get genesis object", async function () {
    const beaconStub = ctx.rest.server.api.beacon as SinonStubbedInstance<BeaconApi>;
    beaconStub.getGenesis.resolves({
      genesisForkVersion: config.params.GENESIS_FORK_VERSION,
      genesisTime: BigInt(0),
      genesisValidatorsRoot: Buffer.alloc(32),
    });
    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getGenesis.url))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.genesis_time).to.equal("0");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.data.genesis_validators_root).to.not.be.empty;
  });
});
