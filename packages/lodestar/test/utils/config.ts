import {config as chainConfig} from "@chainsafe/lodestar-config/default";
import {createBeaconConfig} from "@chainsafe/lodestar-config";
import {ZERO_HASH} from "../../src/constants";

/** default config with ZERO_HASH as genesisValidatorsRoot */
export const config = createBeaconConfig(chainConfig, ZERO_HASH);
