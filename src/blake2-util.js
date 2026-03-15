const ERROR_MSG_INPUT = 'Input must be a string or Uint8Array';

export function normalizeInput(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    const encoder = new TextEncoder();
    return encoder.encode(input);
  }
  throw new Error(ERROR_MSG_INPUT);
}

export function toHex(bytes) {
  return Array.prototype.map
    .call(bytes, (n) => (n < 16 ? '0' : '') + n.toString(16))
    .join('');
}

