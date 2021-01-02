import {Checkpoint, Status} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {toHexString} from "@chainsafe/ssz";

export function getMostCommonFinalizedCheckpoint(config: IBeaconConfig, peerStatuses: Status[]): Checkpoint | null {
  const checkpointVotes = new Map<string, {checkpoint: Checkpoint; votes: number}>();

  for (const status of peerStatuses) {
    const peerCheckpoint = {epoch: status.finalizedEpoch, root: status.finalizedRoot};
    const root = toHexString(config.types.Checkpoint.hashTreeRoot(peerCheckpoint));
    let rootVotes = checkpointVotes.get(root);
    if (rootVotes) {
      rootVotes.votes++;
    } else {
      rootVotes = {checkpoint: peerCheckpoint, votes: 1};
    }
    checkpointVotes.set(root, rootVotes);
  }

  const sortedCheckpoints = Array.from(checkpointVotes.values()).sort((voteA, voteB) => {
    if (voteA.votes > voteB.votes) return -1;
    if (voteA.votes < voteB.votes) return 1;
    if (voteA.checkpoint.epoch > voteB.checkpoint.epoch) return -1;
    if (voteA.checkpoint.epoch < voteB.checkpoint.epoch) return 1;
    return 0;
  });

  return sortedCheckpoints.shift()?.checkpoint ?? null;
}
