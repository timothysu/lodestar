import {Slot} from "@chainsafe/lodestar-types";
import {RequestedSubnet} from "../interface";

/**
 * Track request subnets by `toSlot`
 */
export class SubnetMap {
  /** Map of subnets and the slot until they are needed */
  private subnets = new Map<number, Slot>();

  /** Register requested subnets */
  request(requestedSubnets: RequestedSubnet[]): void {
    for (const {subnetId, toSlot} of requestedSubnets) {
      this.subnets.set(subnetId, toSlot);
    }
  }

  /** Return subnetIds with a `toSlot` equal greater than `currentSlot` */
  getActive(currentSlot: Slot): number[] {
    const activeSubnetIds: number[] = [];

    for (const [subnetId, toSlot] of this.subnets.entries()) {
      if (toSlot >= currentSlot) {
        activeSubnetIds.push(subnetId);
      } else {
        // Prune expired subnets
        this.subnets.delete(subnetId);
      }
    }

    return activeSubnetIds;
  }
}
