import {Worker} from "worker_threads";
import {createServer} from "http";
import path from "path";
import fs from "fs";

const port = 5000;
const worker = createWorker();
const workers = new Set<Worker>();

const testCase: "memory-in-worker" | "worker-count" = "worker-count";

setInterval(() => {
  if (testCase === "worker-count") {
    workers.add(createWorker());
  }

  // "memory-in-worker"
  else {
    const mbToIncrease = 500;
    console.log(`Increasing memory by ${mbToIncrease} MB`);
    worker.postMessage({mbToIncrease});
  }

  const procStatusStr = fs.readFileSync("/proc/self/status", "utf8");
  const procStatus = structureOutput(procStatusStr);
  const vmData = procStatus["VmData"];
  const mem = process.memoryUsage();
  console.log(`vmData: ${Math.round(vmData / 1e6)} MB, heapTotal: ${Math.round(mem.heapTotal / 1e6)} MB`);
}, 1000);

createServer((req, res) => {
  // req.url = /500
  const mbToIncrease = parseInt((req.url || "").slice(1));
  if (isNaN(mbToIncrease)) {
    res.writeHead(500, "mbToIncrease NaN");
  } else {
    console.log(`Increasing memory by ${mbToIncrease} MB`);
    worker.postMessage({mbToIncrease});
    res.end();
  }
}).listen(port);

console.log(`Add 500MB of memory to a worker_thread by
$ curl http://localhost:${port}/500
`);

function createWorker() {
  const worker = new Worker(path.join(__dirname, "./worker.js"));
  worker.on("error", (err) => {
    console.log("worker error", err);
  });
  worker.on("messageerror", (err) => {
    console.log("worker messageerror", err);
  });
  return worker;
}

function structureOutput(input: string): Record<string, number> {
  const values = ["VmSize", "VmRSS", "VmData"];
  const returnValue: Record<string, number> = {};

  input
    .split("\n")
    .filter((s) => values.some((value) => s.indexOf(value) === 0))
    .forEach((string) => {
      const split = string.split(":");

      // Get the value
      let value = split[1].trim();
      // Remove trailing ` kb`
      value = value.substr(0, value.length - 3);
      // Make it into a number in bytes bytes
      const valueNum = Number(value) * 1024;

      returnValue[split[0]] = valueNum;
    });

  return returnValue;
}
