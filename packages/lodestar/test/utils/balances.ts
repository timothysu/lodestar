import {List} from "@chainsafe/ssz";
import {ChainForkConfig} from "@chainsafe/lodestar-config";
import {MAX_EFFECTIVE_BALANCE} from "@chainsafe/lodestar-params";

export function generateInitialMaxBalances(config: ChainForkConfig, count?: number): List<number> {
  return Array.from({length: count ?? config.MIN_GENESIS_ACTIVE_VALIDATOR_COUNT}, () =>
    Number(MAX_EFFECTIVE_BALANCE)
  ) as List<number>;
}
