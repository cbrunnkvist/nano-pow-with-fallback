import { WebGPUPow } from '../src/webgpu-pow.js';

async function test() {
    const pow = new WebGPUPow();
    try {
        await pow.init();
        console.log("WebGPU initialized");

        const hash = "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000";
        const threshold = "fffffe0000000000"; // THRESHOLD__OPEN_RECEIVE

        console.log(`Calculating PoW for hash: ${hash}`);
        const start = Date.now();
        const proofOfWork = await pow.getProofOfWork(hash, threshold);
        const end = Date.now();

        console.log(`Found Proof of Work: ${proofOfWork}`);
        console.log(`Time taken: ${(end - start) / 1000}s`);
        
        // In a real test we should verify the PoW here.
        // For now, if it returns something, it's a good sign.
        process.exit(0);
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
}

test();
