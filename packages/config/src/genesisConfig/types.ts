import {ForkName} from "@chainsafe/lodestar-params";
import {DomainType, ForkDigest, Slot} from "@chainsafe/lodestar-types";

export type ForkDigestHex = string;

/* eslint-disable @typescript-eslint/naming-convention */

export interface ForkDigestContext {
  forkDigest2ForkName(forkDigest: ForkDigest | ForkDigestHex): ForkName;
  forkDigest2ForkNameOption(forkDigest: ForkDigest | ForkDigestHex): ForkName | null;
  forkName2ForkDigest(forkName: ForkName): ForkDigest;
  forkName2ForkDigestHex(forkName: ForkName): ForkDigestHex;
}

export interface CachedGenesis extends ForkDigestContext {
  getDomain(domainType: DomainType, slot: Slot): Uint8Array;
}
