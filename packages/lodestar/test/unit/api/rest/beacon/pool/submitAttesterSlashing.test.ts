import {config} from "@chainsafe/lodestar-config/minimal";
import {expect} from "chai";
import supertest from "supertest";
import {submitAttesterSlashing} from "../../../../../../src/api/rest/beacon/pool/submitAttesterSlashing";
import {generateEmptyAttesterSlashing} from "../../../../../utils/slashings";
import {urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool";

describe("rest - beacon - submitAttesterSlashing", function () {
  const ctx = setupRestApiTestServer();
  const slashing = generateEmptyAttesterSlashing();

  it("should succeed", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, submitAttesterSlashing.url))
      .send(config.types.phase0.AttesterSlashing.toJson(slashing, {case: "snake"}) as Record<string, unknown>)
      .expect(200);

    const beaconPoolStub = ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>;
    expect(beaconPoolStub.submitAttesterSlashing.calledOnce).to.be.true;
  });

  it("should fail to parse body", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, submitAttesterSlashing.url))
      .send(config.types.phase0.AttesterSlashing.toJson(slashing, {case: "camel"}) as Record<string, unknown>)
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");

    const beaconPoolStub = ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>;
    expect(beaconPoolStub.submitAttesterSlashing.notCalled).to.be.true;
  });
});
