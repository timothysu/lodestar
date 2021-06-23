import {RegistryMetricCreator} from "../utils/registryMetricCreator";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function createDbMetrics(register: RegistryMetricCreator) {
  return {
    db: {
      rangeSize: register.gauge({
        name: "db_bucket_size_bytes",
        help: "Approximate size of db index in bytes",
        labelNames: ["bucket"] as const,
      }),
    },
  };
}
