import {ChainConfig} from "@chainsafe/lodestar-config";

export type IBeaconParamsUnparsed = Partial<{[P in keyof ChainConfig]: string | number}>;
