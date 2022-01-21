import {BeaconPreset, SpecValueTypeName, SpecValue, beaconPresetTypes} from "@chainsafe/lodestar-params";
import {ChainConfig, chainConfigTypes} from "@chainsafe/lodestar-config";
import {Bytes32, Number64, phase0, ssz} from "@chainsafe/lodestar-types";
import {mapValues, toHexString} from "@chainsafe/lodestar-utils";
import {ByteVectorType, ContainerType, fromHexString} from "@chainsafe/ssz";
import {ArrayOf, ContainerData, ReqEmpty, reqEmpty, ReturnTypes, ReqSerializers, RoutesData, TypeJson} from "../utils";

// See /packages/api/src/routes/index.ts for reasoning and instructions to add new routes

const MAX_UINT64_JSON = "18446744073709551615";

export type DepositContract = {
  chainId: Number64;
  address: Bytes32;
};

export type Spec = BeaconPreset & ChainConfig;

export type Api = {
  /**
   * Get deposit contract address.
   * Retrieve Eth1 deposit contract address and chain ID.
   */
  getDepositContract(): Promise<{data: DepositContract}>;

  /**
   * Get scheduled upcoming forks.
   * Retrieve all scheduled upcoming forks this node is aware of.
   */
  getForkSchedule(): Promise<{data: phase0.Fork[]}>;

  /**
   * Retrieve specification configuration used on this node.  The configuration should include:
   *  - Constants for all hard forks known by the beacon node, for example the [phase 0](https://github.com/ethereum/eth2.0-specs/blob/dev/specs/phase0/beacon-chain.md#constants) and [altair](https://github.com/ethereum/eth2.0-specs/blob/dev/specs/altair/beacon-chain.md#constants) values
   *  - Presets for all hard forks supplied to the beacon node, for example the [phase 0](https://github.com/ethereum/eth2.0-specs/blob/dev/presets/mainnet/phase0.yaml) and [altair](https://github.com/ethereum/eth2.0-specs/blob/dev/presets/mainnet/altair.yaml) values
   *  - Configuration for the beacon node, for example the [mainnet](https://github.com/ethereum/eth2.0-specs/blob/dev/configs/mainnet.yaml) values
   *
   * Values are returned with following format:
   * - any value starting with 0x in the spec is returned as a hex string
   * - numeric values are returned as a quoted integer
   */
  getSpec(): Promise<{data: Spec}>;
};

/**
 * Define javascript values for each route
 */
export const routesData: RoutesData<Api> = {
  getDepositContract: {url: "/eth/v1/config/deposit_contract", method: "GET"},
  getForkSchedule: {url: "/eth/v1/config/fork_schedule", method: "GET"},
  getSpec: {url: "/eth/v1/config/spec", method: "GET"},
};

export type ReqTypes = {[K in keyof Api]: ReqEmpty};

export function getReqSerializers(): ReqSerializers<Api, ReqTypes> {
  return mapValues(routesData, () => reqEmpty);
}

/* eslint-disable @typescript-eslint/naming-convention */
export function getReturnTypes(): ReturnTypes<Api> {
  const specTypes: Partial<Record<keyof Spec, SpecValueTypeName>> = {
    ...beaconPresetTypes,
    ...chainConfigTypes,
  };

  const specTypeJson: TypeJson<Spec> = {
    toJson(spec) {
      const json = {} as Record<string, string>;
      for (const key of Object.keys(spec) as (keyof Spec)[]) {
        json[key] = serializeSpecValue(spec[key], specTypes[key]);
      }
      return json;
    },
    fromJson(json) {
      if (typeof json !== "object" || json === null || Array.isArray(json)) {
        throw Error("Invalid JSON value");
      }

      const spec = {} as Spec;
      for (const key of Object.keys(json) as (keyof Spec)[]) {
        spec[key] = deserializeSpecValue(json[key], specTypes[key]) as never;
      }
      return spec;
    },
  };

  const DepositContract = new ContainerType<DepositContract>({
    fields: {
      chainId: ssz.Number64,
      address: new ByteVectorType({length: 20}),
    },
    // From beacon apis
    casingMap: {
      chainId: "chain_id",
      address: "address",
    },
  });

  return {
    getDepositContract: ContainerData(DepositContract),
    getForkSchedule: ContainerData(ArrayOf(ssz.phase0.Fork)),
    getSpec: ContainerData(specTypeJson),
  };
}

export function serializeSpecValue(value: SpecValue, typeName?: SpecValueTypeName): string {
  switch (typeName) {
    case undefined:
      if (typeof value !== "number") {
        throw Error(`Invalid value ${value} expected number`);
      }
      if (value === Infinity) {
        return MAX_UINT64_JSON;
      }
      return value.toString(10);

    case "bigint":
      if (typeof value !== "bigint") {
        throw Error(`Invalid value ${value} expected bigint`);
      }
      return value.toString(10);

    case "bytes":
      if (!(value instanceof Uint8Array)) {
        throw Error(`Invalid value ${value} expected Uint8Array`);
      }
      return toHexString(value);

    case "string":
      if (typeof value !== "string") {
        throw Error(`Invalid value ${value} expected string`);
      }
      return value;
  }
}

export function deserializeSpecValue(valueStr: unknown, typeName?: SpecValueTypeName): SpecValue {
  if (typeof valueStr !== "string") {
    throw Error(`Invalid value ${valueStr} expected string`);
  }

  switch (typeName) {
    case undefined:
      if (valueStr === MAX_UINT64_JSON) {
        return Infinity;
      }
      return parseInt(valueStr, 10);

    case "bigint":
      return BigInt(valueStr);

    case "bytes":
      return fromHexString(valueStr);

    case "string":
      return valueStr;
  }
}
