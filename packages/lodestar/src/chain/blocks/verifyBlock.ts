import {ssz} from "@chainsafe/lodestar-types";
import {AbortController, AbortSignal} from "@chainsafe/abort-controller";
import {
  CachedBeaconStateAllForks,
  computeStartSlotAtEpoch,
  allForks,
  bellatrix,
  getCurrentSlot,
  computeEpochAtSlot,
  ISignatureSet,
} from "@chainsafe/lodestar-beacon-state-transition";
import {toHexString} from "@chainsafe/ssz";
import {IForkChoice, IProtoBlock, ExecutionStatus} from "@chainsafe/lodestar-fork-choice";
import {IChainForkConfig} from "@chainsafe/lodestar-config";
import {ErrorAborted, ILogger, sleep} from "@chainsafe/lodestar-utils";
import {IMetrics} from "../../metrics";
import {IExecutionEngine} from "../../executionEngine";
import {BlockError, BlockErrorCode} from "../errors";
import {IBeaconClock} from "../clock";
import {BlockProcessOpts} from "../options";
import {IStateRegenerator, RegenCaller} from "../regen";
import {IBlsVerifier} from "../bls";
import {FullyVerifiedBlock, PartiallyVerifiedBlock} from "./types";
import {ExecutePayloadStatus} from "../../executionEngine/interface";

const executionPayloadZero = ssz.bellatrix.ExecutionPayload.defaultValue();

export type VerifyBlockModules = {
  bls: IBlsVerifier;
  executionEngine: IExecutionEngine;
  regen: IStateRegenerator;
  clock: IBeaconClock;
  logger: ILogger;
  forkChoice: IForkChoice;
  config: IChainForkConfig;
  metrics: IMetrics | null;
};

/**
 * Fully verify a block to be imported immediately after. Does not produce any side-effects besides adding intermediate
 * states in the state cache through regen.
 */
export async function verifyBlocks(
  chain: VerifyBlockModules,
  partiallyVerifiedBlocks: PartiallyVerifiedBlock[],
  opts: BlockProcessOpts
): Promise<FullyVerifiedBlock[]> {
  const {parentBlock, relevantPartiallyVerifiedBlocks} = verifyBlocksSanityChecks(chain, partiallyVerifiedBlocks);

  // No relevant blocks, skip verifyBlocksInEpoch()
  if (relevantPartiallyVerifiedBlocks.length === 0) {
    return [];
  }

  const {postStates, executionStatuses} = await verifyBlocksInEpoch(chain, relevantPartiallyVerifiedBlocks, opts);

  return partiallyVerifiedBlocks.map((partiallyVerifiedBlock, i) => ({
    block: partiallyVerifiedBlock.block,
    postState: postStates[i],
    parentBlockSlot: i === 0 ? parentBlock.slot : partiallyVerifiedBlocks[i - 1].block.message.slot,
    skipImportingAttestations: partiallyVerifiedBlock.skipImportingAttestations,
    executionStatus: executionStatuses[i],
  }));
}

/**
 * Verifies som early cheap sanity checks on the block before running the full state transition.
 *
 * - Parent is known to the fork-choice
 * - Check skipped slots limit
 * - check_block_relevancy()
 *   - Block not in the future
 *   - Not genesis block
 *   - Block's slot is < Infinity
 *   - Not finalized slot
 *   - Not already known
 */
export function verifyBlocksSanityChecks(
  chain: VerifyBlockModules,
  partiallyVerifiedBlocks: PartiallyVerifiedBlock[]
): {parentBlock: IProtoBlock; relevantPartiallyVerifiedBlocks: PartiallyVerifiedBlock[]} {
  if (partiallyVerifiedBlocks.length === 0) {
    throw Error("Empty partiallyVerifiedBlocks");
  }

  const block0 = partiallyVerifiedBlocks[0].block;

  // block0 parent is known to the fork-choice.
  // No need to check the rest of block parents, they are checked in assertLinearChainSegment()
  const parentRoot = toHexString(block0.message.parentRoot);
  const parentBlock = chain.forkChoice.getBlockHex(parentRoot);
  if (!parentBlock) {
    throw new BlockError(block0, {code: BlockErrorCode.PARENT_UNKNOWN, parentRoot});
  }

  const relevantPartiallyVerifiedBlocks = partiallyVerifiedBlocks.filter((partiallyVerifiedBlock) => {
    const {block, ignoreIfFinalized, ignoreIfKnown} = partiallyVerifiedBlock;
    const blockSlot = block.message.slot;

    // Not genesis block
    // IGNORE if `partiallyVerifiedBlock.ignoreIfKnown`
    if (blockSlot === 0) {
      if (ignoreIfKnown) return false;
      throw new BlockError(block, {code: BlockErrorCode.GENESIS_BLOCK});
    }

    // Not finalized slot
    // IGNORE if `partiallyVerifiedBlock.ignoreIfFinalized`
    const finalizedSlot = computeStartSlotAtEpoch(chain.forkChoice.getFinalizedCheckpoint().epoch);
    if (blockSlot <= finalizedSlot) {
      if (ignoreIfFinalized) return false;
      throw new BlockError(block, {code: BlockErrorCode.WOULD_REVERT_FINALIZED_SLOT, blockSlot, finalizedSlot});
    }

    // Check skipped slots limit
    // TODO

    // Block not in the future, also checks for infinity
    const currentSlot = chain.clock.currentSlot;
    if (blockSlot > currentSlot) {
      throw new BlockError(block, {code: BlockErrorCode.FUTURE_SLOT, blockSlot, currentSlot});
    }

    // Not already known
    // IGNORE if `partiallyVerifiedBlock.ignoreIfKnown`
    const blockHash = toHexString(
      chain.config.getForkTypes(block.message.slot).BeaconBlock.hashTreeRoot(block.message)
    );
    if (chain.forkChoice.hasBlockHex(blockHash)) {
      if (ignoreIfKnown) return false;
      throw new BlockError(block, {code: BlockErrorCode.ALREADY_KNOWN, root: blockHash});
    }

    return true;
  });

  return {parentBlock, relevantPartiallyVerifiedBlocks};
}

/**
 * Verifies a block is fully valid running the full state transition. To relieve the main thread signatures are
 * verified separately in workers with chain.bls worker pool.
 *
 * - Advance state to block's slot - per_slot_processing()
 * - STFN - per_block_processing()
 * - Check state root matches
 */
export async function verifyBlocksInEpoch(
  chain: VerifyBlockModules,
  partiallyVerifiedBlocks: PartiallyVerifiedBlock[],
  opts: BlockProcessOpts
): Promise<{postStates: CachedBeaconStateAllForks[]; executionStatuses: ExecutionStatus[]}> {
  if (partiallyVerifiedBlocks.length === 0) {
    throw Error("Empty partiallyVerifiedBlocks");
  }

  // const {block, validProposerSignature, validSignatures} = partiallyVerifiedBlock;

  const block0 = partiallyVerifiedBlocks[0].block;
  const epoch = computeEpochAtSlot(block0.message.slot);

  // Ensure all blocks are in the same epoch
  for (let i = 1; i < partiallyVerifiedBlocks.length; i++) {
    if (epoch !== computeEpochAtSlot(partiallyVerifiedBlocks[i].block.message.slot)) {
      throw Error(`Block ${i} not in same epoch`);
    }
  }

  // TODO: Skip in process chain segment
  // Retrieve preState from cache (regen)
  const preState0 = await chain.regen.getPreState(block0.message, RegenCaller.processBlocksInEpoch).catch((e) => {
    throw new BlockError(block0, {code: BlockErrorCode.PRESTATE_MISSING, error: e as Error});
  });

  // Ensure the state is in the same epoch as block0
  if (epoch !== computeEpochAtSlot(preState0.slot)) {
    throw Error(`preState must be dialed to block epoch ${epoch}`);
  }

  const abortController = new AbortController();

  try {
    const [{postStates}, , {executionStatuses}] = await Promise.all([
      // Run state transition only
      // TODO: Ensure it yields to allow flushing to workers and engine API
      verifyBlockStateTransitionOnly(chain, preState0, partiallyVerifiedBlocks, opts),

      // All signatures at once
      verifyBlocksSignatures(chain, preState0, partiallyVerifiedBlocks),

      // Execution payloads
      verifyBlockExecutionPayloads(chain, partiallyVerifiedBlocks, preState0, abortController.signal, opts),
    ]);

    return {postStates, executionStatuses};
  } finally {
    abortController.abort();
  }
}

/**
 * Verifies a block is fully valid running the full state transition. To relieve the main thread signatures are
 * verified separately in workers with chain.bls worker pool.
 *
 * - Advance state to block's slot - per_slot_processing()
 * - STFN - per_block_processing()
 * - Check state root matches
 */
export async function verifyBlockStateTransitionOnly(
  chain: VerifyBlockModules,
  preState0: CachedBeaconStateAllForks,
  partiallyVerifiedBlocks: PartiallyVerifiedBlock[],
  opts: BlockProcessOpts
): Promise<{postStates: CachedBeaconStateAllForks[]}> {
  const postStates = new Array<CachedBeaconStateAllForks>(partiallyVerifiedBlocks.length);

  for (let i = 0; i < partiallyVerifiedBlocks.length; i++) {
    const {block, validProposerSignature, validSignatures} = partiallyVerifiedBlocks[i];
    const preState = i === 0 ? preState0 : postStates[i - 1];

    // STFN - per_slot_processing() + per_block_processing()
    // NOTE: `regen.getPreState()` should have dialed forward the state already caching checkpoint states
    const useBlsBatchVerify = !opts?.disableBlsBatchVerify;
    const postState = allForks.stateTransition(
      preState,
      block,
      {
        // false because it's verified below with better error typing
        verifyStateRoot: false,
        // if block is trusted don't verify proposer or op signature
        verifyProposer: !useBlsBatchVerify && !validSignatures && !validProposerSignature,
        verifySignatures: !useBlsBatchVerify && !validSignatures,
      },
      chain.metrics
    );

    // Check state root matches
    if (!ssz.Root.equals(block.message.stateRoot, postState.tree.root)) {
      throw new BlockError(block, {
        code: BlockErrorCode.INVALID_STATE_ROOT,
        root: postState.tree.root,
        expectedRoot: block.message.stateRoot.valueOf() as Uint8Array,
        preState,
        postState,
      });
    }

    postStates[i] = postState;

    // this avoids keeping our node busy processing blocks
    if (i < partiallyVerifiedBlocks.length - 1) {
      await sleep(0);
    }
  }

  return {postStates};
}

/**
 * Verifies a block is fully valid running the full state transition. To relieve the main thread signatures are
 * verified separately in workers with chain.bls worker pool.
 *
 * - Advance state to block's slot - per_slot_processing()
 * - STFN - per_block_processing()
 * - Check state root matches
 */
export async function verifyBlocksSignatures(
  chain: VerifyBlockModules,
  preState0: CachedBeaconStateAllForks,
  partiallyVerifiedBlocks: PartiallyVerifiedBlock[]
): Promise<void> {
  const signatureSets: ISignatureSet[] = [];

  // Verify signatures after running state transition, so all SyncCommittee signed roots are known at this point.
  // We must ensure block.slot <= state.slot before running getAllBlockSignatureSets().
  // NOTE: If in the future multiple blocks signatures are verified at once, all blocks must be in the same epoch
  // so the attester and proposer shufflings are correct.
  for (const {block, validProposerSignature} of partiallyVerifiedBlocks) {
    const signatureSetsBlock = allForks.getBlockSignatureSets(preState0, block, {
      skipProposerSignature: validProposerSignature,
    });

    signatureSets.push(...signatureSetsBlock);
  }

  if (signatureSets.length > 0 && !(await chain.bls.verifySignatureSets(signatureSets))) {
    throw new BlockError(partiallyVerifiedBlocks[0].block, {code: BlockErrorCode.INVALID_SIGNATURE, state: preState0});
  }
}

/**
 * Verifies a block is fully valid running the full state transition. To relieve the main thread signatures are
 * verified separately in workers with chain.bls worker pool.
 *
 * - Advance state to block's slot - per_slot_processing()
 * - STFN - per_block_processing()
 * - Check state root matches
 */
export async function verifyBlockExecutionPayloads(
  chain: VerifyBlockModules,
  partiallyVerifiedBlocks: PartiallyVerifiedBlock[],
  preState0: CachedBeaconStateAllForks,
  signal: AbortSignal,
  opts: BlockProcessOpts
): Promise<{executionStatuses: ExecutionStatus[]}> {
  const executionStatuses = new Array<ExecutionStatus>(partiallyVerifiedBlocks.length);

  for (const partiallyVerifiedBlock of partiallyVerifiedBlocks) {
    // If blocks are invalid in consensus the main promise could resolve before this loop ends.
    // in that case stop sending blocks to execution engine
    if (signal.aborted) {
      throw new ErrorAborted("verifyBlockExecutionPayloads");
    }

    const {executionStatus} = await verifyBlockExecutionPayload(chain, partiallyVerifiedBlock, preState0, opts);
    executionStatuses.push(executionStatus);
  }

  return {executionStatuses};
}

/**
 * Verifies a block is fully valid running the full state transition. To relieve the main thread signatures are
 * verified separately in workers with chain.bls worker pool.
 *
 * - Advance state to block's slot - per_slot_processing()
 * - STFN - per_block_processing()
 * - Check state root matches
 */
export async function verifyBlockExecutionPayload(
  chain: VerifyBlockModules,
  partiallyVerifiedBlock: PartiallyVerifiedBlock,
  preState0: CachedBeaconStateAllForks,
  opts: BlockProcessOpts
): Promise<{executionStatus: ExecutionStatus}> {
  const {block} = partiallyVerifiedBlock;

  // TODO: Review mergeBlock conditions
  /** Not null if execution is enabled */
  const executionPayloadEnabled =
    bellatrix.isBellatrixStateType(preState0) &&
    bellatrix.isBellatrixBlockBodyType(block.message.body) &&
    // Safe to use with a state previous to block's preState. isMergeComplete can only transition from false to true.
    // - If preState0 is after merge block: condition is true, and will always be true
    // - If preState0 is before merge block: the block could lie but then state transition function will throw above
    // It is kinda safe to send non-trusted payloads to the execution client because at most it can trigger sync.
    // TODO: If this becomes a problem, do some basic verification beforehand, like checking the proposer signature.
    bellatrix.isExecutionEnabled(preState0, block.message.body)
      ? block.message.body.executionPayload
      : null;

  if (!executionPayloadEnabled) {
    // isExecutionEnabled() -> false
    return {executionStatus: ExecutionStatus.PreMerge};
  }

  // TODO: Handle better notifyNewPayload() returning error is syncing
  const execResult = await chain.executionEngine.notifyNewPayload(
    // executionPayload must be serialized as JSON and the TreeBacked structure breaks the baseFeePerGas serializer
    // For clarity and since it's needed anyway, just send the struct representation at this level such that
    // notifyNewPayload() can expect a regular JS object.
    // TODO: If blocks are no longer TreeBacked, remove.
    executionPayloadEnabled.valueOf() as typeof executionPayloadEnabled
  );

  switch (execResult.status) {
    case ExecutePayloadStatus.VALID:
      chain.forkChoice.validateLatestHash(execResult.latestValidHash, null);
      return {executionStatus: ExecutionStatus.Valid};

    case ExecutePayloadStatus.INVALID: {
      // If the parentRoot is not same as latestValidHash, then the branch from latestValidHash
      // to parentRoot needs to be invalidated
      const parentHashHex = toHexString(block.message.parentRoot);
      chain.forkChoice.validateLatestHash(
        execResult.latestValidHash,
        parentHashHex !== execResult.latestValidHash ? parentHashHex : null
      );
      throw new BlockError(block, {
        code: BlockErrorCode.EXECUTION_ENGINE_ERROR,
        execStatus: execResult.status,
        errorMessage: execResult.validationError ?? "",
      });
    }

    // Accepted and Syncing have the same treatment, as final validation of block is pending
    case ExecutePayloadStatus.ACCEPTED:
    case ExecutePayloadStatus.SYNCING: {
      // It's okay to ignore SYNCING status as EL could switch into syncing
      // 1. On intial startup/restart
      // 2. When some reorg might have occured and EL doesn't has a parent root
      //    (observed on devnets)
      // 3. Because of some unavailable (and potentially invalid) root but there is no way
      //    of knowing if this is invalid/unavailable. For unavailable block, some proposer
      //    will (sooner or later) build on the available parent head which will
      //    eventually win in fork-choice as other validators vote on VALID blocks.
      // Once EL catches up again and respond VALID, the fork choice will be updated which
      // will either validate or prune invalid blocks
      //
      // When to import such blocks:
      // From: https://github.com/ethereum/consensus-specs/pull/2770/files
      // A block MUST NOT be optimistically imported, unless either of the following
      // conditions are met:
      //
      // 1. The justified checkpoint has execution enabled
      // 2. The current slot (as per the system clock) is at least
      //    SAFE_SLOTS_TO_IMPORT_OPTIMISTICALLY ahead of the slot of the block being
      //    imported.
      const justifiedBlock = chain.forkChoice.getJustifiedBlock();
      const clockSlot = getCurrentSlot(chain.config, preState0.genesisTime);

      if (
        justifiedBlock.executionStatus === ExecutionStatus.PreMerge &&
        block.message.slot + opts.safeSlotsToImportOptimistically > clockSlot
      ) {
        throw new BlockError(block, {
          code: BlockErrorCode.EXECUTION_ENGINE_ERROR,
          execStatus: ExecutePayloadStatus.UNSAFE_OPTIMISTIC_STATUS,
          errorMessage: `not safe to import ${execResult.status} payload within ${opts.safeSlotsToImportOptimistically} of currentSlot, status=${execResult.status}`,
        });
      }

      return {executionStatus: ExecutionStatus.Syncing};
    }

    // If the block has is not valid, or it referenced an invalid terminal block then the
    // block is invalid, however it has no bearing on any forkChoice cleanup
    //
    // There can be other reasons for which EL failed some of the observed ones are
    // 1. Connection refused / can't connect to EL port
    // 2. EL Internal Error
    // 3. Geth sometimes gives invalid merkel root error which means invalid
    //    but expects it to be handled in CL as of now. But we should log as warning
    //    and give it as optimistic treatment and expect any other non-geth CL<>EL
    //    combination to reject the invalid block and propose a block.
    //    On kintsugi devnet, this has been observed to cause contiguous proposal failures
    //    as the network is geth dominated, till a non geth node proposes and moves network
    //    forward
    // For network/unreachable errors, an optimization can be added to replay these blocks
    // back. But for now, lets assume other mechanisms like unknown parent block of a future
    // child block will cause it to replay

    case ExecutePayloadStatus.INVALID_BLOCK_HASH:
    case ExecutePayloadStatus.INVALID_TERMINAL_BLOCK:
    case ExecutePayloadStatus.ELERROR:
    case ExecutePayloadStatus.UNAVAILABLE:
      throw new BlockError(block, {
        code: BlockErrorCode.EXECUTION_ENGINE_ERROR,
        execStatus: execResult.status,
        errorMessage: execResult.validationError,
      });
  }
}

/**
 * Execution enabled = merge is done.
 * When (A) state has execution data OR (B) block has execution data
 */
export function isExecutionEnabledBlock(body: bellatrix.BeaconBlockBody): boolean {
  return !ssz.bellatrix.ExecutionPayload.equals(body.executionPayload, executionPayloadZero);
}
