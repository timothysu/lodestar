import {Checkpoint, Status} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {toHexString} from "@chainsafe/ssz";

export function getStatusFinalizedCheckpoint(status: Status): Checkpoint {
  return {epoch: status.finalizedEpoch, root: status.finalizedRoot};
}

export function getCommonFinalizedCheckpoint(
  config: IBeaconConfig,
  peerStatuses: (Status | null)[]
): Checkpoint | null {
  const checkpointVotes = peerStatuses.reduce<Map<string, {checkpoint: Checkpoint; votes: number}>>(
    (current, status) => {
      if (!status) {
        return current;
      }
      const peerCheckpoint = getStatusFinalizedCheckpoint(status);
      const root = toHexString(config.types.Checkpoint.hashTreeRoot(peerCheckpoint));
      if (current.has(root)) {
        current.get(root)!.votes++;
      } else {
        current.set(root, {checkpoint: peerCheckpoint, votes: 1});
      }
      return current;
    },
    new Map()
  );
  if (checkpointVotes.size > 0) {
    return Array.from(checkpointVotes.values())
      .sort((voteA, voteB) => {
        if (voteA.votes > voteB.votes) return -1;
        if (voteA.votes < voteB.votes) return 1;
        if (voteA.checkpoint.epoch > voteB.checkpoint.epoch) return -1;
        if (voteA.checkpoint.epoch < voteB.checkpoint.epoch) return 1;
        return 0;
      })
      .shift()!.checkpoint;
  } else {
    return null;
  }
}
