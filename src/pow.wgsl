
struct Result {
    found: u32,
    nonce: vec2<u32>,
};

struct Input {
    hash: array<vec4<u32>, 2>, // 32 bytes (aligned to 16)
    threshold: vec2<u32>,      // 8 bytes
    base_nonce: vec2<u32>,     // 8 bytes
};

@group(0) @binding(0) var<storage, read_write> result: Result;
@group(0) @binding(1) var<uniform> input_data: Input;
@group(0) @binding(2) var<storage, read> sigma: array<u32, 192>;

const IV: array<vec2<u32>, 8> = array<vec2<u32>, 8>(
    vec2<u32>(0xf3bcc908u, 0x6a09e667u),
    vec2<u32>(0x84caa73bu, 0xbb67ae85u),
    vec2<u32>(0xfe94f82bu, 0x3c6ef372u),
    vec2<u32>(0x5f1d36f1u, 0xa54ff53au),
    vec2<u32>(0xade682d1u, 0x510e527fu),
    vec2<u32>(0x2b3e6c1fu, 0x9b05688cu),
    vec2<u32>(0xfb41bd6bu, 0x1f83d9abu),
    vec2<u32>(0x137e2179u, 0x5be0cd19u)
);

fn add64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
    let low = a.x + b.x;
    let carry = u32(low < a.x);
    let high = a.y + b.y + carry;
    return vec2<u32>(low, high);
}

fn xor64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
    return vec2<u32>(a.x ^ b.x, a.y ^ b.y);
}

fn rotr64(a: vec2<u32>, n: u32) -> vec2<u32> {
    if (n == 32u) {
        return vec2<u32>(a.y, a.x);
    }
    if (n < 32u) {
        return vec2<u32>(
            (a.x >> n) | (a.y << (32u - n)),
            (a.y >> n) | (a.x << (32u - n))
        );
    }
    let n2 = n - 32u;
    return vec2<u32>(
        (a.y >> n2) | (a.x << (32u - n2)),
        (a.x >> n2) | (a.y << (32u - n2))
    );
}

fn G(v: ptr<function, array<vec2<u32>, 16>>, a: u32, b: u32, c: u32, d: u32, x: vec2<u32>, y: vec2<u32>) {
    (*v)[a] = add64((*v)[a], add64((*v)[b], x));
    (*v)[d] = rotr64(xor64((*v)[d], (*v)[a]), 32u);
    (*v)[c] = add64((*v)[c], (*v)[d]);
    (*v)[b] = rotr64(xor64((*v)[b], (*v)[c]), 24u);
    (*v)[a] = add64((*v)[a], add64((*v)[b], y));
    (*v)[d] = rotr64(xor64((*v)[d], (*v)[a]), 16u);
    (*v)[c] = add64((*v)[c], (*v)[d]);
    (*v)[b] = rotr64(xor64((*v)[b], (*v)[c]), 63u);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (result.found != 0u) {
        return;
    }

    let thread_id = global_id.x;
    let nonce = add64(input_data.base_nonce, vec2<u32>(thread_id, 0u));

    var v: array<vec2<u32>, 16>;
    
    // Blake2b initialization for Nano (digest length 8)
    // Parameter block: P[0] = 0x01010008 (digest=8, key=0, fanout=1, depth=1)
    let p0 = vec2<u32>(0x01010008u, 0x00000000u);
    
    v[0] = xor64(IV[0], p0);
    v[1] = IV[1];
    v[2] = IV[2];
    v[3] = IV[3];
    v[4] = IV[4];
    v[5] = IV[5];
    v[6] = IV[6];
    v[7] = IV[7];
    v[8] = IV[0];
    v[9] = IV[1];
    v[10] = IV[2];
    v[11] = IV[3];
    
    // Counter t[0] = 40 (bytes updated), t[1] = 0
    v[12] = xor64(IV[4], vec2<u32>(40u, 0u));
    v[13] = IV[5];
    
    // Last block flag f[0] = 0xFFFFFFFF FFFFFFFF
    v[14] = xor64(IV[6], vec2<u32>(0xFFFFFFFFu, 0xFFFFFFFFu));
    v[15] = IV[7];

    var m: array<vec2<u32>, 16>;
    // Nano input: nonce (8 bytes) + hash (32 bytes)
    m[0] = nonce;
    m[1] = input_data.hash[0].xy;
    m[2] = input_data.hash[0].zw;
    m[3] = input_data.hash[1].xy;
    m[4] = input_data.hash[1].zw;
    // m[5..15] are 0 (already 0 by default)

    for (var r: u32 = 0u; r < 12u; r = r + 1u) {
        G(&v, 0u, 4u, 8u, 12u, m[sigma[r * 16u + 0u]], m[sigma[r * 16u + 1u]]);
        G(&v, 1u, 5u, 9u, 13u, m[sigma[r * 16u + 2u]], m[sigma[r * 16u + 3u]]);
        G(&v, 2u, 6u, 10u, 14u, m[sigma[r * 16u + 4u]], m[sigma[r * 16u + 5u]]);
        G(&v, 3u, 7u, 11u, 15u, m[sigma[r * 16u + 6u]], m[sigma[r * 16u + 7u]]);
        G(&v, 0u, 5u, 10u, 15u, m[sigma[r * 16u + 8u]], m[sigma[r * 16u + 9u]]);
        G(&v, 1u, 6u, 11u, 12u, m[sigma[r * 16u + 10u]], m[sigma[r * 16u + 11u]]);
        G(&v, 2u, 7u, 8u, 13u, m[sigma[r * 16u + 12u]], m[sigma[r * 16u + 13u]]);
        G(&v, 3u, 4u, 9u, 14u, m[sigma[r * 16u + 14u]], m[sigma[r * 16u + 15u]]);
    }

    // Final result is h[0] ^ v[0] ^ v[8]
    // Since h[0] was IV[0] ^ p0
    let res = xor64(xor64(xor64(IV[0], p0), v[0]), v[8]);
    
    // Compare res against threshold.
    // Nano PoW check: res >= threshold
    // In our case, we need to compare 64-bit values.
    if (res.y > input_data.threshold.y || (res.y == input_data.threshold.y && res.x >= input_data.threshold.x)) {
        // Found it! Use atomic exchange to avoid race conditions if possible, 
        // but since we only care if *any* thread found it, this is okay for a simple implementation.
        result.found = 1u;
        result.nonce = nonce;
    }
}
