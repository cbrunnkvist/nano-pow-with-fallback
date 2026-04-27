import { PowService, PowBackendName, PowServiceAbortError, DEFAULT_BACKEND_ORDER } from './pow-service.js';
import { validateWork } from './validate-work.js';

export const THRESHOLD__SEND_CHANGE = "fffffff800000000";
export const THRESHOLD__OPEN_RECEIVE = "fffffe0000000000";

const defaultPowService = new PowService();

export async function getProofOfWork({ hash, threshold }) {
  const { proofOfWork } = await defaultPowService.getProofOfWork({ hash, threshold });

  // PowService._normalizeResult already asserts non-zero; this is a belt-and-suspenders guard.
  if (!proofOfWork || proofOfWork === '0000000000000000') {
    throw new Error('Invalid proof of work: received zero nonce');
  }

  const isValid = validateWork({ blockHash: hash, work: proofOfWork, threshold });
  if (!isValid) {
    throw new Error('Invalid proof of work: nonce ' + proofOfWork + ' does not meet threshold ' + threshold);
  }

  return proofOfWork;
}

export function getPowService() {
  return defaultPowService;
}

export { WebGPUPow } from './webgpu-pow.js';
export { WebGLPow } from './webgl-pow.js';
export { PowService, PowBackendName, PowServiceAbortError, DEFAULT_BACKEND_ORDER };
