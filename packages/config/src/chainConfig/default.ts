import {ACTIVE_PRESET, PresetName} from "@chainsafe/lodestar-params";
import {ChainConfig} from "./types";
import {chainConfig as mainnet} from "./presets/mainnet";
import {chainConfig as minimal} from "./presets/minimal";

let defaultChainConfig: ChainConfig;

switch (ACTIVE_PRESET) {
  case PresetName.minimal:
    defaultChainConfig = minimal;
    break;
  case PresetName.mainnet:
  default:
    defaultChainConfig = mainnet;
    break;
}

export {defaultChainConfig};
