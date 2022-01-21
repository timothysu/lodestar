import {altair} from "@chainsafe/lodestar-types";
import {createChainForkConfig} from "@chainsafe/lodestar-config";
import {IBaseSpecTest} from "../type";

export interface IAltairStateTestCase extends IBaseSpecTest {
  pre: altair.BeaconState;
  post: altair.BeaconState;
}

/** Config with `ALTAIR_FORK_EPOCH: 0` */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const config = createChainForkConfig({ALTAIR_FORK_EPOCH: 0});
