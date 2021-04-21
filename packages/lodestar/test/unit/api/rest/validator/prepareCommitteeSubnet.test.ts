import {expect} from "chai";
import supertest from "supertest";
import {urlJoin} from "../utils";
import {setupRestApiTestServer, VALIDATOR_PREFIX} from "../setupApiImplTestServer";
import {prepareCommitteeSubnet} from "../../../../../src/api/rest/validator/prepareCommitteeSubnet";
import {SinonStubbedInstance} from "sinon";
import {ValidatorApi} from "../../../../../src/api";

/* eslint-disable @typescript-eslint/naming-convention */

describe("rest - validator - prepareCommitteeSubnet", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    const validatorStub = ctx.rest.server.api.validator as SinonStubbedInstance<ValidatorApi>;
    validatorStub.prepareBeaconCommitteeSubnet.resolves();
    await supertest(ctx.rest.server.server)
      .post(urlJoin(VALIDATOR_PREFIX, prepareCommitteeSubnet.url))
      .send([{validator_index: 1, committee_index: 2, committees_at_slot: 64, slot: 0, is_aggregator: false}])
      .expect(200);
    expect(
      validatorStub.prepareBeaconCommitteeSubnet.withArgs([
        {validatorIndex: 1, committeeIndex: 2, committeesAtSlot: 64, slot: 0, isAggregator: false},
      ]).calledOnce
    ).to.be.true;
  });

  it("missing param", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(VALIDATOR_PREFIX, prepareCommitteeSubnet.url))
      .send([{slot: 0}])
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");
  });
});
