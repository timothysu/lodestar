import {IBeaconPreset} from "../preset";
import {preset as presetMainnet} from "./mainnet";

/* eslint-disable @typescript-eslint/naming-convention */

export const preset: IBeaconPreset = {
  ...presetMainnet,
  SLOTS_PER_EPOCH: 16,
  EPOCHS_PER_SYNC_COMMITTEE_PERIOD: 512,
};
