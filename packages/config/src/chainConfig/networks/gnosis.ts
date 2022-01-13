import {fromHexString as b} from "@chainsafe/ssz";
import {PresetName} from "@chainsafe/lodestar-params";
import {IChainConfig} from "../types";
import {chainConfig as mainnet} from "../presets/mainnet";

/* eslint-disable @typescript-eslint/naming-convention */

export const gnosisChainConfig: IChainConfig = {
  ...mainnet,
  PRESET_BASE: PresetName.mainnet,
  CONFIG_NAME: "gnosis",

  CHURN_LIMIT_QUOTIENT: 4096,
  // 2**10 (= 1024) ~1.4 hour
  ETH1_FOLLOW_DISTANCE: 1024,
  // 6 (estimate from xDai mainnet)
  SECONDS_PER_ETH1_BLOCK: 6,
  // 5 seconds
  SECONDS_PER_SLOT: 5,

  // Dec 08, 2021, 13:00 UTC
  MIN_GENESIS_TIME: 1638968400,
  MIN_GENESIS_ACTIVE_VALIDATOR_COUNT: 4096,
  // Customized for GBC: ~1 hour
  GENESIS_DELAY: 6000,

  // xDai Mainnet
  DEPOSIT_CHAIN_ID: 100,
  DEPOSIT_NETWORK_ID: 100,
  // GBC deposit contract on xDai Mainnet
  DEPOSIT_CONTRACT_ADDRESS: b("0x0b98057ea310f4d31f2a452b414647007d1645d9"),

  // GBC area code
  GENESIS_FORK_VERSION: b("0x00000064"),
  ALTAIR_FORK_VERSION: b("0x01000064"),
  ALTAIR_FORK_EPOCH: 512,
};
