import { PowService, PowBackendName } from './pow-service.js';

export const THRESHOLD__SEND_CHANGE = "fffffff800000000";
export const THRESHOLD__OPEN_RECEIVE = "fffffe0000000000";

const defaultPowService = new PowService();

export async function getProofOfWork({ hash, threshold }) {
  const { proofOfWork } = await defaultPowService.getProofOfWork({ hash, threshold });
  return proofOfWork;
}

export function getPowService() {
  return defaultPowService;
}

export { WebGPUPow } from './webgpu-pow.js';
export { WebGLPow } from './webgl-pow.js';
export { PowService, PowBackendName };
