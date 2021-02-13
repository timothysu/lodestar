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
import {PeerManager, PeerManagerEvent} from "../../../../src/network/peers/peerManager";
import {BeaconMetrics} from "../../../../src/metrics";
import {createNode, getAttnets} from "../../../utils/network";
import {MockBeaconChain} from "../../../utils/mocks/chain/chain";
import {generateEmptySignedBlock} from "../../../utils/block";
import {generateState} from "../../../utils/state";
import {Metadata} from "@chainsafe/lodestar-types";
import {LogLevel, sleep, WinstonLogger} from "@chainsafe/lodestar-utils";
import {waitForEvent} from "../../../utils/events/resolver";

// Run tests with `DEBUG=true mocha ...` to get detailed logs of ReqResp exchanges
const debugMode = process.env.DEBUG;
const logger = debugMode ? new WinstonLogger({level: LogLevel.debug}) : silentLogger;

describe("network / peers / PeerManager", function () {
  const peerId1 = new PeerId(Buffer.from("lodestar-1"));

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

    return {chain, libp2p, controller, reqRespFake, peerMetadataStore, peerManager};
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
    const {reqRespFake, controller} = await mockModules();

    const seqNumber = BigInt(2);
    const metadata: Metadata = {seqNumber, attnets: []};

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

  const libp2pConnectionOutboud = {
    stat: {direction: "outbound", status: "open"},
    remotePeer: peerId1,
  } as LibP2pConnection;

  it("Should emit peer connected event on relevant peer status", async function () {
    const {chain, libp2p, reqRespFake, peerMetadataStore, peerManager} = await mockModules();

    // Simualate a peer connection, get() should return truthy
    libp2p.connectionManager.connections.set(peerId1.toB58String(), [libp2pConnectionOutboud]);

    // Subscribe to `peerConnected` event, which must fire after checking peer relevance
    const peerConnectedPromise = waitForEvent(peerManager, PeerManagerEvent.peerConnected, this.timeout() / 2);

    // Send the local status and remote status, which always passes the assertPeerRelevance function
    const remoteStatus = chain.getStatus();
    reqRespFake.emit(ReqRespEvent.receivedStatus, peerId1, remoteStatus);

    await peerConnectedPromise;

    expect(peerMetadataStore.status.get(peerId1)).to.deep.equal(remoteStatus, "Wrong stored status");
  });

  it("On peerConnect handshake flow", async function () {
    const {chain, libp2p, reqRespFake, peerMetadataStore, controller, peerManager} = await mockModules();

    // Simualate a peer connection, get() should return truthy
    libp2p.connectionManager.get = sinon.stub().returns({});

    // Subscribe to `peerConnected` event, which must fire after checking peer relevance
    const peerConnectedPromise = waitForEvent(peerManager, PeerManagerEvent.peerConnected, this.timeout() / 2);

    // Simulate peer1 returning a PING and STATUS message
    const remoteStatus = chain.getStatus();
    const remoteMetadata: Metadata = {seqNumber: BigInt(1), attnets: getAttnets()};
    reqRespFake.ping.resolves(remoteMetadata.seqNumber);
    reqRespFake.status.resolves(remoteStatus);
    reqRespFake.metadata.resolves(remoteMetadata);

    // Simualate a peer connection, get() should return truthy
    libp2p.connectionManager.connections.set(peerId1.toB58String(), [libp2pConnectionOutboud]);
    ((libp2p.connectionManager as any) as EventEmitter).emit("peer:connect", libp2pConnectionOutboud);

    await peerConnectedPromise;

    // Allow requestMetadata promise to resolve
    await sleep(0, controller.signal);

    // After receiving the "peer:connect" event, the PeerManager must
    // 1. Call reqResp.ping
    // 2. Call reqResp.status
    // 3. Receive ping result (1) and call reqResp.metadata
    // 4. Receive status result (2) assert peer relevance and emit `PeerManagerEvent.peerConnected`
    expect(reqRespFake.ping.callCount).to.equal(1, "reqResp.ping must be called");
    expect(reqRespFake.status.callCount).to.equal(1, "reqResp.status must be called");
    expect(reqRespFake.metadata.callCount).to.equal(1, "reqResp.metadata must be called");

    expect(peerMetadataStore.status.get(peerId1)).to.deep.equal(remoteStatus, "Wrong stored status");
    expect(peerMetadataStore.metadata.get(peerId1)).to.deep.equal(remoteMetadata, "Wrong stored metadata");
  });
});
