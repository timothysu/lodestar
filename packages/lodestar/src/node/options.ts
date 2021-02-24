/**
 * @module node
 */

import {defaultChainOptions, IChainOptions} from "../chain/options";
import {defaultDbOptions, IDatabaseOptions} from "../db/options";
import {defaultApiOptions, IApiOptions} from "../api/options";
import {defaultEth1Options, IEth1Options} from "../eth1/options";
import {defaultNetworkOptions, INetworkOptions} from "../network/options";
import {defaultLoggerOptions, IBeaconLoggerOptions} from "./loggerOptions";
import {defaultMetricsOptions, IMetricsOptions} from "../metrics/options";
import {SyncOptions} from "../sync";

export interface IBeaconNodeOptions {
  chain: IChainOptions;
  db: IDatabaseOptions;
  api: IApiOptions;
  eth1: IEth1Options;
  network: INetworkOptions;
  logger: IBeaconLoggerOptions;
  metrics: IMetricsOptions;
  sync: SyncOptions;
}

export const defaultOptions: IBeaconNodeOptions = {
  chain: defaultChainOptions,
  db: defaultDbOptions,
  api: defaultApiOptions,
  eth1: defaultEth1Options,
  network: defaultNetworkOptions,
  logger: defaultLoggerOptions,
  metrics: defaultMetricsOptions,
  sync: {},
};
