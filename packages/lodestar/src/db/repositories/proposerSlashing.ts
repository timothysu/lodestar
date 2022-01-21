import {phase0, ssz, ValidatorIndex} from "@chainsafe/lodestar-types";
import {ChainForkConfig} from "@chainsafe/lodestar-config";
import {Db, Bucket, Repository, IDbMetrics} from "@chainsafe/lodestar-db";

export class ProposerSlashingRepository extends Repository<ValidatorIndex, phase0.ProposerSlashing> {
  constructor(config: ChainForkConfig, db: Db, metrics?: IDbMetrics) {
    super(config, db, Bucket.phase0_proposerSlashing, ssz.phase0.ProposerSlashing, metrics);
  }

  getId(value: phase0.ProposerSlashing): ValidatorIndex {
    return value.signedHeader1.message.proposerIndex;
  }
}
