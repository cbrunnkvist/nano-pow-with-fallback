import { WebGPUPow } from './webgpu-pow.js';
import { WebGLPow, getWebGLPow } from './webgl-pow.js';

let webgpuPow = null;
let webglPow = null;

export const THRESHOLD__SEND_CHANGE = "fffffff800000000";
export const THRESHOLD__OPEN_RECEIVE = "fffffe0000000000";

function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export async function getProofOfWork({ hash, threshold }) {
    // Try WebGPU first
    try {
        if (!webgpuPow) {
            webgpuPow = new WebGPUPow();
            await webgpuPow.init();
        }
        return await webgpuPow.getProofOfWork(hash, threshold);
    } catch (e) {
        console.warn("WebGPU failed, trying WebGL", e);
        
        // Try WebGL (only in browser)
        if (isBrowser()) {
            try {
                if (!webglPow) {
                    webglPow = getWebGLPow();
                    await webglPow.init();
                }
                return await webglPow.getProofOfWork(hash, threshold);
            } catch (webglErr) {
                console.warn("WebGL failed, falling back to WASM", webglErr);
            }
        }
        
        // Fallback to WASM
        if (typeof NanoPow !== 'undefined' && NanoPow.getProofOfWorkMultiThreaded) {
            return await NanoPow.getProofOfWorkMultiThreaded({ hash, threshold });
        }
        throw e;
    }
}

export { WebGPUPow, WebGLPow };
