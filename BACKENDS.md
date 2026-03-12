# Nano PoW Backends: WASM vs. WebGPU

This project provides two distinct backends for calculating Nano Proof-of-Work. This document explains the implementation details and the theoretical differences between them.

## Implementation Overview

### WebAssembly (WASM)
The WASM backend is a port of the original C++ Blake2b implementation. 
- **Language**: C++ compiled via Emscripten.
- **Environment**: Runs on the CPU.
- **Multi-threading**: Can be scaled using Web Workers (in browsers) or Worker Threads (in Node.js).
- **Recent Fixes**: We patched a critical memory bug (uninitialized pointer) and corrected the threshold comparison logic (`>=` instead of `>`) to ensure protocol compliance.

### WebGPU
The WebGPU backend is a modern, hardware-accelerated implementation.
- **Language**: WGSL (WebGPU Shading Language).
- **Environment**: Runs on the GPU.
- **Node.js Support**: Enabled via the `@sylphx/webgpu` native binding package.
- **Architecture**: Implements a massively parallel compute shader that can test millions of nonces per second.

---

## WASM vs. WebGPU: Theoretical Differences

**WebAssembly** is designed to run low-level code at near-native speeds on the **CPU**. CPUs are optimized for low-latency, complex branching logic, and typically have a small number of very powerful cores. Calculating PoW on a CPU is inherently limited by this low core count.

**WebGPU** is a modern API that exposes **GPU** compute capabilities to the web. Unlike a CPU, a GPU consists of thousands of smaller, simpler cores designed for high-throughput parallel tasks. Because every PoW attempt is independent of every other attempt (a "perfectly parallel" problem), the GPU can process them in massive batches, often finishing high-difficulty work in a fraction of a second.

## Side-by-Side Comparison

| Aspect | WebAssembly (CPU) | WebGPU (GPU) |
| :--- | :--- | :--- |
| **Performance** | **Moderate.** Limited by clock speed and core count. | **Extreme.** Up to 50x-100x faster for high-difficulty PoW. |
| **Parallelism** | **Low.** Scaled via Web Workers (typically 4-16 threads). | **Massive.** Thousands of threads running simultaneously. |
| **Portability** | **Universal.** Works on virtually all browsers since 2017. | **Modern Only.** Requires latest browsers (Chrome 113+, Safari 17+). |
| **Node.js Setup** | **Easy.** Native support in modern Node.js. | **Complex.** Requires native bindings (`@sylphx/webgpu`). |
| **Energy Efficiency** | **Lower.** High CPU usage for long periods. | **Higher.** Finishes the task so quickly that total energy is lower. |
| **Reliability** | **High.** Very stable across all hardware. | **Variable.** Performance depends on the user's specific GPU drivers. |
| **Best For** | Fallback for older devices/servers without GPUs. | Primary choice for fast, interactive user experiences. |

## Performance Insights
In our benchmarks, the WebGPU backend consistently outperforms the single-threaded WASM backend by over **50x** on "Send/Change" difficulty blocks. While multi-threaded WASM narrows this gap, WebGPU remains the superior choice for any device with a compatible graphics processor.
