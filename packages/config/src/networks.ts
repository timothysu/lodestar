import {IChainConfig} from "./chainConfig";
import {mainnetChainConfig} from "./chainConfig/networks/mainnet";
import {pyrmontChainConfig} from "./chainConfig/networks/pyrmont";
import {praterChainConfig} from "./chainConfig/networks/prater";
import {gnosisChainConfig} from "./chainConfig/networks/gnosis";

export {mainnetChainConfig, pyrmontChainConfig, praterChainConfig, gnosisChainConfig};

export type NetworkName = "mainnet" | "pyrmont" | "prater" | "gnosis";
export const networksChainConfig: Record<NetworkName, IChainConfig> = {
  mainnet: mainnetChainConfig,
  pyrmont: pyrmontChainConfig,
  prater: praterChainConfig,
  gnosis: gnosisChainConfig,
};
