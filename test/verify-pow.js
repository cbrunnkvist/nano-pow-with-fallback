import blake from 'blakejs';

function hexToBytes(hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const nonceHex = "25b8086a6162b26e";
const hashHex = "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000";
const thresholdHex = "fffffe0000000000";

const nonceBytes = hexToBytes(nonceHex);
// nano-pow.cpp uses work as uint64_t, then &work as bytes.
// So on little-endian, bytes of 25b8086a6162b26e are [6e, b2, 62, 61, 6a, 08, b8, 25]
const nonceLE = new Uint8Array(nonceBytes).reverse();

const hashBytes = hexToBytes(hashHex);

const input = new Uint8Array(40);
input.set(nonceLE, 0);
input.set(hashBytes, 8);

const digest = blake.blake2b(input, null, 8);
// Nano PoW: interpret the 8-byte digest as little-endian uint64
const digestView = new DataView(digest.buffer);
const outputValue = digestView.getUint32(0, true) + (digestView.getUint32(4, true) * 0x100000000); // Wait, this is not quite right for BigInt
const outputBigInt = BigInt(digestView.getUint32(0, true)) + (BigInt(digestView.getUint32(4, true)) << 32n);

const thresholdBigInt = BigInt("0x" + thresholdHex);

console.log(`Nonce: ${nonceHex}`);
console.log(`Nonce bytes used: ${bytesToHex(nonceLE)}`);
console.log(`Digest (BE hex): ${bytesToHex(digest)}`);
console.log(`Output Value (LE): ${outputBigInt.toString(16)}`);
console.log(`Threshold:    ${thresholdBigInt.toString(16)}`);
console.log(`Is valid? ${outputBigInt >= thresholdBigInt}`);
