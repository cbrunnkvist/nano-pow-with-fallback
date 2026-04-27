#!/usr/bin/env node
/**
 * nano-pow-with-fallback CLI
 *
 * Developer-oriented tool for probing backend capabilities, experimenting
 * with backend selection order, and generating Nano PoW on the command line.
 *
 * Usage:
 *   npx nano-pow-with-fallback --hash <64-hex> --threshold <16-hex>
 *   npx nano-pow-with-fallback --hash <64-hex> --threshold <16-hex> --backends wasm
 *   DEBUG=nano-pow:* npx nano-pow-with-fallback --hash <64-hex> --threshold <16-hex>
 *
 * Output:
 *   Preamble lines describing the probe/selection process, then a single bare
 *   line containing the 16-hex work value as it would appear in a Nano block.
 */

import { PowService, PowBackendName, DEFAULT_BACKEND_ORDER } from '../src/pow-service.js';
import { validateWork } from '../src/validate-work.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const HELP = `
Usage:
  nano-pow-with-fallback --hash <64-hex> --threshold <16-hex> [--backends <list>]

Required:
  --hash <64-hex>         Previous block hash (or account public key for open blocks)
  --threshold <16-hex>    Work difficulty threshold
                          Open/Receive: fffffe0000000000
                          Send/Change:  fffffff800000000

Optional:
  --backends <list>       Comma-separated ordered backend allowlist.
                          Omitted backends are disabled.
                          Valid names: webgpu, webgl, wasm
                          Default: ${DEFAULT_BACKEND_ORDER.join(', ')}
  --help                  Show this help message

Examples:
  nano-pow-with-fallback \\
    --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \\
    --threshold fffffe0000000000

  nano-pow-with-fallback \\
    --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \\
    --threshold fffffe0000000000 \\
    --backends wasm

  DEBUG=nano-pow:* nano-pow-with-fallback \\
    --hash BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000 \\
    --threshold fffffe0000000000

Notes:
  - '0000000000000000' in DEBUG output is an intermediate WASM batch miss,
    not a final returned result. The service loops until a valid nonce is found.
  - Set DEBUG=nano-pow:* to trace the full fallback flow, or use specific
    namespaces: nano-pow:fallback  nano-pow:wasm  nano-pow:webgpu
                nano-pow:webgl    nano-pow:validate
`.trimStart();

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { hash: null, threshold: null, backends: null, help: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--hash':
        result.hash = args[++i];
        break;
      case '--threshold':
        result.threshold = args[++i];
        break;
      case '--backends':
        result.backends = args[++i];
        break;
      default:
        fatal(`Unknown argument: ${args[i]}\nRun with --help for usage.`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function preamble(line) {
  process.stdout.write(line + '\n');
}

function fatal(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateHex(value, name, expectedLength) {
  if (typeof value !== 'string' || value.length !== expectedLength) {
    fatal(`${name} must be a ${expectedLength}-character hex string, got: ${JSON.stringify(value)}`);
  }
  if (!/^[0-9a-fA-F]+$/.test(value)) {
    fatal(`${name} contains non-hex characters: ${JSON.stringify(value)}`);
  }
}

const VALID_BACKEND_NAMES = new Set(Object.values(PowBackendName));

function parseBackends(raw) {
  if (!raw) return null;
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (names.length === 0) fatal('--backends list is empty');
  const unknown = names.filter((n) => !VALID_BACKEND_NAMES.has(n));
  if (unknown.length > 0) {
    fatal(`Unknown backend name(s): ${unknown.join(', ')}.\nValid names: ${[...VALID_BACKEND_NAMES].join(', ')}`);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Preamble formatter
// ---------------------------------------------------------------------------

function printPreamble({ requestedOrder, effectiveOrder, probeReport }) {
  preamble(`Default backend priority:  ${DEFAULT_BACKEND_ORDER.join(', ')}`);

  if (requestedOrder !== null) {
    preamble(`Requested backend priority: ${requestedOrder.join(', ')}`);
  } else {
    preamble(`Requested backend priority: (none — using default)`);
  }

  preamble(`Effective backend priority: ${effectiveOrder.join(', ')}`);
  preamble('');

  for (const entry of probeReport) {
    if (entry.skipped) {
      preamble(`Probe ${entry.name}: skipped (${entry.reason})`);
    } else if (entry.available) {
      preamble(`Probe ${entry.name}: available`);
    } else {
      preamble(`Probe ${entry.name}: unavailable (${entry.reason})`);
    }
  }

  preamble('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (!args.hash)      fatal('--hash is required');
  if (!args.threshold) fatal('--threshold is required');

  validateHex(args.hash,      '--hash',      64);
  validateHex(args.threshold, '--threshold', 16);

  const requestedOrder = parseBackends(args.backends);

  // Build service options
  const serviceOpts = requestedOrder ? { backendOrder: requestedOrder } : {};

  let service;
  try {
    service = new PowService(serviceOpts);
  } catch (err) {
    fatal(err.message);
  }

  // Wait for backend selection (populates probeReport)
  try {
    await service.ready;
  } catch (err) {
    // probeReport is available even on failure; print it before dying
    printPreamble({
      requestedOrder,
      effectiveOrder: service._effectiveOrder,
      probeReport:    service.probeReport,
    });
    preamble(`Selected backend: none`);
    fatal(err.message);
  }

  printPreamble({
    requestedOrder,
    effectiveOrder: service._effectiveOrder,
    probeReport:    service.probeReport,
  });

  preamble(`Selected backend: ${service.backend}`);
  preamble('');

  // Generate work
  const startMs = Date.now();
  let result;
  try {
    result = await service.getProofOfWork({ hash: args.hash, threshold: args.threshold });
  } catch (err) {
    fatal(`Work generation failed (${service.backend}): ${err.message}`);
  }

  const elapsedMs = Date.now() - startMs;
  const { proofOfWork } = result;

  // Extra WASM metadata when available
  if (result.wasmBatches !== undefined) {
    preamble(`WASM batches: ${result.wasmBatches}`);
  }
  if (result.calls !== undefined) {
    preamble(`WASM calls (multi-threaded): ${result.calls}`);
  }
  if (result.iterations !== undefined) {
    preamble(`Iterations: ${result.iterations}`);
  }

  preamble(`Elapsed: ${elapsedMs} ms`);

  // Validate
  let valid = false;
  try {
    valid = validateWork({ blockHash: args.hash, work: proofOfWork, threshold: args.threshold });
  } catch (err) {
    preamble(`Validation error: ${err.message}`);
    process.exit(1);
  }

  preamble(`Validation: ${valid ? 'valid' : 'INVALID'} for threshold ${args.threshold}`);

  if (!valid) {
    preamble(`Generated work ${proofOfWork} does not meet threshold — this is a library bug.`);
    process.exit(1);
  }

  preamble('');

  // Final bare line — the work value as it appears in a Nano block
  process.stdout.write(proofOfWork + '\n');
}

main().catch((err) => {
  process.stderr.write(`Unhandled error: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
