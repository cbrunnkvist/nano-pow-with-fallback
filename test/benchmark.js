import blake from 'blakejs';
import { WebGPUPow } from '../src/webgpu-pow.js';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load WASM Module using the Node-optimized wrapper
const wasmModulePath = path.join(__dirname, '../nano-pow/nano-pow-node.cjs');
const Module = require(wasmModulePath);

// Configuration
const NUM_RUNS = 5; // Multiple runs for statistical significance

// Threshold difficulty info (expected iterations on average)
const THRESHOLD_INFO = {
    "fffffe0000000000": { name: "Open/Receive", expectedIterations: 1_048_576 },    // ~1M
    "fffffff800000000": { name: "Send/Change", expectedIterations: 8_388_608 }       // ~8M
};

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

    return outputBigInt > thresholdBigInt;
}

function formatNumber(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
}

function formatHashRate(hashesPerSec) {
    if (hashesPerSec >= 1_000_000) return (hashesPerSec / 1_000_000).toFixed(2) + ' MH/s';
    if (hashesPerSec >= 1_000) return (hashesPerSec / 1_000).toFixed(1) + ' KH/s';
    return hashesPerSec.toFixed(0) + ' H/s';
}

async function runWasmBenchmark(wasmGetPoW, hash, threshold) {
    const WASM_ITERATIONS_PER_CALL = 5_000_000;
    let iterations = 0;
    let calls = 0;
    
    const startTime = Date.now();
    let nonce = "0000000000000000";
    
    while (nonce === "0000000000000000") {
        nonce = wasmGetPoW(hash, threshold);
        calls++;
        iterations += WASM_ITERATIONS_PER_CALL;
    }
    
    const endTime = Date.now();
    const timeMs = endTime - startTime;
    
    return {
        nonce,
        iterations,
        timeMs,
        hashRate: (iterations / timeMs) * 1000,
        valid: verifyPoW(nonce, hash, threshold)
    };
}

async function runGpuBenchmark(webgpuPow, hash, threshold) {
    const GPU_ITERATIONS_PER_BATCH = 1_048_576; // 1M per dispatch
    let iterations = 0;
    
    const startTime = Date.now();
    
    // We need to replicate the GPU logic with batch counting
    const device = webgpuPow.device;
    const pipeline = webgpuPow.pipeline;
    
    const nonce = await new Promise((resolve, reject) => {
        (async () => {
            const hashBytes = new Uint8Array(hash.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const hashU32 = new Uint32Array(8);
            const hashView = new DataView(hashBytes.buffer);
            for (let i = 0; i < 8; i++) {
                hashU32[i] = hashView.getUint32(i * 4, true);
            }
            
            const thresholdHigh = parseInt(threshold.substr(0, 8), 16);
            const thresholdLow = parseInt(threshold.substr(8, 8), 16);
            const thresholdU32 = new Uint32Array([thresholdLow, thresholdHigh]);
            
            const resultBuffer = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });
            
            const inputBuffer = device.createBuffer({
                size: 48,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            
            device.queue.writeBuffer(inputBuffer, 0, hashU32);
            device.queue.writeBuffer(inputBuffer, 32, thresholdU32);
            
            const sigmaU32 = new Uint32Array([
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
                11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
                7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
                9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
                2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
                12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
                13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
                6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
                10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3
            ]);
            
            const sigmaBuffer = device.createBuffer({
                size: sigmaU32.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            device.queue.writeBuffer(sigmaBuffer, 0, sigmaU32);
            
            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: resultBuffer } },
                    { binding: 1, resource: { buffer: inputBuffer } },
                    { binding: 2, resource: { buffer: sigmaBuffer } },
                ],
            });
            
            let baseNonceLow = Math.floor(Math.random() * 0xFFFFFFFF);
            let baseNonceHigh = Math.floor(Math.random() * 0xFFFFFFFF);
            
            const workgroupSize = 64;
            const totalThreads = 1024 * 1024;
            const workgroupCount = totalThreads / workgroupSize;
            
            while (true) {
                iterations += GPU_ITERATIONS_PER_BATCH;
                
                device.queue.writeBuffer(resultBuffer, 0, new Uint32Array([0, 0, 0, 0]));
                device.queue.writeBuffer(inputBuffer, 40, new Uint32Array([baseNonceLow, baseNonceHigh]));
                
                const commandEncoder = device.createCommandEncoder();
                const passEncoder = commandEncoder.beginComputePass();
                passEncoder.setPipeline(pipeline);
                passEncoder.setBindGroup(0, bindGroup);
                passEncoder.dispatchWorkgroups(workgroupCount);
                passEncoder.end();
                
                const stagingBuffer = device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                });
                
                commandEncoder.copyBufferToBuffer(resultBuffer, 0, stagingBuffer, 0, 16);
                device.queue.submit([commandEncoder.finish()]);
                
                await stagingBuffer.mapAsync('READ');
                const arrayBuffer = stagingBuffer.getMappedRange();
                const resultArray = new Uint32Array(arrayBuffer);
                
                if (resultArray[0] !== 0) {
                    const nonceLow = resultArray[2];
                    const nonceHigh = resultArray[3];
                    stagingBuffer.unmap();
                    
                    const h = nonceHigh.toString(16).padStart(8, '0');
                    const l = nonceLow.toString(16).padStart(8, '0');
                    resolve(h + l);
                    return;
                }
                
                stagingBuffer.unmap();
                
                baseNonceLow += totalThreads;
                if (baseNonceLow > 0xFFFFFFFF) {
                    baseNonceLow -= 0x100000000;
                    baseNonceHigh++;
                }
            }
        })().catch(reject);
    });
    
    const endTime = Date.now();
    const timeMs = endTime - startTime;
    
    return {
        nonce,
        iterations,
        timeMs,
        hashRate: (iterations / timeMs) * 1000,
        valid: verifyPoW(nonce, hash, threshold)
    };
}

async function runBenchmark() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("                    Nano PoW Benchmark");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`Runs per test: ${NUM_RUNS} (work generation is random, multiple runs needed)`);
    console.log();
    
    // Wait for WASM
    if (!global.Module.ready) {
        process.stdout.write("Initializing WASM...");
        await new Promise(resolve => {
            const check = () => {
                if (global.Module.ready) resolve();
                else setTimeout(check, 10);
            };
            check();
        });
        console.log(" ✓");
    }

    const wasmGetPoW = (hash, threshold) => global.Module.ccall("getProofOfWork", "string", ["string", "string"], [hash, threshold]);

    // Initialize WebGPU
    process.stdout.write("Initializing WebGPU...");
    const webgpuPow = new WebGPUPow();
    await webgpuPow.init();
    console.log(" ✓");
    console.log();

    const testCases = [
        { threshold: "fffffe0000000000", hash: "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000" },
        { threshold: "fffffff800000000", hash: "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000" }
    ];

    const allResults = [];

    for (const test of testCases) {
        const info = THRESHOLD_INFO[test.threshold];
        console.log("───────────────────────────────────────────────────────────────");
        console.log(`Threshold: ${test.threshold}`);
        console.log(`Type: ${info.name}`);
        console.log(`Expected difficulty: ~${formatNumber(info.expectedIterations)} hashes`);
        console.log();

        const wasmResults = [];
        const gpuResults = [];

        // Run WASM benchmarks
        console.log(`  WASM (Single-threaded) - ${NUM_RUNS} runs:`);
        for (let i = 0; i < NUM_RUNS; i++) {
            process.stdout.write(`    Run ${i + 1}/${NUM_RUNS}...`);
            const result = await runWasmBenchmark(wasmGetPoW, test.hash, test.threshold);
            wasmResults.push(result);
            console.log(` ${formatHashRate(result.hashRate)} (${(result.timeMs/1000).toFixed(2)}s, ${formatNumber(result.iterations)} hashes) ${result.valid ? '✓' : '✗'}`);
        }

        // Run WebGPU benchmarks  
        console.log();
        console.log(`  WebGPU - ${NUM_RUNS} runs:`);
        for (let i = 0; i < NUM_RUNS; i++) {
            process.stdout.write(`    Run ${i + 1}/${NUM_RUNS}...`);
            const result = await runGpuBenchmark(webgpuPow, test.hash, test.threshold);
            gpuResults.push(result);
            console.log(` ${formatHashRate(result.hashRate)} (${(result.timeMs/1000).toFixed(2)}s, ${formatNumber(result.iterations)} hashes) ${result.valid ? '✓' : '✗'}`);
        }

        // Calculate statistics
        const wasmStats = {
            avgHashRate: wasmResults.reduce((s, r) => s + r.hashRate, 0) / wasmResults.length,
            minHashRate: Math.min(...wasmResults.map(r => r.hashRate)),
            maxHashRate: Math.max(...wasmResults.map(r => r.hashRate)),
            avgTime: wasmResults.reduce((s, r) => s + r.timeMs, 0) / wasmResults.length,
            avgIterations: wasmResults.reduce((s, r) => s + r.iterations, 0) / wasmResults.length,
            allValid: wasmResults.every(r => r.valid)
        };

        const gpuStats = {
            avgHashRate: gpuResults.reduce((s, r) => s + r.hashRate, 0) / gpuResults.length,
            minHashRate: Math.min(...gpuResults.map(r => r.hashRate)),
            maxHashRate: Math.max(...gpuResults.map(r => r.hashRate)),
            avgTime: gpuResults.reduce((s, r) => s + r.timeMs, 0) / gpuResults.length,
            avgIterations: gpuResults.reduce((s, r) => s + r.iterations, 0) / gpuResults.length,
            allValid: gpuResults.every(r => r.valid)
        };

        allResults.push({
            threshold: test.threshold,
            type: info.name,
            expectedDifficulty: info.expectedIterations,
            wasm: wasmStats,
            gpu: gpuStats,
            speedup: gpuStats.avgHashRate / wasmStats.avgHashRate
        });

        console.log();
    }

    // Summary table
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("                        SUMMARY RESULTS");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log();
    
    const tableData = allResults.map(r => ({
        "Threshold": r.threshold,
        "Type": r.type,
        "Difficulty": "~" + formatNumber(r.expectedDifficulty),
        "WASM Avg": formatHashRate(r.wasm.avgHashRate),
        "WASM Range": `${formatHashRate(r.wasm.minHashRate)} - ${formatHashRate(r.wasm.maxHashRate)}`,
        "WebGPU Avg": formatHashRate(r.gpu.avgHashRate),
        "WebGPU Range": `${formatHashRate(r.gpu.minHashRate)} - ${formatHashRate(r.gpu.maxHashRate)}`,
        "Speedup": r.speedup.toFixed(1) + "x"
    }));
    
    console.table(tableData);
    
    console.log();
    console.log("Notes:");
    console.log("  - Hash rate = hashes computed per second");
    console.log("  - Higher hash rate = better performance");
    console.log("  - Difficulty = expected hashes needed (random, actual varies)");
    console.log("  - WASM iterations counted as calls × 5M (batch size)");
    console.log("  - WebGPU iterations counted as batches × 1M (dispatch size)");
}

runBenchmark().catch(console.error);
