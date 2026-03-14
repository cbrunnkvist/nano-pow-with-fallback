import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const wasmModulePath = path.join(__dirname, '../nano-pow/nano-pow-node.cjs');
const Module = require(wasmModulePath);

const wasmGetPoW = (hash, threshold) => Module.ccall("getProofOfWork", "string", ["string", "string"], [hash, threshold]);

function run() {
    if (!Module.ready) {
        setTimeout(run, 10);
        return;
    }

    let running = false;
    let calls = 0;

    parentPort.on('message', (data) => {
        if (data.command === 'start') {
            const { hash, threshold } = data;
            running = true;
            calls = 0;
            
            while (running) {
                const nonce = wasmGetPoW(hash, threshold);
                calls++;
                
                if (nonce !== "0000000000000000") {
                    running = false;
                    parentPort.postMessage({ message: 'success', proofOfWork: nonce, calls });
                    return;
                }
                
                // Check for stop command frequently
                // In Node worker_threads, we can't easily check for new messages while in a tight loop
                // unless we use Atomics or similar. 
                // But for a benchmark, we want a tight loop.
                // We'll trust the benchmark runner to terminate us.
            }
        } else if (data.command === 'stop') {
            running = false;
            parentPort.postMessage({ message: 'stopped', calls });
        }
    });

    parentPort.postMessage({ message: 'ready' });
}

run();
