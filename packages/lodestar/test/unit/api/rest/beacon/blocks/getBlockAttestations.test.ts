import {expect} from "chai";
import supertest from "supertest";

import {List} from "@chainsafe/ssz";
import {phase0} from "@chainsafe/lodestar-types";

import {getBlockAttestations} from "../../../../../../src/api/rest/beacon/blocks/getBlockAttestations";
import {generateSignedBlock} from "../../../../../utils/block";
import {generateEmptyAttestation} from "../../../../../utils/attestation";
import {ApiResponseBody, urlJoin} from "../../utils";
import {BEACON_PREFIX, setupRestApiTestServer} from "../../setupApiImplTestServer";
import {SinonStubbedInstance} from "sinon";
import {IBeaconBlocksApi} from "../../../../../../src/api/impl/beacon/blocks";

describe("rest - beacon - getBlockAttestations", function () {
  const ctx = setupRestApiTestServer();

  it("should succeed", async function () {
    (ctx.rest.server.api.beacon.blocks as SinonStubbedInstance<IBeaconBlocksApi>).getBlock.withArgs("head").resolves(
      generateSignedBlock({
        message: {
          body: {
            attestations: [generateEmptyAttestation(), generateEmptyAttestation()] as List<phase0.Attestation>,
          },
        },
      })
    );

    const response = await supertest(ctx.rest.server.server)
      .get(urlJoin(BEACON_PREFIX, getBlockAttestations.url.replace(":blockId", "head")))
      .expect(200)
      .expect("Content-Type", "application/json; charset=utf-8");
    expect((response.body as ApiResponseBody).data).to.not.be.undefined;
    expect((response.body as ApiResponseBody).data.length).to.equal(2);
  });
});
