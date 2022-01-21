import {BeaconPreset} from "./interface";

export const beaconPresetTypes: SpecTypes<BeaconPreset> = {};

/** Allows values in a Spec file */
export type SpecValue = number | bigint | Uint8Array | string;

/** Type value name of each spec field. Numbers are ignored since they are the most common */
export type SpecValueType<V extends SpecValue> = V extends number
  ? never
  : V extends bigint
  ? "bigint"
  : V extends Uint8Array
  ? "bytes"
  : V extends string
  ? "string"
  : never;

/** All possible type names for a SpecValue */
export type SpecValueTypeName = SpecValueType<SpecValue>;

export type KeysOfNonNumberValues<Spec extends Record<string, SpecValue>> = {
  [K in keyof Spec]: Spec[K] extends number ? never : K;
}[keyof Spec];

export type SpecTypes<Spec extends Record<string, SpecValue>> = {
  [K in keyof Pick<Spec, KeysOfNonNumberValues<Spec>>]: SpecValueType<Spec[K]>;
};
