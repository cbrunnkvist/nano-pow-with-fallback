import blake from 'blakejs';
import { WebGPUPow } from '../src/webgpu-pow.js';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load WASM Module using the Node-optimized wrapper
const wasmModulePath = path.join(__dirname, '../nano-pow/nano-pow-node.cjs');
const Module = require(wasmModulePath);

function hexToBytes(hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function verifyPoW(nonceHex, hashHex, thresholdHex) {
    const nonceBytes = hexToBytes(nonceHex).reverse(); // LE
    const hashBytes = hexToBytes(hashHex);
    const input = new Uint8Array(40);
    input.set(nonceBytes, 0);
    input.set(hashBytes, 8);

    const digest = blake.blake2b(input, null, 8);
    const digestView = new DataView(digest.buffer);
    const outputBigInt = BigInt(digestView.getUint32(0, true)) + (BigInt(digestView.getUint32(4, true)) << 32n);
    const thresholdBigInt = BigInt("0x" + thresholdHex);

    // Matches C++: if (output > threshold)
    return outputBigInt > thresholdBigInt;
}

async function runBenchmark() {
    console.log("--- Nano PoW Benchmark ---");
    
    // Wait for WASM
    if (!global.Module.ready) {
        await new Promise(resolve => {
            const check = () => {
                if (global.Module.ready) resolve();
                else setTimeout(check, 10);
            };
            check();
        });
    }

    const wasmGetPoW = (hash, threshold) => global.Module.ccall("getProofOfWork", "string", ["string", "string"], [hash, threshold]);
    console.log("WASM Initialized");

    // Initialize WebGPU
    const webgpuPow = new WebGPUPow();
    await webgpuPow.init();
    console.log("WebGPU Initialized");

    const testCases = [
        { name: "Open/Receive", threshold: "fffffe0000000000", hash: "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000" },
        { name: "Send/Change", threshold: "fffffff800000000", hash: "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000" }
    ];

    const results = [];

    for (const test of testCases) {
        console.log(`\nTesting ${test.name} (Threshold: ${test.threshold})...`);

        // WASM Benchmark (Single Threaded in this context)
        console.log(`Running WASM (Single-threaded)...`);
        const wasmStart = Date.now();
        let wasmNonce = "0000000000000000";
        while (wasmNonce === "0000000000000000") {
            wasmNonce = wasmGetPoW(test.hash, test.threshold);
        }
        const wasmEnd = Date.now();
        const wasmTime = (wasmEnd - wasmStart) / 1000;
        const wasmValid = verifyPoW(wasmNonce, test.hash, test.threshold);
        console.log(`WASM Nonce: ${wasmNonce} (Valid: ${wasmValid})`);

        // WebGPU Benchmark
        console.log(`Running WebGPU...`);
        const gpuStart = Date.now();
        const gpuNonce = await webgpuPow.getProofOfWork(test.hash, test.threshold);
        const gpuEnd = Date.now();
        const gpuTime = (gpuEnd - gpuStart) / 1000;
        const gpuValid = verifyPoW(gpuNonce, test.hash, test.threshold);
        console.log(`WebGPU Nonce: ${gpuNonce} (Valid: ${gpuValid})`);

        results.push({
            test: test.name,
            wasm: { time: wasmTime, valid: wasmValid },
            gpu: { time: gpuTime, valid: gpuValid },
            speedup: wasmTime / gpuTime
        });
    }

    console.log("\nSummary Results:");
    console.table(results.map(r => ({
        "Test": r.test,
        "WASM Time (s)": r.wasm.time.toFixed(3),
        "WASM Valid": r.wasm.valid ? "✅" : "❌",
        "WebGPU Time (s)": r.gpu.time.toFixed(3),
        "WebGPU Valid": r.gpu.valid ? "✅" : "❌",
        "Speedup": r.speedup.toFixed(1) + "x"
    })));
}

runBenchmark().catch(console.error);
