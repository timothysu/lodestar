import {AbortSignal} from "@chainsafe/abort-controller";
import {ssz} from "@chainsafe/lodestar-types";
import {toHexString, TreeBacked} from "@chainsafe/ssz";
import {getClient} from "@chainsafe/lodestar-api";
import {createIBeaconConfig, IBeaconConfig, IChainForkConfig} from "@chainsafe/lodestar-config";
import {fromHex, ILogger} from "@chainsafe/lodestar-utils";
import {computeEpochAtSlot, allForks} from "@chainsafe/lodestar-beacon-state-transition";
import {IBeaconDb, IBeaconNodeOptions, initStateFromEth1AndPersist, persistAnchorState} from "@chainsafe/lodestar";
// eslint-disable-next-line no-restricted-imports
import {getStateTypeFromBytes} from "@chainsafe/lodestar/lib/util/multifork";
import {downloadOrLoadFile} from "../../util";
import {IBeaconArgs} from "./options";
import {defaultNetwork, IGlobalArgs} from "../../options/globalOptions";
import {getGenesisFileUrl} from "../../networks";
import {Checkpoint} from "@chainsafe/lodestar-types/phase0";
import {SLOTS_PER_EPOCH} from "@chainsafe/lodestar-params";

const checkpointRegex = new RegExp("^(?:0x)?([0-9a-f]{64}):([0-9]+)$");

function getCheckpointFromArg(checkpointStr: string): Checkpoint {
  const match = checkpointRegex.exec(checkpointStr.toLowerCase());
  if (!match) {
    throw new Error(`Could not parse checkpoint string: ${checkpointStr}`);
  }
  return {root: fromHex(match[1]), epoch: parseInt(match[2])};
}

function getCheckpointFromState(config: IChainForkConfig, state: allForks.BeaconState): Checkpoint {
  return {
    epoch: computeEpochAtSlot(state.latestBlockHeader.slot),
    root: allForks.getLatestBlockRoot(config, state),
  };
}

async function initAndVerifyWeakSubjectivityState(
  config: IBeaconConfig,
  db: IBeaconDb,
  logger: ILogger,
  store: TreeBacked<allForks.BeaconState>,
  wsState: TreeBacked<allForks.BeaconState>,
  wsCheckpoint: Checkpoint
): Promise<{anchorState: TreeBacked<allForks.BeaconState>; wsCheckpoint: Checkpoint}> {
  // Check if the store's state and wsState are compatible
  if (
    store.genesisTime !== wsState.genesisTime ||
    !ssz.Root.equals(store.genesisValidatorsRoot, wsState.genesisValidatorsRoot)
  ) {
    throw new Error(
      "Db state and checkpoint state are not compatible, either clear the db or verify your checkpoint source"
    );
  }

  // Pick the state which is ahead as an anchor to initialize the beacon chain
  let anchorState = wsState;
  let anchorCheckpoint = wsCheckpoint;
  if (store.slot > wsState.slot) {
    anchorState = store;
    anchorCheckpoint = getCheckpointFromState(config, store);
    logger.verbose(
      "Db state is ahead of the provided checkpoint state, using the db state to initialize the beacon chain"
    );
  }

  if (!allForks.isWithinWeakSubjectivityPeriod(config, anchorState, anchorCheckpoint)) {
    throw new Error("Fetched weak subjectivity checkpoint not within weak subjectivity period.");
  }

  logger.info("Initializing beacon state from anchor state", {
    slot: anchorState.slot,
    epoch: computeEpochAtSlot(anchorState.slot),
    stateRoot: toHexString(config.getForkTypes(anchorState.slot).BeaconState.hashTreeRoot(anchorState)),
  });

  // TODO: Why is the state only persisted here?
  await persistAnchorState(config, db, anchorState);

  // Return the latest anchorState but still return original wsCheckpoint to validate in backfill
  return {anchorState, wsCheckpoint};
}

/**
 * Initialize a beacon state, picking the strategy based on the `IBeaconArgs`
 *
 * State is initialized in one of three ways:
 * 1. restore from weak subjectivity state (possibly downloaded from a remote beacon node)
 * 2. restore from db
 * 3. restore from genesis state (possibly downloaded via URL)
 * 4. create genesis state from eth1
 */
export async function initBeaconState(
  options: IBeaconNodeOptions,
  args: IBeaconArgs & IGlobalArgs,
  chainForkConfig: IChainForkConfig,
  db: IBeaconDb,
  logger: ILogger,
  signal: AbortSignal
): Promise<{anchorState: TreeBacked<allForks.BeaconState>; wsCheckpoint?: Checkpoint}> {
  // fetch the latest state stored in the db
  // this will be used in all cases, if it exists, either used during verification of a weak subjectivity state, or used directly as the anchor state
  const lastDbState = await db.stateArchive.lastValue();

  // weak subjectivity sync from a provided state file:
  // if a weak subjectivity checkpoint has been provided, it is used for additional verification
  // otherwise, the state itself is used for verification (not bad, because the trusted state has been explicitly provided)
  if (args.weakSubjectivityStateFile) {
    const stateBytes = await downloadOrLoadFile(args.weakSubjectivityStateFile);
    const wsState = getStateTypeFromBytes(chainForkConfig, stateBytes).createTreeBackedFromBytes(stateBytes);
    const config = createIBeaconConfig(chainForkConfig, wsState.genesisValidatorsRoot);
    const store = lastDbState ?? wsState;
    const checkpoint = args.weakSubjectivityCheckpoint
      ? getCheckpointFromArg(args.weakSubjectivityCheckpoint)
      : getCheckpointFromState(config, wsState);
    return initAndVerifyWeakSubjectivityState(config, db, logger, store, wsState, checkpoint);
  }

  // weak subjectivity sync from a state that needs to be fetched:
  // if a weak subjectivity checkpoint has been provided, it is used to inform which state to download and used for additional verification
  // otherwise, the 'finalized' state is downloaded and the state itself is used for verification (all trust delegated to the remote beacon node)
  else if (args.weakSubjectivitySyncLatest) {
    const remoteBeaconUrl = args.weakSubjectivityServerUrl;
    if (!remoteBeaconUrl) {
      throw Error(`Must set arg --weakSubjectivityServerUrl for network ${args.network}`);
    }

    let stateId = "finalized";
    let checkpoint: Checkpoint | undefined;
    if (args.weakSubjectivityCheckpoint) {
      checkpoint = getCheckpointFromArg(args.weakSubjectivityCheckpoint);
      stateId = (checkpoint.epoch * SLOTS_PER_EPOCH).toString();
    }

    logger.info("Fetching weak subjectivity state", {url: remoteBeaconUrl, stateId});

    const api = getClient(chainForkConfig, {baseUrl: remoteBeaconUrl});
    const wsStateBytes = await api.debug.getStateV2(stateId, "ssz");

    const wsState = getStateTypeFromBytes(chainForkConfig, wsStateBytes).createTreeBackedFromBytes(wsStateBytes);
    const config = createIBeaconConfig(chainForkConfig, wsState.genesisValidatorsRoot);
    const store = lastDbState ?? wsState;
    return initAndVerifyWeakSubjectivityState(
      config,
      db,
      logger,
      store,
      wsState,
      checkpoint || getCheckpointFromState(config, wsState)
    );
  }

  // start the chain from the latest stored state in the db
  else if (lastDbState) {
    const config = createIBeaconConfig(chainForkConfig, lastDbState.genesisValidatorsRoot);
    logger.info("Initializing beacon state from anchor state", {
      slot: lastDbState.slot,
      epoch: computeEpochAtSlot(lastDbState.slot),
      stateRoot: toHexString(config.getForkTypes(lastDbState.slot).BeaconState.hashTreeRoot(lastDbState)),
    });
    return {anchorState: lastDbState};
  }

  // Get genesis from file or construct genesis from Eth1 chain
  else {
    const genesisStateFile = args.genesisStateFile || getGenesisFileUrl(args.network || defaultNetwork);
    if (genesisStateFile && !args.forceGenesis) {
      const stateBytes = await downloadOrLoadFile(genesisStateFile);
      const anchorState = getStateTypeFromBytes(chainForkConfig, stateBytes).createTreeBackedFromBytes(stateBytes);
      const config = createIBeaconConfig(chainForkConfig, anchorState.genesisValidatorsRoot);
      logger.info("Initializing beacon state from anchor state", {
        slot: anchorState.slot,
        epoch: computeEpochAtSlot(anchorState.slot),
        stateRoot: toHexString(config.getForkTypes(anchorState.slot).BeaconState.hashTreeRoot(anchorState)),
      });

      // TODO: Why is the state only persisted here?
      await persistAnchorState(config, db, anchorState);

      return {anchorState};
    } else {
      const anchorState = await initStateFromEth1AndPersist({
        config: chainForkConfig,
        db,
        logger,
        opts: options.eth1,
        signal,
      });
      return {anchorState};
    }
  }
}
