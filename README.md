## nano-pow-with-fallback

### Overview

This repo contains a Nano Currency PoW implementation with **WebAssembly (WASM)**, **WebGPU**, and **WebGL** support for maximum performance across all platforms, plus a practical benchmark runner for CLI and web. Check it out: 

For a detailed comparison of the different implementations, see [BACKENDS.md](./BACKENDS.md).

### Features
- **WebGPU Acceleration**: Blazing fast PoW calculation using GPU compute shaders
- **WebGL Fallback**: GPU acceleration via fragment shaders (browser-only)
- **WASM Fallback**: High-performance implementation for environments without GPU support
- **Official validation**: CLI and browser benchmarks call `nanocurrency.validateWork` so every backend run reports whether its block+work pair is valid via the new `Valid block` indicator.

### Fallback Chain

The library automatically selects the best available backend:
1. **WebGPU** (fastest) - GPU compute shaders
2. **WebGL** (browser-only) - GPU fragment shaders
3. **WASM** (universal) - Multi-threaded CPU

### PowService API

For CLI and browser wallets that need a deterministic, configurable, `RPC`-free PoW pipeline, use the `PowService` object. The service picks the fastest available backend once per instance, exposes the selected backend via `powService.backend`, and lets callers disable any subset (but not all) of the built-in providers by passing `disabledBackends: [PowBackendName.WEBGPU, PowBackendName.WEBGL]` to the constructor.

Cancellation is built in via `powService.cancel()` so your caller can abort work generation without knowing which backend is active at runtime.

```javascript
import { PowService, PowBackendName } from 'nano-pow-with-fallback';

const powService = new PowService({ disabledBackends: [PowBackendName.WEBGPU] });
await powService.ready;

const { backend, proofOfWork } = await powService.getProofOfWork({ hash, threshold });
console.log(`work found on ${backend}`, proofOfWork);

powService.cancel();
```

If you only need the default flow, `getProofOfWork()` still exists and reuses a shared `PowService` instance internally.

### Usage (Node.js & Modern Browsers)

```javascript
import { getProofOfWork, THRESHOLD__OPEN_RECEIVE } from 'nano-pow-with-fallback';

const hash = "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000";
const proofOfWork = await getProofOfWork({
  hash,
  threshold: THRESHOLD__OPEN_RECEIVE
});

console.log({ hash, proofOfWork });
```

### Usage (Browser Legacy)

To get the proof of work you can simply add the `nano-pow/index.js` to your source code and do:

```html
    <script src="/nano-pow/index.js"></script>
    <script>
      test();

      async function test() {
        const start = Date.now();
        const hash =
          "BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000";

        const proofOfWork = await NanoPow.getProofOfWorkMultiThreaded(
          {
            hash,
            threshold: NanoPow.THRESHOLD__OPEN_RECEIVE,
          }
          // , { workers: 5 } // optionally limit the number of workers, default is number of threads-1
        );

        const end = Date.now();
        const time = (end - start) / 1000;

        console.log({ hash, time, proofOfWork });
      }
    </script>
```

See the files in the `examples` directory for a full overview.

#### Available proof Of Work thresholds

```javascript
  NanoPow.THRESHOLD__SEND_CHANGE,  // "fffffff800000000"
  NanoPow.THRESHOLD__OPEN_RECEIVE, // "fffffe0000000000"
```

If a new threshold is needed in a new version, it can be passed to the function `getProofOfWorkMultiThreaded` as a simple hex string.

### Web Benchmark UI

Compare backend performance in your browser:

```bash
# Start the benchmark server
npm run benchmark:web

# Open in browser
open http://localhost:3000/benchmark.html
```

**Features:**
- Start/Stop/Skip controls
- Per-backend rerun buttons
- Real-time progress bars
- Results comparison table
- Valid block column that mirrors the CLI output by running `nanocurrency.validateWork` for each backend result.

**Requirements:**
- WebGPU: Chrome 113+ or Firefox with WebGPU enabled
- WebGL: WebGL2 support (all modern browsers)
- WASM: Universal support

### Compiling from source

All the PoW work takes place at <code>nano-pow.cpp</code>.
There is the main loop which calculates the PoW and a function which
can be called from JS and runs the loop (the iterations function).

To compile it to Web Assembly you need to install **emscripten** and add it to your path:

- https://emscripten.org/docs/getting_started/downloads.html

With that done, at the repo directory run:

```bash
$ ./compile.sh
```

It will output 2 files: `nano-pow.js` and `nano-pow.wasm`. To get directions on how to use these files, check the JS files in the `nano-pow` directory.


### Testing

- `npm test` runs `test/unit-tests.js` (WASM, WebGPU, `PowService`).
- `npm run benchmark:node` (`test/benchmark.js`) exercises WASM, multi-threaded WASM, and WebGPU stats while displaying a `Valid block` column that comes from `nanocurrency.validateWork`.
- `npm run benchmark:web` or `node benchmark-server.js` + `open http://localhost:3000/benchmark.html` launches the interactive UI, which mirrors the CLI table and shows the same validation badge for each backend.
- `npm run test:e2e` / `npm run test:e2e:watch` execute the Playwright suite in `tests/benchmark.spec.js` against the UI.

### Related packages

- [`nano-pow`](https://www.npmjs.com/package/nano-pow) (v5.1.10) also bundles WebGPU, WebGL, and WASM proof-of-work generators with validation/shading fallbacks for Nano and publishes CLI/server binaries, so we position `nano-pow-with-fallback` as the programmable PoW service that ties them together with cancellation, discovery, and documented fallbacks.


### Additional help

There are more docs about the emscripten itself [here](http://kripken.github.io/emscripten-site/docs/porting/connecting_cpp_and_javascript/index.html).

### Compatibility

This implementation has just been tested in Chrome (Windows 64bit), Firefox (Windows 64bit) and Chrome (Android) but should also work in
all the [devices supporting WASM](https://developer.mozilla.org/en-US/docs/WebAssembly#Browser_compatibility).

### Acknowledgements

Forked from [jaimehgb/RaiBlocksWebAssemblyPoW](https://github.com/jaimehgb/RaiBlocksWebAssemblyPoW) and inspired by [nanocurrency/nano-work-server](https://github.com/nanocurrency/nano-work-server) and [Codecow's nano-pow](https://www.npmjs.com/package/nano-pow).
