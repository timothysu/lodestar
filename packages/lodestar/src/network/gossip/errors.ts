// import {ERR_TOPIC_VALIDATOR_IGNORE, ERR_TOPIC_VALIDATOR_REJECT} from "libp2p-gossipsub/src/constants";

/**
 * Values from https://github.com/ChainSafe/js-libp2p-gossipsub/blob/0bd8bd862823be8911c76797bbdf0b3dac9f2e67/ts/constants.ts?_pjax=%23js-repo-pjax-container%2C%20div%5Bitemtype%3D%22http%3A%2F%2Fschema.org%2FSoftwareSourceCode%22%5D%20main%2C%20%5Bdata-pjax-container%5D#L216
 */
export enum GossipValidationCode {
  accept = "ACCEPT",
  ignore = "ERR_TOPIC_VALIDATOR_IGNORE",
  reject = "ERR_TOPIC_VALIDATOR_REJECT",
}

export class GossipValidationError extends Error {
  code: GossipValidationCode;
  constructor(code: GossipValidationCode, message?: string) {
    super(message);
    this.code = code;
  }
}
