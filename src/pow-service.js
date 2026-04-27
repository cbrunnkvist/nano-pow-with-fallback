import { WebGPUPow } from './webgpu-pow.js';
import { WebGLPow, getWebGLPow } from './webgl-pow.js';
import { makeDebug } from './debug.js';

const debugFallback = makeDebug('nano-pow:fallback');
const debugWasm     = makeDebug('nano-pow:wasm');
const debugWebgpu   = makeDebug('nano-pow:webgpu');
const debugWebgl    = makeDebug('nano-pow:webgl');
const debugValidate = makeDebug('nano-pow:validate');

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const isNode    = typeof process !== 'undefined' && Boolean(process.versions?.node);

export const PowBackendName = {
  WEBGPU: 'webgpu',
  WEBGL:  'webgl',
  WASM:   'wasm',
};

/** Ordered list of all built-in backend names, highest priority first. */
export const DEFAULT_BACKEND_ORDER = [
  PowBackendName.WEBGPU,
  PowBackendName.WEBGL,
  PowBackendName.WASM,
];

const ALL_BACKEND_NAMES = new Set(Object.values(PowBackendName));

export class PowServiceAbortError extends Error {
  constructor() {
    super('PoW generation cancelled');
    this.name = 'PowServiceAbortError';
  }
}

/**
 * One entry in the probeReport array, describing the outcome of probing a
 * single backend during _selectBackend().
 *
 * @typedef {Object} ProbeEntry
 * @property {string}  name      - backend name
 * @property {boolean} available - whether the backend passed supports() + init()
 * @property {string}  reason    - human-readable reason when available=false
 * @property {boolean} selected  - true for the backend that was chosen
 * @property {boolean} skipped   - true when the backend was not in the effective order
 */

export class PowService {
  /**
   * @param {Object} [opts]
   * @param {string[]} [opts.backendOrder]    - Ordered allowlist of backend names.
   *   Omitted backends are disabled.  Defaults to DEFAULT_BACKEND_ORDER.
   * @param {string[]} [opts.disabledBackends] - Legacy compat: names to disable
   *   on top of the default order.  Ignored when backendOrder is provided.
   */
  constructor({ backendOrder, disabledBackends = [] } = {}) {
    // Validate and resolve effective order
    if (backendOrder !== undefined) {
      const unknown = backendOrder.filter((n) => !ALL_BACKEND_NAMES.has(n));
      if (unknown.length > 0) {
        throw new Error(`Unknown backend name(s): ${unknown.join(', ')}. Valid names: ${[...ALL_BACKEND_NAMES].join(', ')}`);
      }
      this._effectiveOrder = [...new Set(backendOrder)]; // deduplicate, preserve order
    } else {
      const disabled = new Set(disabledBackends.map((n) => n && n.toLowerCase()));
      this._effectiveOrder = DEFAULT_BACKEND_ORDER.filter((n) => !disabled.has(n));
    }

    this._requestedOrder = backendOrder ? [...backendOrder] : null;

    this._providers     = new Map(); // name -> provider descriptor
    this._selectedBackend = null;
    this._currentTask   = null;
    this._currentCancel = null;

    /** @type {ProbeEntry[]} */
    this.probeReport = [];

    this._registerDefaults();
    this.ready = this._selectBackend();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get backend() {
    return this._selectedBackend?.name || null;
  }

  cancel() {
    if (this._currentCancel) {
      this._currentCancel();
      this._currentCancel = null;
    }
  }

  async getProofOfWork({ hash, threshold }) {
    if (!hash || hash.length !== 64) {
      throw new Error('hash must be a 64-character hex string');
    }

    // Set up cancel hook BEFORE the first await so it is always available.
    let cancelled = false;
    const cancelPromise = new Promise((_, reject) => {
      this._currentCancel = () => {
        cancelled = true;
        try { this._selectedBackend?.cancel?.(); } catch {}
        reject(new PowServiceAbortError());
      };
    });

    await this.ready;
    if (!this._selectedBackend) throw new Error('PoW backend was not initialized');
    if (this._currentTask)      throw new Error('A PoW operation is already running');

    const backendPromise = (async () => {
      await new Promise((r) => setTimeout(r, 0)); // yield so cancel() can queue
      if (cancelled) throw new PowServiceAbortError();

      const result = await this._selectedBackend.getProofOfWork({ hash, threshold });
      return this._normalizeResult(this._selectedBackend.name, result);
    })();

    this._currentTask = Promise.race([backendPromise, cancelPromise]);

    try {
      return await this._currentTask;
    } finally {
      this._currentTask   = null;
      this._currentCancel = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _normalizeResult(name, result) {
    const normalized = typeof result === 'string' ? { proofOfWork: result } : result || {};
    const work = normalized.proofOfWork;
    if (!work || work === '0000000000000000') {
      throw new Error(`[${name}] backend returned zero nonce — refusing to propagate invalid work`);
    }
    return { backend: name, ...normalized };
  }

  async _selectBackend() {
    debugFallback(`effective order: [${this._effectiveOrder.join(', ')}]`);

    // Mark backends that are not in the effective order as skipped
    for (const name of DEFAULT_BACKEND_ORDER) {
      if (!this._effectiveOrder.includes(name)) {
        debugFallback(`skip ${name}: not in effective order`);
        this.probeReport.push({ name, available: false, reason: 'not in effective order', selected: false, skipped: true });
      }
    }

    for (const name of this._effectiveOrder) {
      const provider = this._providers.get(name);
      if (!provider) {
        debugFallback(`skip ${name}: no provider registered`);
        this.probeReport.push({ name, available: false, reason: 'no provider registered', selected: false, skipped: false });
        continue;
      }

      // supports() check
      let supported = false;
      try {
        supported = await provider.supports?.();
        debugFallback(`supports ${name}: ${supported}`);
      } catch (err) {
        debugFallback(`supports ${name} threw: ${err.message}`);
        this.probeReport.push({ name, available: false, reason: `supports() threw: ${err.message}`, selected: false, skipped: false });
        continue;
      }
      if (!supported) {
        const reason = provider.unsupportedReason?.() ?? 'not supported in this environment';
        debugFallback(`skip ${name}: ${reason}`);
        this.probeReport.push({ name, available: false, reason, selected: false, skipped: false });
        continue;
      }

      // init() attempt
      try {
        if (!provider._ready) {
          debugFallback(`init ${name}...`);
          await provider.init?.();
          provider._ready = true;
          debugFallback(`init ${name} ok`);
        }
      } catch (err) {
        debugFallback(`init ${name} failed: ${err.message}`);
        this.probeReport.push({ name, available: false, reason: `init failed: ${err.message}`, selected: false, skipped: false });
        continue;
      }

      this._selectedBackend = provider;
      this.probeReport.push({ name, available: true, reason: '', selected: true, skipped: false });
      debugFallback(`selected ${name}`);
      return provider;
    }

    throw new Error('No available PoW backend was found');
  }

  _registerDefaults() {
    this._providers.set(PowBackendName.WEBGPU, this._createWebgpuBackend());
    this._providers.set(PowBackendName.WEBGL,  this._createWebglBackend());
    this._providers.set(PowBackendName.WASM,   this._createWasmBackend());
  }

  // ---------------------------------------------------------------------------
  // Backend factories
  // ---------------------------------------------------------------------------

  _createWebgpuBackend() {
    let instance = null;
    return {
      name: PowBackendName.WEBGPU,
      supports: () => {
        if (typeof navigator !== 'undefined' && navigator?.gpu) return true;
        if (isNode) return true;
        return false;
      },
      init: async () => {
        instance = new WebGPUPow();
        await instance.init();
        debugWebgpu('init complete');
      },
      getProofOfWork: async ({ hash, threshold }) => {
        debugWebgpu(`generating work for hash ${hash.slice(0, 8)}...`);
        const proofOfWork = await instance.getProofOfWork(hash, threshold);
        debugWebgpu(`done: ${proofOfWork}`);
        return { proofOfWork };
      },
    };
  }

  _createWebglBackend() {
    let instance = null;
    return {
      name: PowBackendName.WEBGL,
      supports: () => isBrowser && typeof WebGL2RenderingContext !== 'undefined',
      unsupportedReason: () => 'WebGL backend requires a browser environment',
      init: async () => {
        instance = getWebGLPow();
        await instance.init();
        debugWebgl('init complete');
      },
      getProofOfWork: async ({ hash, threshold }) => {
        debugWebgl(`generating work for hash ${hash.slice(0, 8)}...`);
        const proofOfWork = await instance.getProofOfWork(hash, threshold);
        debugWebgl(`done: ${proofOfWork}`);
        return {
          proofOfWork,
          iterations: instance.getIterations(),
        };
      },
    };
  }

  _createWasmBackend() {
    let nanoPow    = null;
    let wasmModule = null;
    let batchCount = 0;

    const waitForNanoPow = () =>
      new Promise((resolve) => {
        const check = () => { if (nanoPow) resolve(); else setTimeout(check, 10); };
        check();
      });

    return {
      name: PowBackendName.WASM,
      supports: () => true,
      init: async () => {
        if (isBrowser && globalThis.NanoPow?.getProofOfWorkMultiThreaded) {
          nanoPow = globalThis.NanoPow;
          await waitForNanoPow();
          debugWasm('init via browser NanoPow global');
          return;
        }

        if (isNode) {
          const [{ createRequire }, path, { fileURLToPath }] = await Promise.all([
            import('module'),
            import('path'),
            import('url'),
          ]);
          const require   = createRequire(import.meta.url);
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          wasmModule = require(path.join(__dirname, '../nano-pow/nano-pow-node.cjs'));
          // The CJS wrapper sets global.Module.ready = true inside
          // onRuntimeInitialized, which fires asynchronously after require().
          // Wait for it before any ccall.
          if (!wasmModule.ready) {
            await new Promise((resolve) => {
              const check = () => { if (wasmModule.ready) resolve(); else setTimeout(check, 10); };
              check();
            });
          }
          debugWasm('init via Node.js CJS module');
          return;
        }

        throw new Error('WASM backend is not available in this environment');
      },

      getProofOfWork: async ({ hash, threshold }) => {
        if (nanoPow) {
          // Browser multi-threaded path — no zero-batch issue here
          debugWasm(`generating (browser multi-threaded) hash ${hash.slice(0, 8)}...`);
          const result = await nanoPow.getProofOfWorkMultiThreaded({ hash, threshold });
          debugWasm(`done: ${result.proofOfWork} (calls=${result.calls})`);
          return result;
        }

        if (wasmModule) {
          // Node single-threaded path.
          // ccall returns '0000000000000000' when no solution was found in the
          // current 5M-iteration batch — this is NOT a fatal error, just a miss.
          // We keep looping until we find a valid nonce or get cancelled.
          batchCount = 0;
          debugWasm(`generating (Node ccall loop) hash ${hash.slice(0, 8)}... threshold ${threshold}`);

          let proofOfWork = '0000000000000000';
          while (proofOfWork === '0000000000000000') {
            try {
              proofOfWork = wasmModule.ccall(
                'getProofOfWork', 'string', ['string', 'string'], [hash, threshold]
              );
            } catch (err) {
              throw new Error('WASM ccall failed: ' + err.message);
            }
            batchCount++;
            if (proofOfWork === '0000000000000000') {
              debugWasm(`batch ${batchCount}: miss (zero nonce), continuing...`);
            }
          }

          debugWasm(`batch ${batchCount}: hit nonce ${proofOfWork}`);
          return { proofOfWork, wasmBatches: batchCount };
        }

        throw new Error('WASM backend was not initialized');
      },

      /** Expose batch count so the CLI can report it. */
      get wasmBatches() { return batchCount; },
    };
  }
}
