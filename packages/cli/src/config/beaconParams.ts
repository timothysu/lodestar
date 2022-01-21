import {
  ChainConfig,
  createChainForkConfig,
  createChainConfig,
  ChainForkConfig,
  ChainConfig,
} from "@chainsafe/lodestar-config";
import {writeFile, readFile} from "../util";
import {getNetworkBeaconParams, NetworkName} from "../networks";
import {getGlobalPaths, IGlobalPaths} from "../paths/global";
import {IBeaconParamsUnparsed} from "./types";
import {parseBeaconParamsArgs, parseTerminalPowArgs, ITerminalPowArgs} from "../options";

type IBeaconParamsCliArgs = {
  network?: NetworkName;
  paramsFile: string;
} & Partial<IGlobalPaths>;

interface IBeaconParamsArgs {
  network?: NetworkName;
  paramsFile?: string;
  additionalParamsCli: IBeaconParamsUnparsed;
}

/**
 * Convenience method to parse yargs CLI args and call getBeaconParams
 * @see getBeaconConfig
 */
export function getBeaconConfigFromArgs(args: IBeaconParamsCliArgs): ChainForkConfig {
  return createChainForkConfig(getBeaconParamsFromArgs(args));
}

/**
 * Convenience method to parse yargs CLI args and call getBeaconParams
 * @see getBeaconParams
 */
export function getBeaconParamsFromArgs(args: IBeaconParamsCliArgs): ChainConfig {
  return getBeaconParams({
    network: args.network,
    paramsFile: getGlobalPaths(args).paramsFile,
    additionalParamsCli: {
      ...parseBeaconParamsArgs(args as Record<string, string | number>),
      ...parseTerminalPowArgs(args as ITerminalPowArgs),
    },
  });
}

/**
 * Initializes BeaconConfig with params
 * @see getBeaconParams
 */
export function getBeaconConfig(args: IBeaconParamsArgs): ChainForkConfig {
  return createChainForkConfig(getBeaconParams(args));
}

/**
 * Computes merged IBeaconParams type from (in order)
 * - Network params (diff)
 * - existing params file
 * - CLI flags
 */
export function getBeaconParams({network, paramsFile, additionalParamsCli}: IBeaconParamsArgs): ChainConfig {
  // Default network params
  const networkParams: Partial<ChainConfig> = network ? getNetworkBeaconParams(network) : {};
  // Existing user custom params from file
  const fileParams: Partial<ChainConfig> = paramsFile ? parsePartialChainConfigJson(readBeaconParams(paramsFile)) : {};
  // Params from CLI flags
  const cliParams: Partial<ChainConfig> = parsePartialChainConfigJson(additionalParamsCli);

  return createChainConfig({
    ...networkParams,
    ...fileParams,
    ...cliParams,
  });
}

export function writeBeaconParams(filepath: string, params: ChainConfig): void {
  writeFile(filepath, ChainConfig.toJson(params));
}

function readBeaconParams(filepath: string): IBeaconParamsUnparsed {
  return readFile(filepath) ?? {};
}

export function parsePartialChainConfigJson(input: Record<string, unknown>): Partial<ChainConfig> {
  const config = {};

  // Parse config input values, if they exist
  for (const [fieldName, fieldType] of Object.entries(input)) {
    if (input[fieldName] != null) {
      (config as Record<string, unknown>)[fieldName] = fieldType.fromJson(input[fieldName] as Json);
    }
  }

  return config;
}

function parseSpecValue(valueStr: string, typeName: SpecValueTypeName): SpecValue {
  switch (typeName) {
    case "bigint":
      return BigInt(valueStr);
    case "bytes":
      return fromHexString(valueStr);
    case "string":
      return valueStr;
    default:
      return parseInt(valueStr);
  }
}
