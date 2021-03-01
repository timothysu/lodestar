import {FastifyInstance} from "fastify";
import {getWtfNode, getHeapdump} from "../controllers/lodestar";

/**
 * Register /lodestar route
 */
export function registerLodestarRoutes(server: FastifyInstance): void {
  server.register(
    async function (fastify) {
      fastify.get(getHeapdump.url, getHeapdump.opts, getHeapdump.handler);
      fastify.get(getWtfNode.url, getWtfNode.opts, getWtfNode.handler);
    },
    {prefix: "/v1/lodestar"}
  );
}
