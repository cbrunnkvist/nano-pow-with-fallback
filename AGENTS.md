# nanocurrency-wasm-pow

High-performance Nano Currency Proof of Work (PoW) implementation supporting multiple backends: WebGPU, WebGL, and WebAssembly (WASM).

## Project Overview
- **Backends:**
  - **WebGPU:** Modern GPU compute shaders (fastest). Works in Node.js via `@sylphx/webgpu` and in modern browsers (Chrome 113+).
  - **WebGL:** GPU fragment shaders. Browser-only fallback for older GPUs.
  - **WASM:** CPU implementation compiled from C++. Supports single-threaded and multi-threaded (Worker-based) execution.
- **Project Structure:**
  - `src/`: Core backend implementations and main entry point.
  - `nano-pow/`: WASM binary, wrapper, and worker scripts.
  - `test/`: CLI benchmark and unit tests.
  - `tests/`: Playwright E2E tests for the web interface.
  - `benchmark.html`: Browser-based UI for benchmarking and comparison.

## Building and Running

### Prerequisites
- [Emscripten](https://emscripten.org/) (only needed for recompiling WASM).
- Node.js 16+ (uses ESM).

### Commands
- **Install Dependencies:** `npm install`
- **Compile WASM:** `sh compile.sh` (Compiles `nano-pow.cpp` to `nano-pow/nano-pow.cjs`).
- **Start Web Benchmark:** `npm run benchmark:web` (Starts server at `http://localhost:3000`).
- **Run CLI Benchmark:** `npm run benchmark:node` (Tests WASM and WebGPU in Node.js).
- **Run E2E Tests:** `npm run test:e2e` (Requires Playwright and `.env` configuration).
- **Interactive E2E Tests:** `npm run test:e2e:watch` (Playwright UI mode).

## Development Conventions

### Extension & Naming Persistence
- **The .js/.cjs Ping-Pong Solution:** 
  - `package.json` specifies `"type": "module"`.
  - Node.js requires `.cjs` for the Emscripten-generated file to support internal `require()` calls.
  - Browsers/Workers often expect `.js`.
  - **Standard:** `compile.sh` outputs to `nano-pow.cjs`. A symlink `nano-pow.js -> nano-pow.cjs` exists in the `nano-pow/` directory to satisfy all environments. **Do not rename these files manually.**

### Parallelism
- **Browser:** Detected via `navigator.hardwareConcurrency`. Default is `cores - 1`.
- **Node.js:** Detected via `os.cpus()`. Default is `cores - 1`.
- **Multi-threading:** Implemented via Web Workers in the browser and `worker_threads` in Node.js.

### Testing
- **E2E Tests:** Use Playwright. Configured in `playwright.config.js`.
- **Environment Variables:** Local developer settings (like `CHROME_BIN` for Brave Browser) should be placed in a `.env` file (see `.env.example`). `.env` is ignored by git.
- **Reporting:** Default `test:e2e` uses the `list` reporter for clean CLI output.

### WebGPU / WebGL Logic
- **Shader Loading:** `src/webgpu-pow.js` handles both browser (`fetch`) and Node.js (`fs`) environments for loading `.wgsl` shaders.
- **64-bit Comparison:** WebGL backends use a split high/low 32-bit comparison to handle the 64-bit Nano threshold without overflow in GLSL ES 3.0.
