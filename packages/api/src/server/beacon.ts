import {ChainForkConfig} from "@chainsafe/lodestar-config";
import {ServerRoutes, getGenericJsonServer} from "./utils";
import {Api, ReqTypes, routesData, getReturnTypes, getReqSerializers} from "../routes/beacon";

export function getRoutes(config: ChainForkConfig, api: Api): ServerRoutes<Api, ReqTypes> {
  // All routes return JSON, use a server auto-generator
  return getGenericJsonServer<Api, ReqTypes>({routesData, getReturnTypes, getReqSerializers}, config, api);
}
