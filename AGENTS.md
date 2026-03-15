# nano-pow-with-fallback

The README is the canonical reference for the project overview, npm package exports, benchmarks, and the CLI/web instructions that the repo is supposed to deliver. This AGENTS file keeps a slim set of stable implementation cues that are useful to know when touching the PoW stack without re-stating every command.

## Pocket context
- Core backends: WebGPU, WebGL, and WASM (single-threaded + worker-based multi-threaded). This matches the README overview.
- `nano-pow/` holds the Emscripten-generated wasm/worker outputs referenced by multiple scripts.

## Extension & naming persistence
- `package.json` is `"type": "module"`, so the Emscripten output must stay as `.cjs` while browsers/workers expect `.js`. The build script writes `nano-pow/nano-pow.cjs` and keeps `nano-pow.js` as a symlink. Do not rename those files.

## Parallelism & multithreading
- Browser multi-threading is driven by `navigator.hardwareConcurrency` (default `cores - 1`).
- Node.js multi-threading is driven by `os.cpus()` (default `cores - 1`).
- Worker threads are used via `worker_threads` on Node and Web Workers in the browser; expect the thread count configuration to remain consistent across runs.

## Testing notes
- `npm test` drives the unit tests (`test/unit-tests.js`). `npm run benchmark:node` and `npm run benchmark:web` exercise the CLI and the UI. The Node CLI uses `nanocurrency.validateWork` for the `Valid block` column; the browser page runs the same reference check locally.
- Playwright E2E tests live under `tests/benchmark.spec.js`, so `npm run test:e2e` / `npm run test:e2e:watch` depend on Playwright plus the local `.env` variables (see `.env.example`). The suite uses the `list` reporter to keep terminal noise low.

## WebGPU & WebGL logic
- `src/webgpu-pow.js` loads `.wgsl` shaders via `fetch` in the browser and `fs` in Node so the same code can run in both contexts.
- WebGL shader math is split into high/low 32-bit comparisons to handle 64-bit Nano threshold checks without GLSL overflow.
