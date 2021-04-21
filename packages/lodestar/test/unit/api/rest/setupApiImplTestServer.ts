import {config} from "@chainsafe/lodestar-config/mainnet";

import {ApiNamespace, RestApi} from "../../../../src/api";
import {StubbedApi} from "../../../utils/stub/api";
import {testLogger} from "../../../utils/logger";

export const BEACON_PREFIX = "/eth/v1/beacon";
export const CONFIG_PREFIX = "/eth/v1/config";
export const NODE_PREFIX = "/eth/v1/node";
export const VALIDATOR_PREFIX = "/eth/v1/validator";
export const LODESTAR_PREFIX = "/eth/v1/lodestar";

type Ctx = {rest: RestApi; api: StubbedApi};

export function setupRestApiTestServer(): Ctx {
  const ctx = {} as Ctx;

  before(async () => {
    ctx.api = new StubbedApi();
    ctx.rest = await RestApi.init(
      {
        api: [
          ApiNamespace.BEACON,
          ApiNamespace.CONFIG,
          ApiNamespace.DEBUG,
          ApiNamespace.EVENTS,
          ApiNamespace.NODE,
          ApiNamespace.VALIDATOR,
          ApiNamespace.LODESTAR,
        ],
        cors: "*",
        enabled: true,
        host: "127.0.0.1",
        port: 0,
      },
      {
        config,
        logger: testLogger(),
        api: ctx.api,
      }
    );
  });

  after(async () => {
    await ctx.rest.close();
  });

  return ctx;
}
