import {bellatrix} from "@chainsafe/lodestar-types";
import {createChainForkConfig} from "@chainsafe/lodestar-config";
import {IBaseSpecTest} from "../type";

export interface IBellatrixStateTestCase extends IBaseSpecTest {
  pre: bellatrix.BeaconState;
  post: bellatrix.BeaconState;
}

/** Config with `ALTAIR_FORK_EPOCH: 0, BELLATRIX_FORK_EPOCH: 0` */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const config = createChainForkConfig({ALTAIR_FORK_EPOCH: 0, BELLATRIX_FORK_EPOCH: 0});
