import { blake2b } from './blake2b.js';

function hexToBytes(hex) {
  if (!hex) return new Uint8Array(0);
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

export function validateWork({ blockHash, work, threshold = 'fffffe0000000000' }) {
  if (typeof blockHash !== 'string' || blockHash.length !== 64) {
    throw new Error('blockHash must be a 64-character hex string');
  }
  if (typeof work !== 'string' || work.length !== 16) {
    throw new Error('work must be a 16-character hex string');
  }
  if (typeof threshold !== 'string' || threshold.length !== 16) {
    throw new Error('threshold must be a 16-character hex string');
  }

  if (work === '0000000000000000') return false;

  const nonceBytes = hexToBytes(work).reverse(); // LE
  const hashBytes = hexToBytes(blockHash);
  if (nonceBytes.length !== 8 || hashBytes.length !== 32) return false;

  const input = new Uint8Array(40);
  input.set(nonceBytes, 0);
  input.set(hashBytes, 8);

  const digest = blake2b(input, null, 8);
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const outputBigInt = BigInt(view.getUint32(0, true)) + (BigInt(view.getUint32(4, true)) << 32n);
  const thresholdBigInt = BigInt('0x' + threshold);

  return outputBigInt > thresholdBigInt;
}

