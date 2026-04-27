/**
 * test/pow-service-tests.js
 *
 * Tests for the new PowService behaviour:
 *   - WASM zero-batch is treated as a miss, not a fatal error
 *   - Custom backend order is respected
 *   - Unknown backend names are rejected
 *   - Probe report reflects selection outcomes
 *   - Cancellation still works
 *
 * Run with: node test/pow-service-tests.js
 */

import { PowService, PowBackendName, DEFAULT_BACKEND_ORDER } from '../src/pow-service.js';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require   = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function ok(label, value) {
  if (value) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL  ${label}`);
    failed++;
  }
}

function throws(label, fn) {
  try {
    fn();
    console.log(`  ❌ FAIL  ${label} (expected error, got none)`);
    failed++;
  } catch {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  }
}

async function throwsAsync(label, fn) {
  try {
    await fn();
    console.log(`  ❌ FAIL  ${label} (expected error, got none)`);
    failed++;
  } catch {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  }
}

// ---------------------------------------------------------------------------
// Ensure WASM module is ready before tests that need it
// ---------------------------------------------------------------------------

const wasmModulePath = path.join(__dirname, '../nano-pow/nano-pow-node.cjs');
const WasmModule     = require(wasmModulePath);

async function waitForWasm() {
  if (WasmModule.ready) return;
  await new Promise((resolve) => {
    const check = () => { if (WasmModule.ready) resolve(); else setTimeout(check, 10); };
    check();
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function run() {
  console.log('\n=== PowService unit tests ===\n');

  // -------------------------------------------------------------------------
  // 1. DEFAULT_BACKEND_ORDER export
  // -------------------------------------------------------------------------
  console.log('-- DEFAULT_BACKEND_ORDER --');
  ok('is an array',               Array.isArray(DEFAULT_BACKEND_ORDER));
  ok('contains webgpu, webgl, wasm',
    DEFAULT_BACKEND_ORDER.includes('webgpu') &&
    DEFAULT_BACKEND_ORDER.includes('webgl') &&
    DEFAULT_BACKEND_ORDER.includes('wasm')
  );
  ok('webgpu is first',  DEFAULT_BACKEND_ORDER[0] === 'webgpu');
  ok('wasm is last',     DEFAULT_BACKEND_ORDER[DEFAULT_BACKEND_ORDER.length - 1] === 'wasm');

  // -------------------------------------------------------------------------
  // 2. Unknown backend names are rejected at construction time
  // -------------------------------------------------------------------------
  console.log('\n-- Unknown backend name rejection --');
  throws('throws for unknown backend name', () => new PowService({ backendOrder: ['bogus'] }));
  throws('throws for mixed known/unknown',  () => new PowService({ backendOrder: ['wasm', 'cosmic'] }));

  // -------------------------------------------------------------------------
  // 3. backendOrder as ordered allowlist
  // -------------------------------------------------------------------------
  console.log('\n-- backendOrder as ordered allowlist --');
  const wasmOnly = new PowService({ backendOrder: ['wasm'] });
  ok('effective order is [wasm]', wasmOnly._effectiveOrder.length === 1 && wasmOnly._effectiveOrder[0] === 'wasm');
  ok('requested order stored',    JSON.stringify(wasmOnly._requestedOrder) === JSON.stringify(['wasm']));

  const gpuFirst = new PowService({ backendOrder: ['webgpu', 'wasm'] });
  ok('effective order is [webgpu, wasm]', JSON.stringify(gpuFirst._effectiveOrder) === JSON.stringify(['webgpu', 'wasm']));

  // Default: no backendOrder, no disabledBackends
  const defaultSvc = new PowService();
  ok('default effective order matches DEFAULT_BACKEND_ORDER',
    JSON.stringify(defaultSvc._effectiveOrder) === JSON.stringify(DEFAULT_BACKEND_ORDER)
  );
  ok('requestedOrder is null when omitted', defaultSvc._requestedOrder === null);

  // -------------------------------------------------------------------------
  // 4. Probe report is populated
  // -------------------------------------------------------------------------
  console.log('\n-- Probe report --');
  const wasmSvc = new PowService({ backendOrder: ['wasm'] });
  await wasmSvc.ready;

  ok('probeReport has 3 entries', wasmSvc.probeReport.length === 3);

  const webgpuEntry = wasmSvc.probeReport.find((e) => e.name === 'webgpu');
  const webglEntry  = wasmSvc.probeReport.find((e) => e.name === 'webgl');
  const wasmEntry   = wasmSvc.probeReport.find((e) => e.name === 'wasm');

  ok('webgpu entry exists',               !!webgpuEntry);
  ok('webgpu skipped (not in effective)', webgpuEntry?.skipped === true);
  ok('webgpu available=false',            webgpuEntry?.available === false);

  ok('webgl entry exists',               !!webglEntry);
  ok('webgl skipped (not in effective)', webglEntry?.skipped === true);
  ok('webgl available=false',            webglEntry?.available === false);

  ok('wasm entry exists',            !!wasmEntry);
  ok('wasm available=true',          wasmEntry?.available === true);
  ok('wasm selected=true',           wasmEntry?.selected === true);
  ok('wasm not skipped',             wasmEntry?.skipped === false);

  // -------------------------------------------------------------------------
  // 5. Probe report for default order in Node
  //    WebGPU supports() returns true in Node (origin fix), so it gets selected.
  //    WebGL is unavailable (browser-only). WASM is skipped (WebGPU won).
  // -------------------------------------------------------------------------
  console.log('\n-- Probe report default order in Node --');
  const defaultNode = new PowService();
  await defaultNode.ready;

  const gpuNodeEntry  = defaultNode.probeReport.find((e) => e.name === 'webgpu');
  const glNodeEntry   = defaultNode.probeReport.find((e) => e.name === 'webgl');
  const wasmNodeEntry = defaultNode.probeReport.find((e) => e.name === 'wasm');

  ok('webgpu probed in Node',          gpuNodeEntry  !== undefined && gpuNodeEntry?.skipped  === false);
  ok('webgl probed or not reached',    glNodeEntry === undefined || (glNodeEntry?.available === false && glNodeEntry?.skipped === false));
  ok('webgpu or wasm selected in Node', gpuNodeEntry?.selected === true || wasmNodeEntry?.selected === true);

  // -------------------------------------------------------------------------
  // 6. WASM work generation succeeds and produces valid-looking work
  // -------------------------------------------------------------------------
  console.log('\n-- WASM work generation --');
  await waitForWasm();
  const svc6 = new PowService({ backendOrder: ['wasm'] });
  await svc6.ready;

  const hash6   = 'BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000';
  const thresh6 = 'fffffe0000000000';

  const result6 = await svc6.getProofOfWork({ hash: hash6, threshold: thresh6 });
  ok('backend name is wasm',                 result6.backend === 'wasm');
  ok('proofOfWork is a 16-char hex string',  typeof result6.proofOfWork === 'string' && result6.proofOfWork.length === 16);
  ok('proofOfWork is not all-zeros',         result6.proofOfWork !== '0000000000000000');
  ok('wasmBatches reported (>= 1)',          typeof result6.wasmBatches === 'number' && result6.wasmBatches >= 1);

  // -------------------------------------------------------------------------
  // 7. WASM zero-threshold (near-instant hit) also works
  // -------------------------------------------------------------------------
  console.log('\n-- WASM zero-threshold (instant) --');
  const svc7 = new PowService({ backendOrder: ['wasm'] });
  await svc7.ready;
  const result7 = await svc7.getProofOfWork({
    hash:      '0000000000000000000000000000000000000000000000000000000000000000',
    threshold: '0000000000000000',
  });
  ok('instant threshold returns non-zero work', result7.proofOfWork !== '0000000000000000');

  // -------------------------------------------------------------------------
  // 8. Cancellation still works
  // -------------------------------------------------------------------------
  console.log('\n-- Cancellation --');
  const { PowServiceAbortError } = await import('../src/pow-service.js');
  const svc8 = new PowService({ backendOrder: ['wasm'] });
  await svc8.ready;

  let cancelledCorrectly = false;
  try {
    const pending = svc8.getProofOfWork({ hash: hash6, threshold: 'fffffff800000000' });
    svc8.cancel();
    await pending;
  } catch (err) {
    cancelledCorrectly = err instanceof PowServiceAbortError;
  }
  ok('cancel() throws PowServiceAbortError', cancelledCorrectly);

  // -------------------------------------------------------------------------
  // 9. disabledBackends legacy compat still works
  // -------------------------------------------------------------------------
  console.log('\n-- disabledBackends legacy compat --');
  const legacySvc = new PowService({ disabledBackends: ['webgpu', 'webgl'] });
  ok('legacy: effective order is [wasm]',
    legacySvc._effectiveOrder.length === 1 && legacySvc._effectiveOrder[0] === 'wasm'
  );
  ok('legacy: requestedOrder is null', legacySvc._requestedOrder === null);

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------
  console.log(`\n${'─'.repeat(50)}`);
  if (failed === 0) {
    console.log(`ALL ${passed} TESTS PASSED ✨`);
    process.exit(0);
  } else {
    console.log(`${passed} passed, ${failed} FAILED ⚠️`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
