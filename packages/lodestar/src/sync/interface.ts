import {INetwork} from "../network";
import {ILogger} from "@chainsafe/lodestar-utils";
import {CommitteeIndex, Slot, SyncingStatus} from "@chainsafe/lodestar-types";
import {IGossipHandler} from "./gossip";
import {IBeaconChain} from "../chain";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {IBeaconDb} from "../db/api";
import {AttestationCollector} from "./utils";

export interface IBeaconSync {
  getSyncStatus(): SyncingStatus;
  isSynced(): boolean;
  isSyncing(): boolean;
  collectAttestations(slot: Slot, committeeIndex: CommitteeIndex): Promise<void>;
}

export interface ISyncModule {
  getHighestBlock(): Slot;
}

export interface ISlotRange {
  start: Slot;
  end: Slot;
}

export interface ISyncModules {
  config: IBeaconConfig;
  network: INetwork;
  db: IBeaconDb;
  logger: ILogger;
  chain: IBeaconChain;
  gossipHandler?: IGossipHandler;
  attestationCollector?: AttestationCollector;
}
