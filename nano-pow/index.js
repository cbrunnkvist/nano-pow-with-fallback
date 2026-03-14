var NanoPow = {
  THRESHOLD__SEND_CHANGE: "fffffff800000000",
  THRESHOLD__OPEN_RECEIVE: "fffffe0000000000",

  workerInitialize() {
    C_getProofOfWork = (hash, threshold) => {
      return Module.ccall(
        "getProofOfWork",
        "string",
        ["string", "string"],
        [hash, threshold]
      );
    };

    postMessage({ message: "ready" });
  },

  _getProofOfWork: (hash, threshold) => C_getProofOfWork(hash, threshold),

  async getProofOfWork({ hash, threshold }) {
    return NanoPow.getProofOfWorkMultiThreaded(
      { hash, threshold },
      { workers: 1 }
    );
  },

  getProofOfWorkMultiThreaded: async function (
    { hash, threshold },
    options = {}
  ) {
    return new Promise((resolve) => {
      const threads = options.workers || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1);
      const workers = getPowWorkers(threads, options.workerScriptPath);
      let resolved = false;
      let totalCalls = 0;
      let finishedWorkers = 0;
      let resolveValue = null;

      if (hash.length == 64) {
        for (let worker of workers) {
          worker.onmessage = (e) => {
            const { message, ...result } = e.data;
            switch (message) {
              case "ready":
                worker.postMessage({
                  command: "start",
                  hash,
                  threshold: threshold,
                });
                break;
              case "success":
              case "stopped":
                totalCalls += result.calls || 0;
                finishedWorkers++;

                if (message === "success" && !resolved) {
                  resolved = true;
                  // Stop all other workers to get their call counts
                  for (let w of workers) {
                    if (w !== worker) w.postMessage({ command: "stop" });
                  }
                  resolveValue = { proofOfWork: result.proofOfWork };
                }

                if (finishedWorkers === workers.length) {
                  resolve({ ...resolveValue, calls: totalCalls });
                  terminateWorkers(workers);
                }
                break;
            }
          };
        }
      }
    });
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.NanoPow = NanoPow;
} else if (typeof window !== 'undefined') {
  window.NanoPow = NanoPow;
} else if (typeof global !== 'undefined') {
  global.NanoPow = NanoPow;
}

// multithreaded capability

let nanoPowScriptDirectory = "";
if (typeof document !== 'undefined' && document.currentScript) {
  nanoPowScriptDirectory = new URL('.', document.currentScript.src).href;
} else if (typeof self !== 'undefined' && self.location) {
  nanoPowScriptDirectory = new URL('.', self.location.href).href;
}

function defaultThreadCount() {
  const hardwareConcurrency =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, hardwareConcurrency - 1);
}

function normalizeThreadCount(threads) {
  if (threads === undefined || threads === null) {
    return defaultThreadCount();
  }
  const numeric = Number(threads);
  if (!Number.isFinite(numeric)) {
    return defaultThreadCount();
  }
  return Math.max(1, Math.floor(numeric));
}

function getPowWorkers(threads, workerScriptPath = "") {
  const workerCount = normalizeThreadCount(threads);
  const workers = [];
  const finalPath = workerScriptPath || (nanoPowScriptDirectory + "thread-worker.js");
  for (let i = 0; i < workerCount; i++) {
    workers[i] = new Worker(finalPath);
  }
  return workers;
}

function terminateWorkers(workers) {
  for (let worker of workers) {
    worker.terminate();
  }
}
