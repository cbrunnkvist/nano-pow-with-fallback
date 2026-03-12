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

function hexToBytes(hex) {
    if (!hex) return new Uint8Array(0);
    const matches = hex.match(/.{1,2}/g);
    if (!matches) return new Uint8Array(0);
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

function verifyPoW(nonceHex, hashHex, thresholdHex) {
    if (nonceHex === "0000000000000000") return false;
    
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

async function runTests() {
    console.log("--- Nano PoW Unit Tests ---");
    
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

    // Initialize WebGPU
    const webgpuPow = new WebGPUPow();
    try {
        await webgpuPow.init();
    } catch (e) {
        console.warn("WebGPU not supported, skipping WebGPU tests");
    }

    const testCases = [
        { 
            name: "Low Difficulty (Instant)", 
            threshold: "0000000000000000", 
            hash: "0000000000000000000000000000000000000000000000000000000000000000" 
        },
        { 
            name: "Normal - Open/Receive", 
            threshold: "fffffe0000000000", 
            hash: "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000" 
        },
        { 
            name: "Normal - Send/Change", 
            threshold: "fffffff800000000", 
            hash: "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000" 
        }
    ];

    let allPassed = true;

    for (const test of testCases) {
        console.log(`\nCase: ${test.name}`);

        // Test WASM
        let wasmNonce = wasmGetPoW(test.hash, test.threshold);
        // WASM might need multiple tries if it failed the 5M iterations
        let tries = 0;
        while (wasmNonce === "0000000000000000" && tries < 5) {
            wasmNonce = wasmGetPoW(test.hash, test.threshold);
            tries++;
        }
        const wasmPassed = verifyPoW(wasmNonce, test.hash, test.threshold);
        console.log(`  WASM:   ${wasmPassed ? "✅ PASS" : "❌ FAIL"} (Nonce: ${wasmNonce})`);
        if (!wasmPassed) allPassed = false;

        // Test WebGPU
        if (webgpuPow.device) {
            const gpuNonce = await webgpuPow.getProofOfWork(test.hash, test.threshold);
            const gpuPassed = verifyPoW(gpuNonce, test.hash, test.threshold);
            console.log(`  WebGPU: ${gpuPassed ? "✅ PASS" : "❌ FAIL"} (Nonce: ${gpuNonce})`);
            if (!gpuPassed) allPassed = false;
        }
    }

    if (allPassed) {
        console.log("\nALL TESTS PASSED ✨");
        process.exit(0);
    } else {
        console.log("\nSOME TESTS FAILED ⚠️");
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
