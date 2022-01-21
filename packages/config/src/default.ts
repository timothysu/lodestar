import {createChainForkConfig} from "./beaconConfig";
import {defaultChainConfig} from "./chainConfig";

export const chainConfig = defaultChainConfig;
// for testing purpose only
export const config = createChainForkConfig(defaultChainConfig);
