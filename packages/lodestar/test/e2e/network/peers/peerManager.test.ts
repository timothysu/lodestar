import {EventEmitter} from "events";
import sinon from "sinon";
import {ReqRespEmitter} from "../../../../src/network";
import PeerId from "peer-id";
import {expect} from "chai";
import {AbortController} from "abort-controller";
import {config} from "@chainsafe/lodestar-config/mainnet";
import {silentLogger} from "../../../utils/logger";
import {Libp2pPeerMetadataStore} from "../../../../src/network/peers/metastore";
import {IReqResp, ReqRespEvent} from "../../../../src/network/reqresp";
import {SimpleRpcScore} from "../../../../src/network/peers";
import {PeerManager} from "../../../../src/network/peers/peerManager";
import {BeaconMetrics} from "../../../../src/metrics";
import {createNode} from "../../../utils/network";
import {MockBeaconChain} from "../../../utils/mocks/chain/chain";
import {generateEmptySignedBlock} from "../../../utils/block";
import {generateState} from "../../../utils/state";
import {Metadata} from "@chainsafe/lodestar-types";
import {LogLevel, sleep, WinstonLogger} from "@chainsafe/lodestar-utils";

// Run tests with `DEBUG=true mocha ...` to get detailed logs of ReqResp exchanges
const debugMode = process.env.DEBUG;
const logger = debugMode ? new WinstonLogger({level: LogLevel.debug}) : silentLogger;

// TODO: Tests

// handlePeerMetadataSequence
// - Show that if seqNum is the same should not request metadata
// - Show that if seqNum is bigger should request metadata

// findMissingSubnets
// - Ensure there are peers for all required subnets

// syncPeersToDisconnect + gossipPeersToDisconnect
// - Compute peers to disconnect, according to conditions

// CheckPeerAliveTask
// - cannot ping, should disconnect
// - ping returns null, should disconnect
// - ping successfully, return same sequence number > metadata not called
// - ping successfully, return bigger sequence number > metadata called

// DiversifyPeersBySubnetTask
// - ??

// Sync / ReqResp
// - hello handshake on peer connect with correct encoding
//    A sends status request to B with ssz encoding
//    Peers should know each other and store the prefered encoding to
//    netA.peerMetadata.getEncoding(netB.peerId)
// - Should goodbye all peers on stop

// sync peer utils
// - Filter and prioritize peers for sync or something else

describe("network / peers / PeerManager", function () {
  const peerId1 = new PeerId(Buffer.from("lodestar-1"));
  const peerId2 = new PeerId(Buffer.from("lodestar-2"));

  const metrics = new BeaconMetrics({enabled: true, timeout: 5000, pushGateway: false}, {logger});

  const afterEachCallbacks: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    while (afterEachCallbacks.length > 0) {
      const callback = afterEachCallbacks.pop();
      if (callback) await callback();
    }
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async function mockModules() {
    // Setup fake chain
    const block = generateEmptySignedBlock();
    const state = generateState({
      finalizedCheckpoint: {
        epoch: 0,
        root: config.types.BeaconBlock.hashTreeRoot(block.message),
      },
    });
    const chain = new MockBeaconChain({
      genesisTime: 0,
      chainId: 0,
      networkId: BigInt(0),
      state,
      config,
    });
    const libp2p = await createNode("/ip4/127.0.0.1/tcp/0");
    const controller = new AbortController();

    afterEachCallbacks.push(async () => {
      chain.close();
      await libp2p.stop();
      controller.abort();
    });

    return {chain, libp2p, controller};
  }

  // Create a real event emitter with stubbed methods
  class ReqRespFake extends (EventEmitter as {new (): ReqRespEmitter}) implements IReqResp {
    status = sinon.stub();
    metadata = sinon.stub();
    goodbye = sinon.stub();
    ping = sinon.stub();
    beaconBlocksByRange = sinon.stub();
    beaconBlocksByRoot = sinon.stub();
  }

  it("Should request metadata on receivedPing of unknown peer", async () => {
    const {chain, libp2p, controller} = await mockModules();

    const seqNumber = BigInt(2);
    const metadata: Metadata = {seqNumber, attnets: []};

    const reqRespFake = new ReqRespFake();
    const peerMetadataStore = new Libp2pPeerMetadataStore(config, libp2p.peerStore.metadataBook);
    const peerScoreStore = new SimpleRpcScore(peerMetadataStore);

    const peerManager = new PeerManager(
      libp2p,
      reqRespFake,
      logger,
      metrics,
      chain,
      config,
      controller.signal,
      peerMetadataStore,
      peerScoreStore,
      {targetPeers: 30, maxPeers: 50}
    );

    // Simulate peer1 responding with its metadata
    reqRespFake.metadata.resolves(metadata);

    // We get a ping by peer1, don't have it's metadata so it gets requested
    reqRespFake.emit(ReqRespEvent.receivedPing, peerId1, seqNumber);

    expect(reqRespFake.metadata.callCount).to.equal(1, "reqResp.metadata must be called once");
    expect(reqRespFake.metadata.getCall(0).args[0]).to.equal(peerId1, "reqResp.metadata must be called with peer1");

    // Allow requestMetadata promise to resolve
    await sleep(0, controller.signal);

    // We get another ping by peer1, but with an already known seqNumber
    reqRespFake.metadata.reset();
    reqRespFake.emit(ReqRespEvent.receivedPing, peerId1, seqNumber);

    expect(reqRespFake.metadata.callCount).to.equal(0, "reqResp.metadata must not be called again");
  });
});
