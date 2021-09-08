import {itBench, setBenchOpts} from "@dapplion/benchmark";
import {fromParticipationFlags, toParticipationFlags} from "../../../src/allForks/util/cachedEpochParticipation";

describe("bit opts", function () {
  setBenchOpts({noThreshold: true});

  const prevStatus = toParticipationFlags({
    timelyHead: false,
    timelyTarget: false,
    timelySource: true,
  });
  const attStatus = toParticipationFlags({
    timelyHead: true,
    timelyTarget: true,
    timelySource: false,
  });

  const vc = 250_000;
  const vPerSlot = vc / 32;

  itBench("bitops all flags at once", () => {
    for (let i = 0; i < vPerSlot; i++) {
      const newStatus = prevStatus | attStatus;
      const changedFlags = prevStatus ^ newStatus;
      const changedFlags2 = fromParticipationFlags(changedFlags);
      let weight = 0;
      if (changedFlags2.timelyHead) weight += 5;
      if (changedFlags2.timelySource) weight += 5;
      if (changedFlags2.timelyTarget) weight += 5;
      weight;
    }
  });
});
