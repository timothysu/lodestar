import {config} from "@chainsafe/lodestar-config/minimal";
import {expect} from "chai";
import supertest from "supertest";
import {submitVoluntaryExit} from "../../../../../../src/api/rest/beacon/pool/submitVoluntaryExit";
import {generateEmptySignedVoluntaryExit} from "../../../../../utils/attestation";
import {urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {BeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool";

describe("rest - beacon - submitVoluntaryExit", function () {
  const ctx = setupRestApiTestServer();
  const voluntaryExit = generateEmptySignedVoluntaryExit();

  it("should succeed", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, submitVoluntaryExit.url))
      .send(config.types.phase0.SignedVoluntaryExit.toJson(voluntaryExit, {case: "snake"}) as Record<string, unknown>)
      .expect(200);

    const beaconPoolStub = ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>;
    expect(beaconPoolStub.submitVoluntaryExit.calledOnce).to.be.true;
  });

  it("should fail to parse body", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, submitVoluntaryExit.url))
      .send(config.types.phase0.SignedVoluntaryExit.toJson(voluntaryExit, {case: "camel"}) as Record<string, unknown>)
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");

    const beaconPoolStub = ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>;
    expect(beaconPoolStub.submitVoluntaryExit.notCalled).to.be.true;
  });
});
