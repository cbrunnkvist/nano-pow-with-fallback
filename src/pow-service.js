import { WebGPUPow } from './webgpu-pow.js';
import { WebGLPow, getWebGLPow } from './webgl-pow.js';

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

export const PowBackendName = {
  WEBGPU: 'webgpu',
  WEBGL: 'webgl',
  WASM: 'wasm',
};

export class PowServiceAbortError extends Error {
  constructor() {
    super('PoW generation cancelled');
    this.name = 'PowServiceAbortError';
  }
}

export class PowService {
  constructor({ disabledBackends = [] } = {}) {
    this._providers = [];
    this._selectedBackend = null;
    this._currentTask = null;
    this._currentCancel = null;
    this._disabled = new Set(disabledBackends.map((name) => name && name.toLowerCase()));
    this._registerDefaults();
    this.ready = this._selectBackend();
  }

  registerBackend(provider) {
    if (!provider || !provider.name) return;
    if (this._providers.some((existing) => existing.name === provider.name)) return;
    this._providers.push(provider);
    this._providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  async _selectBackend() {
    for (const provider of this._providers) {
      if (this._disabled.has(provider.name)) continue;
      try {
        const supports = await provider.supports?.();
        if (!supports) continue;
      } catch (err) {
        continue;
      }

      try {
        if (!provider._ready) {
          await provider.init?.();
          provider._ready = true;
        }
        this._selectedBackend = provider;
        return provider;
      } catch (err) {
        continue;
      }
    }
    throw new Error('No available PoW backend was found');
  }

  async getProofOfWork({ hash, threshold }) {
    if (!hash || hash.length !== 64) {
      throw new Error('hash must be a 64-character hex string');
    }

    // Set up cancel hook BEFORE the first await to ensure it's available
    let cancelHook = null;
    let cancelled = false;
    const cancelPromise = new Promise((_, reject) => {
      cancelHook = () => {
        cancelled = true;
        try {
          this._selectedBackend?.cancel?.();
        } catch (err) {
          // swallow
        }
        reject(new PowServiceAbortError());
      };
      this._currentCancel = cancelHook;
    });

    await this.ready;
    if (!this._selectedBackend) {
      throw new Error('PoW backend was not initialized');
    }
    if (this._currentTask) {
      throw new Error('A PoW operation is already running');
    }

    const backendPromise = (async () => {
      // Yield to allow cancel() to be queued and executed
      await new Promise(r => setTimeout(r, 0));
      if (cancelled) throw new PowServiceAbortError();

      const result = await this._selectedBackend.getProofOfWork({ hash, threshold });
      return this._normalizeResult(this._selectedBackend.name, result);
    })();

    this._currentTask = Promise.race([backendPromise, cancelPromise]);

    try {
      return await this._currentTask;
    } finally {
      this._currentTask = null;
      this._currentCancel = null;
    }
  }

  cancel() {
    if (this._currentCancel) {
      this._currentCancel();
      this._currentCancel = null;
    }
  }

  get backend() {
    return this._selectedBackend?.name || null;
  }

  _normalizeResult(name, result) {
    const normalized = typeof result === 'string' ? { proofOfWork: result } : result || {};
    return { backend: name, ...normalized };
  }

  _registerDefaults() {
    this.registerBackend(this._createWebgpuBackend());
    this.registerBackend(this._createWebglBackend());
    this.registerBackend(this._createWasmBackend());
  }

  _createWebgpuBackend() {
    let instance = null;
    return {
      name: PowBackendName.WEBGPU,
      priority: 0,
      supports: () => {
        if (typeof navigator !== 'undefined' && navigator?.gpu) return true;
        if (isNode) return true;
        return false;
      },
      init: async () => {
        instance = new WebGPUPow();
        await instance.init();
      },
      getProofOfWork: async ({ hash, threshold }) => ({ proofOfWork: await instance.getProofOfWork(hash, threshold) }),
    };
  }

  _createWebglBackend() {
    let instance = null;
    return {
      name: PowBackendName.WEBGL,
      priority: 1,
      supports: () => isBrowser && typeof WebGL2RenderingContext !== 'undefined',
      init: async () => {
        instance = getWebGLPow();
        await instance.init();
      },
      getProofOfWork: async ({ hash, threshold }) => {
        const proofOfWork = await instance.getProofOfWork(hash, threshold);
        return {
          proofOfWork,
          iterations: instance.getIterations(),
        };
      },
    };
  }

  _createWasmBackend() {
    let nanoPow = null;
    let wasmModule = null;
    const waitForNanoPow = () =>
      new Promise((resolve) => {
        const check = () => {
          if (nanoPow) resolve();
          else setTimeout(check, 10);
        };
        check();
      });

    return {
      name: PowBackendName.WASM,
      priority: 2,
      supports: () => true,
      init: async () => {
        if (isBrowser && globalThis.NanoPow?.getProofOfWorkMultiThreaded) {
          nanoPow = globalThis.NanoPow;
          await waitForNanoPow();
          return;
        }

        if (isNode) {
          const [{ createRequire }, path, { fileURLToPath }] = await Promise.all([
            import('module'),
            import('path'),
            import('url'),
          ]);
          const require = createRequire(import.meta.url);
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          wasmModule = require(path.join(__dirname, '../nano-pow/nano-pow-node.cjs'));
          return;
        }

        throw new Error('WASM backend is not available in this environment');
      },
      getProofOfWork: async ({ hash, threshold }) => {
        if (nanoPow) {
          return await nanoPow.getProofOfWorkMultiThreaded({ hash, threshold });
        }
        if (wasmModule) {
          try {
            const proofOfWork = wasmModule.ccall('getProofOfWork', 'string', ['string', 'string'], [hash, threshold]);
            if (!proofOfWork || proofOfWork === '0000000000000000') {
              throw new Error('WASM backend returned invalid/zero nonce - possible emscripten runtime failure');
            }
            return { proofOfWork };
          } catch (err) {
            if (err.message.includes('WASM backend returned invalid')) {
              throw err;
            }
            throw new Error('WASM ccall failed: ' + err.message);
          }
        }
        throw new Error('WASM backend was not initialized');
      },
    };
  }
}
          if (err.message.includes('WASM backend returned invalid')) {
              throw err;
            }
            throw new Error('WASM ccall failed: ' + err.message);
          }
        }
        throw new Error('WASM backend was not initialized');
      },
    };
  }
}
