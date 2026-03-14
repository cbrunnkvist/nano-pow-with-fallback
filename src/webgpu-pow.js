let gpu = null;

async function getGpu() {
    if (gpu) return gpu;

    if (typeof navigator !== 'undefined' && navigator.gpu) {
        gpu = navigator.gpu;
    } else {
        try {
            const { Gpu, GPUShaderStage, GPUBufferUsage, GPUMapMode } = await import('@sylphx/webgpu');
            gpu = Gpu();
            // Assign globals if they are not already present (for Node.js)
            globalThis.GPUShaderStage = GPUShaderStage || {
                VERTEX: 0x1,
                FRAGMENT: 0x2,
                COMPUTE: 0x4,
            };
            globalThis.GPUBufferUsage = GPUBufferUsage || {
                MAP_READ: 0x0001,
                MAP_WRITE: 0x0002,
                COPY_SRC: 0x0004,
                COPY_DST: 0x0008,
                INDEX: 0x0010,
                VERTEX: 0x0020,
                UNIFORM: 0x0040,
                STORAGE: 0x0080,
                INDIRECT: 0x0100,
                QUERY_RESOLVE: 0x0200,
            };
            globalThis.GPUMapMode = GPUMapMode || {
                READ: 0x0001,
                WRITE: 0x0002,
            };
        } catch (e) {
            console.error("Failed to load @sylphx/webgpu:", e);
            throw new Error("WebGPU not supported in this environment");
        }
    }
    return gpu;
}

function hexToUint32Array(hex) {
    if (hex.length % 8 !== 0) throw new Error("Hex string must be multiple of 8");
    const arr = new Uint32Array(hex.length / 8);
    for (let i = 0; i < arr.length; i++) {
        const part = hex.substr(i * 8, 8);
        const val = parseInt(part, 16);
        arr[i] = val; 
    }
    return arr;
}

function hexToUint32ArrayLE(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const view = new DataView(bytes.buffer);
    const arr = new Uint32Array(bytes.length / 4);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = view.getUint32(i * 4, true); // little-endian
    }
    return arr;
}

export class WebGPUPow {
    constructor() {
        this.device = null;
        this.pipeline = null;
        this.shaderCode = null;
    }

    async init() {
        const gpuInstance = await getGpu();
        const adapter = await gpuInstance.requestAdapter();
        if (!adapter) throw new Error("No GPU adapter found");
        this.device = await adapter.requestDevice();

        if (typeof window !== 'undefined') {
            const response = await fetch('./src/pow.wgsl');
            this.shaderCode = await response.text();
        } else {
            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const dirname = path.dirname(fileURLToPath(import.meta.url));
            const shaderPath = path.join(dirname, 'pow.wgsl');
            this.shaderCode = fs.readFileSync(shaderPath, 'utf8');
        }

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            ],
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        this.pipeline = this.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: this.device.createShaderModule({
                    code: this.shaderCode,
                }),
                entryPoint: 'main',
            },
        });
    }

    async getProofOfWork(hashHex, thresholdHex) {
        if (!this.device) await this.init();

        // Convert hash: "BD9F73..." (big-endian hex) to 4 x vec2<u32> (little-endian)
        // Wait, WGSL m[0] = nonce (8 bytes). 
        // Nano nonce is 8 bytes, usually treated as little-endian uint64.
        // Block hash is 32 bytes.
        
        // Convert hash: "BD9F73..." (big-endian hex) to 4 x vec2<u32>
        // We want the bytes in the shader to match the big-endian hex order.
        // In WGSL: hash[0].xy is the first 8 bytes.
        // If hash[0].x is the first 4 bytes, its bytes in memory will be LE.
        // Wait, to keep it simple, let's just use big-endian getUint32 
        // and let the shader handle the bytes.

        const hashBytes = new Uint8Array(hashHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const hashU32 = new Uint32Array(8);
        const hashView = new DataView(hashBytes.buffer);
        for (let i = 0; i < 8; i++) {
            // If we use LE here, the bytes in memory will be in the same order as in hashBytes.
            // i.e. [B0, B1, B2, B3]
            hashU32[i] = hashView.getUint32(i * 4, true); 
        }

        // Threshold: "fffffe0000000000" (BE)
        // High bits: "fffffe00", Low bits: "00000000"
        const thresholdHigh = parseInt(thresholdHex.substr(0, 8), 16);
        const thresholdLow = parseInt(thresholdHex.substr(8, 8), 16);
        const thresholdU32 = new Uint32Array([thresholdLow, thresholdHigh]);


        // Result buffer
        const resultBuffer = this.device.createBuffer({
            size: 16, // found (4) + padding(4) + nonce (8)
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        // Input buffer (Uniform)
        // struct Input { hash: [4]vec2<u32>, threshold: vec2<u32>, base_nonce: vec2<u32> }
        // size: 32 + 8 + 8 = 48 bytes. Uniforms must be aligned to 16 bytes? 
        // 48 is multiple of 16.
        const inputBuffer = this.device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(inputBuffer, 0, hashU32);
        this.device.queue.writeBuffer(inputBuffer, 32, thresholdU32);

        const sigmaU32 = new Uint32Array([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
            11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
            7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
            9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
            2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
            12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
            13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
            6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
            10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3
        ]);

        const sigmaBuffer = this.device.createBuffer({
            size: sigmaU32.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(sigmaBuffer, 0, sigmaU32);

        const bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: resultBuffer } },
                { binding: 1, resource: { buffer: inputBuffer } },
                { binding: 2, resource: { buffer: sigmaBuffer } },
            ],
        });

        let baseNonceLow = Math.floor(Math.random() * 0xFFFFFFFF);
        let baseNonceHigh = Math.floor(Math.random() * 0xFFFFFFFF);

        const workgroupSize = 64;
        const totalThreads = 1024 * 1024; // 1M nonces per dispatch
        const workgroupCount = totalThreads / workgroupSize;

        while (true) {
            // Reset result buffer
            this.device.queue.writeBuffer(resultBuffer, 0, new Uint32Array([0, 0, 0, 0]));
            
            // Update base nonce
            this.device.queue.writeBuffer(inputBuffer, 40, new Uint32Array([baseNonceLow, baseNonceHigh]));

            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(this.pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.dispatchWorkgroups(workgroupCount);
            passEncoder.end();

            const stagingBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });

            commandEncoder.copyBufferToBuffer(resultBuffer, 0, stagingBuffer, 0, 16);
            this.device.queue.submit([commandEncoder.finish()]);

            await stagingBuffer.mapAsync(GPUMapMode.READ);
            const arrayBuffer = stagingBuffer.getMappedRange();
            const resultArray = new Uint32Array(arrayBuffer);
            
            if (resultArray[0] !== 0) {
                // Found!
                const nonceLow = resultArray[2];
                const nonceHigh = resultArray[3];
                stagingBuffer.unmap();
                
                // Return as hex string (BE, 16 chars)
                const h = nonceHigh.toString(16).padStart(8, '0');
                const l = nonceLow.toString(16).padStart(8, '0');
                // Wait, Nano PoW usually returns the nonce such that when hashed it meets the threshold.
                // In nano-pow.cpp: sprintf(workAsChar, "%016llx", work);
                // %016llx is big-endian hex representation of the 64-bit uint.
                return h + l;
            }

            stagingBuffer.unmap();
            
            // Increment base nonce for next batch
            baseNonceLow += totalThreads;
            if (baseNonceLow > 0xFFFFFFFF) {
                baseNonceLow -= 0x100000000;
                baseNonceHigh++;
            }
        }
    }
}
