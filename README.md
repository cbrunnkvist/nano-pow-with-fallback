## nano-pow-with-fallback

### Overview

This repo contains a Nano Currency PoW implementation with **WebAssembly (WASM)**, **WebGPU**, and **WebGL** support for maximum performance across all platforms, plus a practical benchmark runner for CLI and web. Check it out: 

For a detailed comparison of the different implementations, see [BACKENDS.md](./BACKENDS.md).

### Features
- **WebGPU Acceleration**: Blazing fast PoW calculation using GPU compute shaders
- **WebGL Fallback**: GPU acceleration via fragment shaders (browser-only)
- **WASM Fallback**: High-performance implementation for environments without GPU support
- **Work validation**: Benchmarks report whether the block+work pair is valid via the `Valid block` indicator (Node CLI uses `nanocurrency.validateWork`; the browser page uses the same reference algorithm locally).

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
- Valid block column that mirrors the CLI output by running the reference validation check for each backend result.

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
- `npm run test:service` runs `test/pow-service-tests.js` (backend order, probe report, WASM fix, cancellation).
- `npm run test:cli` runs `test/cli-tests.js` (CLI argument validation, preamble output, bare work line).
- `npm run benchmark:node` (`test/benchmark.js`) exercises WASM, multi-threaded WASM, and WebGPU stats while displaying a `Valid block` column that comes from `nanocurrency.validateWork`.
- `npm run benchmark:web` or `node benchmark-server.js` + `open http://localhost:3000/benchmark.html` launches the interactive UI, which mirrors the CLI table and shows the same validation badge for each backend.
- `npm run test:e2e` / `npm run test:e2e:watch` execute the Playwright suite in `tests/benchmark.spec.js` against the UI.

### CLI

The package exposes a developer-oriented CLI for probing backend capabilities, experimenting with backend selection order, and generating Nano PoW on the command line.

```bash
npx nano-pow-with-fallback --hash <64-hex> --threshold <16-hex>
```

The CLI always prints a preamble describing what it detected and which backend it selected, then prints the generated work value on a final bare line — exactly as it would appear in the `"work"` field of a Nano state block.

**Options**

| Option | Description |
|---|---|
| `--hash <64-hex>` | Previous block hash (or account public key for open blocks) |
| `--threshold <16-hex>` | Work difficulty threshold |
| `--backends <list>` | Comma-separated ordered allowlist. Omitted backends are disabled. |
| `--help` | Show help |

**Backend thresholds**

| Block type | Threshold |
|---|---|
| Open / Receive | `fffffe0000000000` |
| Send / Change | `fffffff800000000` |

**Examples**

```bash
# Default backend selection (WebGPU → WebGL → WASM)
npx nano-pow-with-fallback \
  --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \
  --threshold fffffe0000000000

# Force WASM only
npx nano-pow-with-fallback \
  --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \
  --threshold fffffe0000000000 \
  --backends wasm

# WebGPU first, fall back to WASM (skip WebGL)
npx nano-pow-with-fallback \
  --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \
  --threshold fffffe0000000000 \
  --backends webgpu,wasm
```

**Example output**

```text
Default backend priority:  webgpu, webgl, wasm
Requested backend priority: wasm
Effective backend priority: wasm

Probe webgpu: skipped (not in effective order)
Probe webgl: skipped (not in effective order)
Probe wasm: available

Selected backend: wasm

WASM batches: 3
Elapsed: 12341 ms
Validation: valid for threshold fffffe0000000000

5992e2a700abc19e
```

**Deep tracing with `DEBUG`**

Set `DEBUG` to one or more comma-separated namespaces to enable structured trace output on `stderr`. The preamble and final work line on `stdout` are unaffected.

```bash
# Trace everything
DEBUG=nano-pow:* npx nano-pow-with-fallback \
  --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \
  --threshold fffffe0000000000

# Trace only fallback selection and WASM batch loop
DEBUG=nano-pow:fallback,nano-pow:wasm npx nano-pow-with-fallback \
  --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \
  --threshold fffffe0000000000 \
  --backends wasm
```

Available namespaces: `nano-pow:fallback`, `nano-pow:wasm`, `nano-pow:webgpu`, `nano-pow:webgl`, `nano-pow:validate`.

> **Note on `0000000000000000` in debug output:** The WASM backend splits work into 5M-iteration batches. A zero nonce in a `nano-pow:wasm` trace line means no solution was found in *that batch* — the loop continues until a valid nonce is found. It does not mean the API returned zero work.

### Related packages

- [`nano-pow`](https://www.npmjs.com/package/nano-pow) (v5.1.10) also bundles WebGPU, WebGL, and WASM proof-of-work generators with validation/shading fallbacks for Nano and publishes CLI/server binaries. While both packages provide similar backends, `nano-pow-with-fallback` focuses on a programmable `PowService` interface with explicit backend selection, cancellation support, and documented fallback behavior for advanced integration scenarios.


### Additional help

There are more docs about the emscripten itself [here](http://kripken.github.io/emscripten-site/docs/porting/connecting_cpp_and_javascript/index.html).

### Compatibility

This implementation has just been tested in Chrome (Windows 64bit), Firefox (Windows 64bit) and Chrome (Android) but should also work in
all the [devices supporting WASM](https://developer.mozilla.org/en-US/docs/WebAssembly#Browser_compatibility).

### Acknowledgements

Forked from [jaimehgb/RaiBlocksWebAssemblyPoW](https://github.com/jaimehgb/RaiBlocksWebAssemblyPoW) and inspired by [nanocurrency/nano-work-server](https://github.com/nanocurrency/nano-work-server) and [Codecow's nano-pow](https://www.npmjs.com/package/nano-pow).
