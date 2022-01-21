import {createChainForkConfig} from "./beaconConfig";
import {chainConfig as mainnetChainConfig} from "./chainConfig/presets/mainnet";
import {chainConfig as minimalChainConfig} from "./chainConfig/presets/minimal";

export {mainnetChainConfig, minimalChainConfig};
// for testing purpose only
export const mainnet = createChainForkConfig(mainnetChainConfig);
export const minimal = createChainForkConfig(minimalChainConfig);
