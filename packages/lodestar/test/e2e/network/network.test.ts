import {Discv5Discovery, ENR} from "@chainsafe/discv5";
import {config} from "@chainsafe/lodestar-config/mainnet";
import {Attestation, SignedBeaconBlock} from "@chainsafe/lodestar-types";
import {LogLevel, sleep, WinstonLogger, withTimeout} from "@chainsafe/lodestar-utils";
import {expect} from "chai";
import sinon, {SinonStubbedInstance} from "sinon";
import {IBeaconChain} from "../../../src/chain";
import {BeaconMetrics} from "../../../src/metrics";
import {IReqRespHandler, Libp2pNetwork} from "../../../src/network";
import {ExtendedValidatorResult} from "../../../src/network/gossip/constants";
import {getAttestationSubnetEvent} from "../../../src/network/gossip/utils";
import {GossipMessageValidator} from "../../../src/network/gossip/validator";
import {INetworkOptions} from "../../../src/network/options";
import {generateEmptyAttestation, generateEmptySignedAggregateAndProof} from "../../utils/attestation";
import {generateEmptySignedBlock} from "../../utils/block";
import {silentLogger} from "../../utils/logger";
import {MockBeaconChain} from "../../utils/mocks/chain/chain";
import {createNode} from "../../utils/network";
import {generateState} from "../../utils/state";
import {connect, disconnect, onPeerConnect, onPeerDisconnect} from "../../utils/network";

describe("network", function () {
  if (this.timeout() < 5000) this.timeout(5000);

  const multiaddr = "/ip4/127.0.0.1/tcp/0";
  const opts: INetworkOptions = {
    maxPeers: 1,
    minPeers: 1,
    bootMultiaddrs: [],
    rpcTimeout: 5000,
    connectTimeout: 5000,
    disconnectTimeout: 5000,
    localMultiaddrs: [],
  };

  const metrics = new BeaconMetrics({enabled: true, timeout: 5000, pushGateway: false}, {logger: silentLogger});
  const validator = {} as GossipMessageValidator & SinonStubbedInstance<GossipMessageValidator>;
  validator.isValidIncomingBlock = sinon.stub();
  validator.isValidIncomingAggregateAndProof = sinon.stub();
  validator.isValidIncomingCommitteeAttestation = sinon.stub();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const reqRespHandler: IReqRespHandler = {onRequest: async function* () {}};

  let chain: IBeaconChain;
  let netA: Libp2pNetwork, netB: Libp2pNetwork;

  beforeEach(async () => {
    const block = generateEmptySignedBlock();
    const state = generateState({
      finalizedCheckpoint: {
        epoch: 0,
        root: config.types.BeaconBlock.hashTreeRoot(block.message),
      },
    });
    // state.finalizedCheckpoint = {
    //   epoch: 0,
    //   root: config.types.BeaconBlock.hashTreeRoot(block.message),
    // };
    chain = new MockBeaconChain({genesisTime: 0, chainId: 0, networkId: BigInt(0), state, config});
    const [libp2pA, libp2pB] = await Promise.all([createNode(multiaddr), createNode(multiaddr)]);

    // Run tests with `DEBUG=true mocha ...` to get detailed logs of ReqResp exchanges
    const debugMode = process.env.DEBUG;
    const loggerA = debugMode ? new WinstonLogger({level: LogLevel.verbose, module: "A"}) : silentLogger;
    const loggerB = debugMode ? new WinstonLogger({level: LogLevel.verbose, module: "B"}) : silentLogger;

    const modules = {config, metrics, validator, chain, reqRespHandler};
    netA = new Libp2pNetwork(opts, {...modules, libp2p: libp2pA, logger: loggerA});
    netB = new Libp2pNetwork(opts, {...modules, libp2p: libp2pB, logger: loggerB});
    await Promise.all([netA.start(), netB.start()]);
  });

  afterEach(async () => {
    chain.close();
    await Promise.all([netA.stop(), netB.stop()]);
    sinon.restore();
  });

  it("should create a peer on connect", async function () {
    await Promise.all([onPeerConnect(netA), onPeerConnect(netB), connect(netA, netB.peerId, netB.localMultiaddrs)]);
    expect(Array.from(netA.getConnectionsByPeer().values()).length).to.equal(1);
    expect(Array.from(netB.getConnectionsByPeer().values()).length).to.equal(1);
  });

  it("should delete a peer on disconnect", async function () {
    const connected = Promise.all([onPeerConnect(netA), onPeerConnect(netB)]);
    await connect(netA, netB.peerId, netB.localMultiaddrs);
    await connected;

    const disconnection = Promise.all([onPeerDisconnect(netA), onPeerDisconnect(netB)]);
    await sleep(100);

    await disconnect(netA, netB.peerId);
    await disconnection;
    await sleep(200);

    expect(Array.from(netA.getConnectionsByPeer().values()).length).to.equal(0);
    expect(Array.from(netB.getConnectionsByPeer().values()).length).to.equal(0);
  });

  it("should not receive duplicate block", async function () {
    const connected = Promise.all([onPeerConnect(netA), onPeerConnect(netB)]);
    const spy = sinon.spy();
    const forkDigest = chain.getForkDigest();
    const received = new Promise<void>((resolve) => {
      netA.gossip.subscribeToBlock(forkDigest, () => {
        spy();
        resolve();
      });
      setTimeout(resolve, 2000);
    });
    await connect(netA, netB.peerId, netB.localMultiaddrs);

    // wait for peers to be connected in libp2p-interfaces
    await connected;
    await sleep(200);

    validator.isValidIncomingBlock.resolves(ExtendedValidatorResult.accept);
    const block = generateEmptySignedBlock();
    block.message.slot = 2020;
    for (let i = 0; i < 5; i++) {
      await netB.gossip.publishBlock(block);
    }
    await received;
    expect(spy.callCount).to.be.equal(1);
  });

  it("should receive blocks on subscription", async function () {
    const connected = Promise.all([onPeerConnect(netA), onPeerConnect(netB)]);
    await connect(netA, netB.peerId, netB.localMultiaddrs);
    await connected;
    const forkDigest = chain.getForkDigest();
    const received = withTimeout(
      () => new Promise<SignedBeaconBlock>((resolve) => netA.gossip.subscribeToBlock(forkDigest, resolve)),
      4000
    );

    // wait for peers to be connected in libp2p-interfaces
    await new Promise((resolve) => setTimeout(resolve, 200));
    validator.isValidIncomingBlock.resolves(ExtendedValidatorResult.accept);
    const block = generateEmptySignedBlock();
    block.message.slot = 2020;
    void netB.gossip.publishBlock(block).catch((e) => console.error(e));
    const receivedBlock = await received;
    expect(config.types.SignedBeaconBlock.equals(receivedBlock as SignedBeaconBlock, block)).to.be.true;
  });

  it("should receive aggregate on subscription", async function () {
    const connected = Promise.all([onPeerConnect(netA), onPeerConnect(netB)]);
    await connect(netA, netB.peerId, netB.localMultiaddrs);
    await connected;
    const forkDigest = chain.getForkDigest();
    const received = new Promise((resolve, reject) => {
      setTimeout(reject, 4000);
      netA.gossip.subscribeToAggregateAndProof(forkDigest, resolve);
    });
    // wait for peers to be connected in libp2p-interfaces
    await new Promise((resolve) => setTimeout(resolve, 200));
    validator.isValidIncomingAggregateAndProof.resolves(ExtendedValidatorResult.accept);
    await netB.gossip.publishAggregatedAttestation(generateEmptySignedAggregateAndProof());
    await received;
  });

  it("should receive committee attestations on subscription", async function () {
    const connected = Promise.all([onPeerConnect(netA), onPeerConnect(netB)]);
    await connect(netA, netB.peerId, netB.localMultiaddrs);
    await connected;
    const forkDigest = chain.getForkDigest();
    let callback: (attestation: {attestation: Attestation; subnet: number}) => void;
    const received = new Promise((resolve, reject) => {
      setTimeout(reject, 4000);
      netA.gossip.subscribeToAttestationSubnet(forkDigest, 0, resolve);
      callback = resolve;
    });
    // wait for peers to be connected in libp2p-interfaces
    await new Promise((resolve) => setTimeout(resolve, 200));
    const attestation = generateEmptyAttestation();
    attestation.data.index = 0;
    validator.isValidIncomingCommitteeAttestation.resolves(ExtendedValidatorResult.accept);
    await netB.gossip.publishCommiteeAttestation(attestation);
    await received;
    expect(netA.gossip.listenerCount(getAttestationSubnetEvent(0))).to.be.equal(1);
    netA.gossip.unsubscribeFromAttestationSubnet(forkDigest, "0", callback!);
    expect(netA.gossip.listenerCount(getAttestationSubnetEvent(0))).to.be.equal(0);
  });

  it("should connect to new peer by subnet", async function () {
    const subnetId = 10;
    netB.metadata.attnets[subnetId] = true;
    const connected = Promise.all([onPeerConnect(netA), onPeerConnect(netB)]);
    const enrB = ENR.createFromPeerId(netB.peerId);
    enrB.set("attnets", Buffer.from(config.types.AttestationSubnets.serialize(netB.metadata.attnets)));
    enrB.setLocationMultiaddr((netB["libp2p"]._discovery.get("discv5") as Discv5Discovery).discv5.bindAddress);
    enrB.setLocationMultiaddr(netB["libp2p"].multiaddrs[0]);

    // let discv5 of A know enr of B
    const discovery: Discv5Discovery = netA["libp2p"]._discovery.get("discv5") as Discv5Discovery;
    discovery.discv5.addEnr(enrB);
    await netA.requestAttSubnets([{subnetId, toSlot: Infinity}]);
    await connected;

    expect(netA.getConnectionsByPeer().has(netB.peerId.toB58String())).to.be.equal(
      true,
      "netA has not connected to peerB"
    );
  });
});
