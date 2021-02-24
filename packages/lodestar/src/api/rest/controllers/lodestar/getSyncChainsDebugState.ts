import {ApiController} from "../types";
import {DefaultQuery} from "fastify";

export const getSyncChainsDebugState: ApiController<DefaultQuery> = {
  url: "/sync-chains-debug-state",
  opts: {},
  handler: async function (req, resp) {
    resp.status(200).send(this.api.lodestar.getSyncChainsDebugState());
  },
};
