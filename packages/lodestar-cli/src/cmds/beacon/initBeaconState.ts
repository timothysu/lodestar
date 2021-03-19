import {
  Eth1Provider,
  IBeaconDb,
  IBeaconNodeOptions,
  initStateFromAnchorState,
  initStateFromDb,
  initStateFromEth1,
} from "@chainsafe/lodestar";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {GENESIS_SLOT} from "@chainsafe/lodestar-params";
import {allForks} from "@chainsafe/lodestar-types";
import {ILogger} from "@chainsafe/lodestar-utils";
import {TreeBacked} from "@chainsafe/ssz";
import {AbortSignal} from "abort-controller";
import {getGenesisFileUrl} from "../../networks";
import {defaultNetwork, IGlobalArgs} from "../../options/globalOptions";
import {downloadOrLoadFile} from "../../util";
import {IBeaconArgs} from "./options";

/**
 * Initialize a beacon state, picking the strategy based on the `IBeaconArgs`
 *
 * State is initialized in one of three ways:
 * 1. restore from a file (possibly downloaded via URL)
 * 2. restore from db
 * 3. create from eth1
 */
export async function initBeaconState(
  options: IBeaconNodeOptions,
  args: IBeaconArgs & IGlobalArgs,
  config: IBeaconConfig,
  db: IBeaconDb,
  logger: ILogger,
  signal: AbortSignal
): Promise<TreeBacked<allForks.BeaconState>> {
  async function initFromFile(pathOrUrl: string): Promise<TreeBacked<allForks.BeaconState>> {
    const anchorState = config.getTypes(GENESIS_SLOT).BeaconState.tree.deserialize(await downloadOrLoadFile(pathOrUrl));
    return await initStateFromAnchorState(config, db, logger, anchorState as TreeBacked<allForks.BeaconState>);
  }

  const dbHasSomeState = (await db.stateArchive.lastKey()) != null;

  if (args.weakSubjectivityStateFile) {
    return await initFromFile(args.weakSubjectivityStateFile);
  } else if (dbHasSomeState) {
    return await initStateFromDb(config, db, logger);
  } else {
    const genesisStateFile = args.genesisStateFile || getGenesisFileUrl(args.network || defaultNetwork);
    if (genesisStateFile && !args.forceGenesis) {
      return await initFromFile(genesisStateFile);
    } else {
      return await initStateFromEth1(config, db, logger, new Eth1Provider(config, options.eth1), signal);
    }
  }
}
