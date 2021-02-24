import {IBeaconSync} from "../../../sync";
import {IApiOptions} from "../../options";
import {ApiNamespace, IApiModules} from "../interface";
import {SyncChainDebugState} from "../../../sync/range/chain";

/**
 * Lodestar dedicated API endpoints
 */
export interface ILodestarApi {
  getSyncChainsDebugState(): SyncChainDebugState[];
}

export class LodestarApi implements ILodestarApi {
  public namespace = ApiNamespace.LODESTAR;
  private readonly sync: IBeaconSync;

  public constructor(opts: Partial<IApiOptions>, modules: Pick<IApiModules, "sync">) {
    this.sync = modules.sync;
  }

  public getSyncChainsDebugState(): SyncChainDebugState[] {
    return this.sync.getSyncChainsDebugState();
  }
}
