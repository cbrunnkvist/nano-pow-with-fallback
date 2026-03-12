import { WebGPUPow } from './webgpu-pow.js';

let webgpuPow = null;

export const THRESHOLD__SEND_CHANGE = "fffffff800000000";
export const THRESHOLD__OPEN_RECEIVE = "fffffe0000000000";

export async function getProofOfWork({ hash, threshold }) {
    // Try WebGPU first
    try {
        if (!webgpuPow) {
            webgpuPow = new WebGPUPow();
            await webgpuPow.init();
        }
        return await webgpuPow.getProofOfWork(hash, threshold);
    } catch (e) {
        console.warn("WebGPU failed, falling back to WASM/multi-threading", e);
        // Fallback to existing logic if in browser, or throw if in Node without WASM support
        if (typeof NanoPow !== 'undefined' && NanoPow.getProofOfWorkMultiThreaded) {
            return await NanoPow.getProofOfWorkMultiThreaded({ hash, threshold });
        }
        throw e;
    }
}

export { WebGPUPow };
