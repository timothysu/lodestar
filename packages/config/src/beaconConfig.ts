import {Root} from "@chainsafe/lodestar-types";
import {createChainConfig, ChainConfig} from "./chainConfig";
import {createForkConfig, ForkConfig} from "./forkConfig";
import {createICachedGenesis} from "./genesisConfig";
import {ICachedGenesis} from "./genesisConfig/types";

/**
 * Chain run-time configuration with additional fork schedule helpers
 */
export type IChainForkConfig = ChainConfig & ForkConfig;

export type IBeaconConfig = IChainForkConfig & ICachedGenesis;

/**
 * Create an `IBeaconConfig`, filling in missing values with preset defaults
 */
export function createChainForkConfig(chainConfig: Partial<ChainConfig>): IChainForkConfig {
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
    ...createICachedGenesis(chainForkConfig, genesisValidatorsRoot),
  };
}
