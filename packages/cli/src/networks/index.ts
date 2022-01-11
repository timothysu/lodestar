import {IBeaconNodeOptions} from "@chainsafe/lodestar";
import {IChainConfig, IChainForkConfig} from "@chainsafe/lodestar-config";
import {allForks} from "@chainsafe/lodestar-types";
import {RecursivePartial} from "@chainsafe/lodestar-utils";
// eslint-disable-next-line no-restricted-imports
import {getStateTypeFromBytes} from "@chainsafe/lodestar/lib/util/multifork";
import {TreeBacked} from "@chainsafe/ssz";
import fs from "fs";
import got from "got";
import * as mainnet from "./mainnet";
import * as pyrmont from "./pyrmont";
import * as prater from "./prater";
import * as gnosis from "./gnosis";

export type NetworkName = "mainnet" | "pyrmont" | "prater" | "gnosis" | "dev";
export const networkNames: NetworkName[] = ["mainnet", "pyrmont", "prater", "gnosis"];

function getNetworkData(
  network: NetworkName
): {
  chainConfig: IChainConfig;
  depositContractDeployBlock: number;
  genesisFileUrl: string | null;
  bootnodesFileUrl: string | null;
  bootEnrs: string[];
} | null {
  switch (network) {
    case "mainnet":
      return mainnet;
    case "pyrmont":
      return pyrmont;
    case "prater":
      return prater;
    case "gnosis":
      return gnosis;
    default:
      return null;
  }
}

export function getNetworkBeaconParams(network: NetworkName): IChainConfig {
  const networkData = getNetworkData(network);
  if (!networkData) {
    throw Error(`Network not supported: ${network}`);
  }
  return networkData.chainConfig;
}

export function getNetworkBeaconNodeOptions(network: NetworkName): RecursivePartial<IBeaconNodeOptions> {
  const networkData = getNetworkData(network);
  if (!networkData) {
    throw Error(`Network not supported: ${network}`);
  }

  return {
    eth1: {
      depositContractDeployBlock: networkData.depositContractDeployBlock,
    },
    network: {
      discv5: {
        enabled: true,
        bootEnrs: networkData.bootEnrs,
      },
    },
  };
}

/**
 * Get genesisStateFile URL to download. Returns null if not available
 */
export function getGenesisFileUrl(network: NetworkName): string | null {
  const networkData = getNetworkData(network);
  return networkData && networkData.genesisFileUrl;
}

/**
 * Fetches the latest list of bootnodes for a network
 * Bootnodes file is expected to contain bootnode ENR's concatenated by newlines
 */
export async function fetchBootnodes(network: NetworkName): Promise<string[]> {
  const networkData = getNetworkData(network);
  if (!networkData) {
    throw Error(`Network not supported: ${network}`);
  }

  const bootnodeENRs = new Set<string>(networkData.bootEnrs);

  if (networkData.bootnodesFileUrl) {
    const bootnodesFromUrlStr = await got.get(networkData.bootnodesFileUrl).text();
    for (const bootnodeENR of parseBootnodesFile(bootnodesFromUrlStr)) {
      bootnodeENRs.add(bootnodeENR);
    }
  }

  return Array.from(bootnodeENRs.values());
}

/**
 * Reads and parses a list of bootnodes for a network from a file.
 */
export function readBootnodes(bootnodesFilePath: string): string[] {
  const bootnodesFile = fs.readFileSync(bootnodesFilePath, "utf8");

  const bootnodes = parseBootnodesFile(bootnodesFile);

  if (bootnodes.length === 0) {
    throw new Error(`No bootnodes found on file ${bootnodesFilePath}`);
  }

  return bootnodes;
}

/**
 * Parses a file to get a list of bootnodes for a network.
 * Bootnodes file is expected to contain bootnode ENR's concatenated by newlines, or commas for
 * parsing plaintext, YAML, JSON and/or env files.
 */
export function parseBootnodesFile(bootnodesFile: string): string[] {
  const enrs = [];
  for (const line of bootnodesFile.trim().split(/\r?\n/)) {
    for (const entry of line.split(",")) {
      const sanitizedEntry = entry.replace(/['",[\]{}.]+/g, "").trim();

      // File may contain a row with '### Ethereum Node Records'
      // File may be YAML, with `- enr:-KG4QOWkRj`
      if (sanitizedEntry.includes("enr:-")) {
        const parsedEnr = `enr:-${sanitizedEntry.split("enr:-")[1]}`;
        enrs.push(parsedEnr);
      }
    }
  }
  return enrs;
}

/**
 * Parses a file to get a list of bootnodes for a network if given a valid path,
 * and returns the bootnodes in an "injectable" network options format.
 */
export function getInjectableBootEnrs(bootnodesFilepath: string): RecursivePartial<IBeaconNodeOptions> {
  const bootEnrs = readBootnodes(bootnodesFilepath);
  const injectableBootEnrs = enrsToNetworkConfig(bootEnrs);

  return injectableBootEnrs;
}

/**
 * Given an array of bootnodes, returns them in an injectable format
 */
export function enrsToNetworkConfig(enrs: string[]): RecursivePartial<IBeaconNodeOptions> {
  return {network: {discv5: {bootEnrs: enrs}}};
}

/**
 * Fetch weak subjectivity state from a remote beacon node
 */
export async function fetchWeakSubjectivityState(
  config: IChainForkConfig,
  url: string
): Promise<TreeBacked<allForks.BeaconState>> {
  try {
    const response = await got(url, {headers: {accept: "application/octet-stream"}});
    const stateBytes = response.rawBody;
    return getStateTypeFromBytes(config, stateBytes).createTreeBackedFromBytes(stateBytes);
  } catch (e) {
    throw new Error("Unable to fetch weak subjectivity state: " + (e as Error).message);
  }
}
