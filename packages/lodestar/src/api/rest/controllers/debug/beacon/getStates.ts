import {ApiController, HttpHeader} from "../../types";
import {DefaultQuery} from "fastify";
import {toRestValidationError} from "../../utils";
import {ContainerType} from "@chainsafe/ssz";
import {allForks} from "@chainsafe/lodestar-types";

const SSZ_MIME_TYPE = "application/octet-stream";

export const getState: ApiController<DefaultQuery, {stateId: string}> = {
  url: "/beacon/states/:stateId",

  handler: async function (req, resp) {
    try {
      const state = await this.api.debug.beacon.getState(req.params.stateId);
      if (!state) {
        resp.status(404).send();
        return;
      }
      if (req.headers[HttpHeader.ACCEPT] === SSZ_MIME_TYPE) {
        const stateSsz = (this.config.getTypes(state.slot).BeaconState as ContainerType<
          allForks.BeaconState
        >).serialize(state);
        resp.status(200).header(HttpHeader.CONTENT_TYPE, SSZ_MIME_TYPE).send(Buffer.from(stateSsz));
      } else {
        resp.status(200).send({
          data: (this.config.getTypes(state.slot).BeaconState as ContainerType<allForks.BeaconState>).toJson(state, {
            case: "snake",
          }),
        });
      }
    } catch (e) {
      if ((e as Error).message === "Invalid state id") {
        throw toRestValidationError("state_id", (e as Error).message);
      }
      throw e;
    }
  },

  opts: {
    schema: {
      params: {
        type: "object",
        required: ["stateId"],
        properties: {
          blockId: {
            types: "string",
          },
        },
      },
    },
  },
};
