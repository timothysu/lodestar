const {Worker, isMainThread, parentPort, workerData} = require("worker_threads");

const arr = [];

if (isMainThread) {
  throw Error("Must not run in isMainThread");
} else {
  console.log("Starting worker");
}

parentPort.on("message", ({mbToIncrease}) => {
  //
  mbToIncrease;
  for (let i = 0; i < 1e7; i++) {
    arr.push(i);
  }
});
