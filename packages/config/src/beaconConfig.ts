import {Root} from "@chainsafe/lodestar-types";
import {createChainConfig, ChainConfig} from "./chainConfig";
import {createForkConfig, ForkConfig} from "./forkConfig";
import {createCachedGenesis} from "./genesisConfig";
import {CachedGenesis} from "./genesisConfig/types";

/**
 * Chain run-time configuration with additional fork schedule helpers
 */
export type ChainForkConfig = ChainConfig & ForkConfig;

export type IBeaconConfig = ChainForkConfig & CachedGenesis;

/**
 * Create an `IBeaconConfig`, filling in missing values with preset defaults
 */
export function createChainForkConfig(chainConfig: Partial<ChainConfig>): ChainForkConfig {
  const fullChainConfig = createChainConfig(chainConfig);
  return {
    ...fullChainConfig,
    ...createForkConfig(fullChainConfig),
  };
}

export function createIBeaconConfig(chainConfig: Partial<ChainConfig>, genesisValidatorsRoot: Root): IBeaconConfig {
  const chainForkConfig = createChainForkConfig(chainConfig);
  return {
    ...chainForkConfig,
    ...createCachedGenesis(chainForkConfig, genesisValidatorsRoot),
  };
}
