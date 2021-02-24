import {FastifyInstance} from "fastify";
import {getSyncChainsDebugState} from "../controllers/lodestar";

export function registerLodestarRoutes(server: FastifyInstance): void {
  server.register(
    async function (fastify) {
      fastify.get(getSyncChainsDebugState.url, getSyncChainsDebugState.opts, getSyncChainsDebugState.handler);
    },
    {prefix: "/v1/lodestar"}
  );
}
