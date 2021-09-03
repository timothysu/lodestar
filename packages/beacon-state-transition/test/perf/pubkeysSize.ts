import bls, {init, CoordType, PublicKey} from "@chainsafe/bls";
import {computeStartSlotAtEpoch} from "../../src";
import {getNetworkCachedStateStruct} from "./util";

// typedef struct { blst_fp x, y, z; } blst_p1;
// typedef struct { blst_fp x, y; } blst_p1_affine;

const refs = new Set<any>();

async function f(): Promise<void> {
  await init("blst-native");

  const tracker = new MemoryTracker();
  const pubkeys = await getPubkeys();
  console.log("vc", pubkeys.length);
  refs.add(pubkeys);
  tracker.logDiff("pubkeys serialized compressed");

  for (let i = 0; i < 10; i++) {
    const pks = pubkeys.map((p) => bls.PublicKey.fromBytes(p as Uint8Array, CoordType.jacobian));
    refs.add(pks);
    tracker.logDiff("pubkeys jacobian " + i);
  }
}

async function getPubkeys() {
  const epoch = 58758;
  const slot = computeStartSlotAtEpoch(epoch) - 1;

  const state = await getNetworkCachedStateStruct("mainnet", slot, 300_000);
  return Array.from(state.validators).map((v) => v.pubkey);
}

f().then(() => {
  console.log(refs.toString());
});

class MemoryTracker {
  prev = process.memoryUsage();

  logDiff(id: string): void {
    global.gc();
    global.gc();
    const curr = process.memoryUsage();
    const parts: string[] = [];
    for (const key of Object.keys(this.prev) as (keyof NodeJS.MemoryUsage)[]) {
      const prevVal = this.prev[key];
      const currVal = curr[key];
      const bytesDiff = currVal - prevVal;
      const sign = bytesDiff < 0 ? "-" : bytesDiff > 0 ? "+" : " ";
      parts.push(`${key} ${sign}${this.formatBytes(Math.abs(bytesDiff)).padEnd(15)}`);
    }
    this.prev = curr;
    console.log(id.padEnd(20), parts.join(" "));
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }
}
