import PeerId from "peer-id";
import {BeaconBlocksByRangeRequest, Epoch, SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {ILogger, LodestarError} from "@chainsafe/lodestar-utils";
import {computeStartSlotAtEpoch} from "@chainsafe/lodestar-beacon-state-transition";
import {MAX_BATCH_DOWNLOAD_ATTEMPTS, MAX_BATCH_PROCESSING_ATTEMPTS} from "../constants";

export type BatchOpts = {
  epochsPerBatch: Epoch;
  logAfterAttempts?: number;
};

/**
 * Current state of a batch
 */
export enum BatchStatus {
  /** The batch has failed either downloading or processing, but can be requested again. */
  AwaitingDownload = "AwaitingDownload",
  /** The batch is being downloaded. */
  Downloading = "Downloading",
  /** The batch has been completely downloaded and is ready for processing. */
  AwaitingProcessing = "AwaitingProcessing",
  /** The batch is being processed. */
  Processing = "Processing",
  /**
   * The batch was successfully processed and is waiting to be validated.
   *
   * It is not sufficient to process a batch successfully to consider it correct. This is
   * because batches could be erroneously empty, or incomplete. Therefore, a batch is considered
   * valid, only if the next sequential batch imports at least a block.
   */
  AwaitingValidation = "AwaitingValidation",
}

export type Attempt = {
  /** The peer that made the attempt */
  peer: PeerId;
};

export type BatchState =
  | {status: BatchStatus.AwaitingDownload}
  | {status: BatchStatus.Downloading; peer: PeerId; blocks: SignedBeaconBlock[]}
  | {status: BatchStatus.AwaitingProcessing; peer: PeerId; blocks: SignedBeaconBlock[]}
  | {status: BatchStatus.Processing; attempt: Attempt}
  | {status: BatchStatus.AwaitingValidation; attempt: Attempt};

export type BatchMetadata = {
  startEpoch: Epoch;
  status: BatchStatus;
};

/**
 * Batches are downloaded excluding the first block of the epoch assuming it has already been
 * downloaded.
 *
 * For example:
 *
 * Epoch boundary |                                   |
 *  ... | 30 | 31 | 32 | 33 | 34 | ... | 61 | 62 | 63 | 64 | 65 |
 *       Batch 1       |              Batch 2              |  Batch 3
 */
export class Batch {
  startEpoch: Epoch;
  /** State of the batch. */
  state: BatchState = {status: BatchStatus.AwaitingDownload};
  /** BeaconBlocksByRangeRequest */
  request: BeaconBlocksByRangeRequest;
  /** The `Attempts` that have been made and failed to send us this batch. */
  private failedProcessingAttempts: Attempt[] = [];
  /** The number of download retries this batch has undergone due to a failed request. */
  private failedDownloadAttempts: PeerId[] = [];
  private logger: ILogger;

  constructor(startEpoch: Epoch, config: IBeaconConfig, logger: ILogger, opts: BatchOpts) {
    const startSlot = computeStartSlotAtEpoch(config, startEpoch) + 1;
    const endSlot = startSlot + opts.epochsPerBatch * config.params.SLOTS_PER_EPOCH;

    this.startEpoch = startEpoch;
    this.request = {
      startSlot: startSlot,
      count: endSlot - startSlot,
      step: 1,
    };

    this.logger = logger;
  }

  /**
   * Gives a list of peers from which this batch has had a failed download or processing attempt.
   */
  getFailedPeers(): PeerId[] {
    return [...this.failedDownloadAttempts, ...this.failedProcessingAttempts.map((a) => a.peer)];
  }

  getMetadata(): BatchMetadata {
    return {startEpoch: this.startEpoch, status: this.state.status};
  }

  /**
   * AwaitingDownload -> Downloading
   */
  startDownloading(peer: PeerId): void {
    if (this.state.status !== BatchStatus.AwaitingDownload) {
      this.logger.error("startDownloading", {}, this.WrongStatusError(BatchStatus.AwaitingDownload));
    }

    this.logger.debug("Batch startDownloading", this.getMetadata());
    this.state = {status: BatchStatus.Downloading, peer, blocks: []};
  }

  /**
   * Downloading -> AwaitingProcessing
   */
  downloadingSuccess(blocks: SignedBeaconBlock[]): void {
    if (this.state.status !== BatchStatus.Downloading) {
      throw this.WrongStatusError(BatchStatus.Downloading);
    }

    this.logger.debug("Batch downloadingSuccess", {...this.getMetadata(), blocks: blocks.length});
    this.state = {status: BatchStatus.AwaitingProcessing, peer: this.state.peer, blocks};
  }

  /**
   * Downloading -> AwaitingDownload
   */
  downloadingError(e: Error): void {
    if (this.state.status === BatchStatus.Downloading) {
      this.failedDownloadAttempts.push(this.state.peer);
    } else {
      this.logger.error("downloadingError", {}, this.WrongStatusError(BatchStatus.Downloading));
    }

    if (this.failedDownloadAttempts.length > MAX_BATCH_DOWNLOAD_ATTEMPTS) {
      throw this.BatchError({code: BatchErrorCode.MAX_DOWNLOAD_ATTEMPTS});
    } else {
      this.logger.debug("Batch downloadingError", this.getMetadata(), e);
    }

    this.state = {status: BatchStatus.AwaitingDownload};
  }

  /**
   * AwaitingProcessing -> Processing
   */
  startProcessing(): SignedBeaconBlock[] {
    if (this.state.status !== BatchStatus.AwaitingProcessing) {
      throw this.WrongStatusError(BatchStatus.AwaitingProcessing);
    }

    this.logger.debug("Batch startProcessing", this.getMetadata());
    const blocks = this.state.blocks;
    this.state = {
      status: BatchStatus.Processing,
      attempt: {peer: this.state.peer},
    };
    return blocks;
  }

  /**
   * Processing -> AwaitingValidation
   */
  processingSuccess(): void {
    if (this.state.status !== BatchStatus.Processing) {
      throw this.WrongStatusError(BatchStatus.Processing);
    }

    this.logger.debug("Batch processingSuccess", this.getMetadata());
    this.state = {status: BatchStatus.AwaitingValidation, attempt: this.state.attempt};
  }

  /**
   * Processing -> AwaitingDownload
   */
  processingError(e: Error): void {
    if (this.state.status === BatchStatus.Processing) {
      this.failedProcessingAttempts.push(this.state.attempt);
    } else {
      this.logger.error("processingError", {}, this.WrongStatusError(BatchStatus.Processing));
    }

    this.onProcessingError(e);
  }

  /**
   * AwaitingValidation -> AwaitingDownload
   */
  validationError(): void {
    if (this.state.status === BatchStatus.AwaitingValidation) {
      this.failedProcessingAttempts.push(this.state.attempt);
    } else {
      this.logger.error("validationError", {}, this.WrongStatusError(BatchStatus.AwaitingValidation));
    }

    this.onProcessingError(Error("Validation error"));
  }

  private onProcessingError(e: Error): void {
    if (this.failedProcessingAttempts.length > MAX_BATCH_PROCESSING_ATTEMPTS) {
      throw this.BatchError({code: BatchErrorCode.MAX_PROCESSING_ATTEMPTS});
    } else {
      this.logger.debug("Batch processingError", this.getMetadata(), e);
    }

    this.state = {status: BatchStatus.AwaitingDownload};
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private BatchError(type: BatchErrorType): BatchError {
    return new BatchError(type, this.getMetadata());
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private WrongStatusError(expectedStatus: BatchStatus): BatchError {
    return this.BatchError({code: BatchErrorCode.WRONG_STATUS, expectedStatus});
  }
}

export enum BatchErrorCode {
  WRONG_STATUS = "BATCH_ERROR_WRONG_STATUS",
  MAX_DOWNLOAD_ATTEMPTS = "BATCH_ERROR_MAX_DOWNLOAD_ATTEMPTS",
  MAX_PROCESSING_ATTEMPTS = "BATCH_ERROR_MAX_PROCESSING_ATTEMPTS",
}

type BatchErrorType =
  | {code: BatchErrorCode.WRONG_STATUS; expectedStatus: BatchStatus}
  | {code: BatchErrorCode.MAX_DOWNLOAD_ATTEMPTS}
  | {code: BatchErrorCode.MAX_PROCESSING_ATTEMPTS};

type BatchErrorMetadata = {
  startEpoch: number;
  status: BatchStatus;
};

export class BatchError extends LodestarError<BatchErrorType & BatchErrorMetadata> {
  constructor(type: BatchErrorType, metadata: BatchErrorMetadata) {
    super({...type, ...metadata});
  }
}
