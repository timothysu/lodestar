import {itBench} from "@dapplion/benchmark";

describe("misc / async throw vs return", () => {
  const count = 1000;

  type Status = {code: string; value: number};

  class ErrorStatus extends Error implements Status {
    constructor(readonly code: string, readonly value: number) {
      super(code);
    }
  }

  async function statusReturnObject(i: number): Promise<Status> {
    return {
      code: "OK",
      value: i,
    };
  }

  async function statusReturnError(i: number): Promise<Status> {
    return new ErrorStatus("OK", i);
  }

  async function statusThrowObject(i: number): Promise<never> {
    throw {
      code: "OK",
      value: i,
    };
  }

  async function statusThrowError(i: number): Promise<never> {
    throw new ErrorStatus("OK", i);
  }

  itBench({
    id: `Resolve object ${count} times`,
    noThreshold: true,
    runsFactor: count,
    fn: async () => {
      for (let i = 0; i < count; i++) {
        const res = await statusReturnObject(i);
        res.code;
      }
    },
  });

  itBench({
    id: `Resolve Error ${count} times`,
    noThreshold: true,
    runsFactor: count,
    fn: async () => {
      for (let i = 0; i < count; i++) {
        const res = await statusReturnError(i);
        res.code;
      }
    },
  });

  itBench.skip({
    id: `Reject object ${count} times`,
    noThreshold: true,
    runsFactor: count,
    fn: async () => {
      for (let i = 0; i < count; i++) {
        try {
          await statusThrowObject(i);
        } catch (e) {
          (e as Status).code;
        }
      }
    },
  });

  itBench({
    id: `Reject Error ${count} times`,
    noThreshold: true,
    runsFactor: count,
    fn: async () => {
      for (let i = 0; i < count; i++) {
        try {
          await statusThrowError(i);
        } catch (e) {
          (e as Status).code;
        }
      }
    },
  });
});
