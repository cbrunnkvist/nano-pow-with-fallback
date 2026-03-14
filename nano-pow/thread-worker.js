self.importScripts("nano-pow.js");
self.importScripts("index.js");

Module.onRuntimeInitialized = NanoPow.workerInitialize;

let running = false;
let calls = 0;

onmessage = function (ev) {
  const { command, hash, threshold } = ev.data;

  if (command === 'start') {
    running = true;
    calls = 0;
    while (running) {
      const nonce = NanoPow._getProofOfWork(hash, threshold);
      calls++;
      if (nonce !== "0000000000000000") {
        running = false;
        powFound(hash, threshold, nonce, calls);
        return;
      }
    }
  } else if (command === 'stop') {
    running = false;
    postMessage({ message: 'stopped', calls });
  }
};

function powFound(hash, threshold, proofOfWork, calls) {
  return postMessage({ message: "success", hash, threshold, proofOfWork, calls });
}
