import {BeaconBlocksByRangeRequest, SignedBeaconBlock} from "@chainsafe/lodestar-types";

// TODO: Should this be run at the ReqResp level or in sync?
//       i.e. would someone accept a request that does not match the request
//       or should it always be considered as an error?
/**
 * Asserts a response from BeaconBlocksByRange respects the request and is sequential
 * Note: MUST allow missing block for skipped slots.
 */
export function assertSequentialBlocksInRange(blocks: SignedBeaconBlock[], request: BeaconBlocksByRangeRequest): void {
  // Check below would throw for empty ranges
  if (blocks.length === 0) {
    return;
  }

  if (blocks.length > request.count) {
    throw Error(`BlockRangeError: wrong length ${blocks.length} > ${request.count}`);
  }

  const minSlot = request.startSlot;
  const maxSlot = request.startSlot + request.count * request.step;
  const firstSlot = blocks[0].message.slot;
  const lastSlot = blocks[blocks.length - 1].message.slot;

  if (firstSlot < minSlot) {
    throw Error(`BlockRangeError: wrong firstSlot ${firstSlot} < ${minSlot}`);
  }

  if (lastSlot > maxSlot) {
    throw Error(`BlockRangeError: wrong lastSlot ${lastSlot} > ${maxSlot}`);
  }

  // Assert sequential with request.step
  for (let i = 0; i < blocks.length - 1; i++) {
    const slotL = blocks[i].message.slot;
    const slotR = blocks[i + 1].message.slot;
    if (slotL + request.step > slotR) {
      throw Error(`BlockRangeError: wrong sequence ${slotL} + ${request.step} > ${slotR}`);
    }
  }
}
