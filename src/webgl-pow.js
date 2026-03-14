/**
 * WebGL2-based PoW implementation wrapping nano-webgl-pow
 * Provides Promise-based API consistent with WebGPUPow
 */

let webglPowInstance = null;

function hexReverse(hex) {
    let out = '';
    for (let i = hex.length; i > 0; i -= 2) {
        out += hex.slice(i - 2, i);
    }
    return out;
}

function arrayHex(arr, index, length) {
    let out = '';
    for (let i = length - 1; i > -1; i--) {
        out += (arr[i] > 15 ? '' : '0') + arr[i].toString(16);
    }
    return out;
}

function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export class WebGLPow {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.width = 512;
        this.height = 512;
        this.iterations = 0;
        this._isInitialized = false;
    }

    async init() {
        if (this._isInitialized) return;

        if (!isBrowser()) {
            throw new Error('webgl2_required: Browser environment required for WebGL');
        }

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.gl = this.canvas.getContext('webgl2');

        if (!this.gl) {
            throw new Error('webgl2_required: WebGL2 is not available in this browser');
        }

        this._isInitialized = true;
    }

    getIterations() {
        return this.iterations;
    }

    /**
     * Calculate proof of work using WebGL2 fragment shader
     * @param {string} hashHex - Previous block hash as 64-char hex string
     * @param {string} thresholdHex - Work difficulty threshold as 16-char hex string
     * @returns {Promise<string>} - 16-char hex string representing the work nonce
     */
    async getProofOfWork(hashHex, thresholdHex) {
        if (!this._isInitialized) {
            await this.init();
        }

        if (!this.gl || this.gl.isContextLost()) {
            throw new Error('webgl2_context_lost: WebGL context is unavailable');
        }

        // Reset iterations counter
        this.iterations = 0;

        const thresholdHigh = parseInt(thresholdHex.slice(0, 8), 16);
        const thresholdLow = parseInt(thresholdHex.slice(8, 16), 16);

        return new Promise((resolve, reject) => {
            const gl = this.gl;
            const canvas = this.canvas;

            // Clear
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);

            const reverseHex = hexReverse(hashHex);

            // Vertex Shader
            const vsSource = `#version 300 es
                precision highp float;
                layout (location=0) in vec4 position;
                layout (location=1) in vec2 uv;

                out vec2 uv_pos;

                void main() {
                    uv_pos = uv;
                    gl_Position = position;
                }`;

            // Fragment Shader with embedded hash and threshold
            const fsSource = `#version 300 es
                precision highp float;
                precision highp int;

                in vec2 uv_pos;
                out vec4 fragColor;

                uniform uvec4 u_work0;
                uniform uvec4 u_work1;

                #define BLAKE2B_IV32_0 0xF2BDC900u
                #define BLAKE2B_IV32_1 0x6A09E667u

                uint v[32] = uint[32](
                    0xF2BDC900u, 0x6A09E667u, 0x84CAA73Bu, 0xBB67AE85u,
                    0xFE94F82Bu, 0x3C6EF372u, 0x5F1D36F1u, 0xA54FF53Au,
                    0xADE682D1u, 0x510E527Fu, 0x2B3E6C1Fu, 0x9B05688Cu,
                    0xFB41BD6Bu, 0x1F83D9ABu, 0x137E2179u, 0x5BE0CD19u,
                    0xF3BCC908u, 0x6A09E667u, 0x84CAA73Bu, 0xBB67AE85u,
                    0xFE94F82Bu, 0x3C6EF372u, 0x5F1D36F1u, 0xA54FF53Au,
                    0xADE682F9u, 0x510E527Fu, 0x2B3E6C1Fu, 0x9B05688Cu,
                    0x04BE4294u, 0xE07C2654u, 0x137E2179u, 0x5BE0CD19u
                );

                uint m[32];

                const int SIGMA82[192] = int[192](
                    0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,28,20,8,16,18,30,26,12,2,24,
                    0,4,22,14,10,6,22,16,24,0,10,4,30,26,20,28,6,12,14,2,18,8,14,18,6,2,26,
                    24,22,28,4,12,10,20,8,0,30,16,18,0,10,14,4,8,20,30,28,2,22,24,12,16,6,
                    26,4,24,12,20,0,22,16,6,8,26,14,10,30,28,2,18,24,10,2,30,28,26,8,20,0,
                    14,12,6,18,4,16,22,26,22,14,28,24,2,6,18,10,0,30,8,16,12,4,20,12,30,28,
                    18,22,6,0,16,24,4,26,14,2,8,20,10,20,4,16,8,14,12,2,10,30,22,18,28,6,24,
                    26,0,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,28,20,8,16,18,30,26,12,
                    2,24,0,4,22,14,10,6
                );

                void add_uint64 (int a, uint b0, uint b1) {
                    uint o0 = v[a] + b0;
                    uint o1 = v[a + 1] + b1;
                    if (v[a] > 0xFFFFFFFFu - b0) {
                        o1++;
                    }
                    v[a] = o0;
                    v[a + 1] = o1;
                }

                void add_uint64 (int a, int b) {
                    add_uint64(a, v[b], v[b + 1]);
                }

                void B2B_G (int a, int b, int c, int d, int ix, int iy) {
                    add_uint64(a, b);
                    add_uint64(a, m[ix], m[ix + 1]);

                    uint xor0 = v[d] ^ v[a];
                    uint xor1 = v[d + 1] ^ v[a + 1];
                    v[d] = xor1;
                    v[d + 1] = xor0;

                    add_uint64(c, d);

                    xor0 = v[b] ^ v[c];
                    xor1 = v[b + 1] ^ v[c + 1];
                    v[b] = (xor0 >> 24) ^ (xor1 << 8);
                    v[b + 1] = (xor1 >> 24) ^ (xor0 << 8);

                    add_uint64(a, b);
                    add_uint64(a, m[iy], m[iy + 1]);

                    xor0 = v[d] ^ v[a];
                    xor1 = v[d + 1] ^ v[a + 1];
                    v[d] = (xor0 >> 16) ^ (xor1 << 16);
                    v[d + 1] = (xor1 >> 16) ^ (xor0 << 16);

                    add_uint64(c, d);

                    xor0 = v[b] ^ v[c];
                    xor1 = v[b + 1] ^ v[c + 1];
                    v[b] = (xor1 >> 31) ^ (xor0 << 1);
                    v[b + 1] = (xor0 >> 31) ^ (xor1 << 1);
                }

                void main() {
                    int i;
                    uint uv_x = uint(uv_pos.x * ${canvas.width - 1}.);
                    uint uv_y = uint(uv_pos.y * ${canvas.height - 1}.);
                    uint x_pos = uv_x % 256u;
                    uint y_pos = uv_y % 256u;
                    uint x_index = (uv_x - x_pos) / 256u;
                    uint y_index = (uv_y - y_pos) / 256u;

                    m[0] = (x_pos ^ (y_pos << 8) ^ ((u_work0.b ^ x_index) << 16) ^ ((u_work0.a ^ y_index) << 24));
                    m[1] = (u_work1.r ^ (u_work1.g << 8) ^ (u_work1.b << 16) ^ (u_work1.a << 24));

                    m[2] = 0x${reverseHex.slice(56,64)}u;
                    m[3] = 0x${reverseHex.slice(48,56)}u;
                    m[4] = 0x${reverseHex.slice(40,48)}u;
                    m[5] = 0x${reverseHex.slice(32,40)}u;
                    m[6] = 0x${reverseHex.slice(24,32)}u;
                    m[7] = 0x${reverseHex.slice(16,24)}u;
                    m[8] = 0x${reverseHex.slice(8,16)}u;
                    m[9] = 0x${reverseHex.slice(0,8)}u;

                    for(i=0;i<12;i++) {
                        B2B_G(0, 8, 16, 24, SIGMA82[i * 16 + 0], SIGMA82[i * 16 + 1]);
                        B2B_G(2, 10, 18, 26, SIGMA82[i * 16 + 2], SIGMA82[i * 16 + 3]);
                        B2B_G(4, 12, 20, 28, SIGMA82[i * 16 + 4], SIGMA82[i * 16 + 5]);
                        B2B_G(6, 14, 22, 30, SIGMA82[i * 16 + 6], SIGMA82[i * 16 + 7]);
                        B2B_G(0, 10, 20, 30, SIGMA82[i * 16 + 8], SIGMA82[i * 16 + 9]);
                        B2B_G(2, 12, 22, 24, SIGMA82[i * 16 + 10], SIGMA82[i * 16 + 11]);
                        B2B_G(4, 14, 16, 26, SIGMA82[i * 16 + 12], SIGMA82[i * 16 + 13]);
                        B2B_G(6, 8, 18, 28, SIGMA82[i * 16 + 14], SIGMA82[i * 16 + 15]);
                    }

                    uint h_high = BLAKE2B_IV32_1 ^ v[1] ^ v[17];
                    uint h_low = BLAKE2B_IV32_0 ^ v[0] ^ v[16];

                    if(h_high > ${thresholdHigh}u || (h_high == ${thresholdHigh}u && h_low > ${thresholdLow}u)) {
                        fragColor = vec4(
                            float(x_index + 1u)/255.,
                            float(y_index + 1u)/255.,
                            float(x_pos)/255.,
                            float(y_pos)/255.
                        );
                    }
                }`;

            // Compile shaders
            const vertexShader = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vertexShader, vsSource);
            gl.compileShader(vertexShader);

            if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                reject(new Error('WebGL vertex shader error: ' + gl.getShaderInfoLog(vertexShader)));
                return;
            }

            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fragmentShader, fsSource);
            gl.compileShader(fragmentShader);

            if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                reject(new Error('WebGL fragment shader error: ' + gl.getShaderInfoLog(fragmentShader)));
                return;
            }

            // Create program
            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                reject(new Error('WebGL program link error: ' + gl.getProgramInfoLog(program)));
                return;
            }

            gl.useProgram(program);

            // Geometry
            const triangleArray = gl.createVertexArray();
            gl.bindVertexArray(triangleArray);

            const positions = new Float32Array([
                -1, -1, 0, -1, 1, 0, 1, 1, 0,
                1, -1, 0, 1, 1, 0, -1, -1, 0
            ]);
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(0);

            const uvPosArray = new Float32Array([
                1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1
            ]);
            const uvBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, uvPosArray, gl.STATIC_DRAW);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(1);

            const work0Location = gl.getUniformLocation(program, 'u_work0');
            const work1Location = gl.getUniformLocation(program, 'u_work1');

            // Generate work using requestAnimationFrame
            const work0 = new Uint8Array(4);
            const work1 = new Uint8Array(4);
            let frameCount = 0;

            const draw = () => {
                frameCount++;
                this.iterations = frameCount * this.width * this.height;

                window.crypto.getRandomValues(work0);
                window.crypto.getRandomValues(work1);

                gl.uniform4uiv(work0Location, Array.from(work0));
                gl.uniform4uiv(work1Location, Array.from(work1));

                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLES, 0, 6);

                const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                // Check pixels for success
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] !== 0) {
                        const result = arrayHex(work1, 0, 4) + arrayHex([
                            pixels[i + 2],
                            pixels[i + 3],
                            work0[2] ^ (pixels[i] - 1),
                            work0[3] ^ (pixels[i + 1] - 1)
                        ], 0, 4);
                        resolve(result);
                        return;
                    }
                }

                // Continue searching
                window.requestAnimationFrame(draw);
            };

            window.requestAnimationFrame(draw);
        });
    }
}

export function getWebGLPow() {
    if (!webglPowInstance) {
        webglPowInstance = new WebGLPow();
    }
    return webglPowInstance;
}
