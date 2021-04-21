import {config} from "@chainsafe/lodestar-config/minimal";
import {expect} from "chai";
import supertest from "supertest";
import {urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {generateAttestation} from "../../../../../utils/attestation";
import {submitPoolAttestation} from "../../../../../../src/api/rest/beacon/pool/submitPoolAttestation";
import {SinonStubbedInstance} from "sinon";
import {BeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool";

describe("rest - beacon - submitAttestations", function () {
  const ctx = setupRestApiTestServer();
  const attestation = generateAttestation();

  it("should succeed", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, submitPoolAttestation.url))
      .send([config.types.phase0.Attestation.toJson(attestation, {case: "snake"}) as Record<string, unknown>])
      .expect(200);

    const beaconPoolStub = ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>;
    expect(beaconPoolStub.submitAttestations.calledOnce).to.be.true;
  });

  it("should fail to parse body", async function () {
    await supertest(ctx.rest.server.server)
      .post(urlJoin(BEACON_PREFIX, submitPoolAttestation.url))
      .send([config.types.phase0.Attestation.toJson(attestation, {case: "camel"}) as Record<string, unknown>])
      .expect(400)
      .expect("Content-Type", "application/json; charset=utf-8");

    const beaconPoolStub = ctx.rest.server.api.beacon.pool as SinonStubbedInstance<BeaconPoolApi>;
    expect(beaconPoolStub.submitAttestations.notCalled).to.be.true;
  });
});
