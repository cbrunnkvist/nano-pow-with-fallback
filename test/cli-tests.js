/**
 * test/cli-tests.js
 *
 * Tests for the bin/nano-pow-with-fallback.js CLI.
 * Spawns the CLI as a child process and inspects stdout/stderr/exit code.
 *
 * Run with: node test/cli-tests.js
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const CLI           = path.join(__dirname, '../bin/nano-pow-with-fallback.js');
const NODE          = process.execPath;

const GOOD_HASH      = 'BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000';
const GOOD_THRESHOLD = 'fffffe0000000000';

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

async function runCLI(args, env = {}) {
  try {
    const result = await execFileAsync(NODE, [CLI, ...args], {
      env: { ...process.env, ...env },
      timeout: 90_000,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    return {
      exitCode: err.code ?? 1,
      stdout:   err.stdout ?? '',
      stderr:   err.stderr ?? '',
    };
  }
}

// Last non-empty line of stdout — should be the bare work hex
function lastLine(stdout) {
  return stdout.trim().split('\n').filter(Boolean).at(-1) ?? '';
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function run() {
  console.log('\n=== CLI tests ===\n');

  // -------------------------------------------------------------------------
  // --help
  // -------------------------------------------------------------------------
  console.log('-- --help --');
  {
    const r = await runCLI(['--help']);
    ok('exits 0',              r.exitCode === 0);
    ok('mentions --hash',      r.stdout.includes('--hash'));
    ok('mentions --threshold', r.stdout.includes('--threshold'));
    ok('mentions --backends',  r.stdout.includes('--backends'));
    ok('mentions default order', r.stdout.includes('webgpu, webgl, wasm'));
    ok('mentions DEBUG',       r.stdout.includes('DEBUG'));
  }

  // -------------------------------------------------------------------------
  // Missing required args
  // -------------------------------------------------------------------------
  console.log('\n-- Missing required args --');
  {
    const r = await runCLI([]);
    ok('exits non-zero when no args', r.exitCode !== 0);
  }
  {
    const r = await runCLI(['--threshold', GOOD_THRESHOLD]);
    ok('exits non-zero when --hash missing', r.exitCode !== 0);
  }
  {
    const r = await runCLI(['--hash', GOOD_HASH]);
    ok('exits non-zero when --threshold missing', r.exitCode !== 0);
  }

  // -------------------------------------------------------------------------
  // Invalid arg values
  // -------------------------------------------------------------------------
  console.log('\n-- Invalid arg values --');
  {
    const r = await runCLI(['--hash', 'tooshort', '--threshold', GOOD_THRESHOLD]);
    ok('exits non-zero for short hash', r.exitCode !== 0);
  }
  {
    const r = await runCLI(['--hash', GOOD_HASH, '--threshold', 'tooshort']);
    ok('exits non-zero for short threshold', r.exitCode !== 0);
  }
  {
    const r = await runCLI(['--hash', GOOD_HASH, '--threshold', GOOD_THRESHOLD, '--backends', 'cosmic']);
    ok('exits non-zero for unknown backend name', r.exitCode !== 0);
  }

  // -------------------------------------------------------------------------
  // --backends filtering
  // -------------------------------------------------------------------------
  console.log('\n-- --backends preamble lines --');
  {
    const r = await runCLI(['--hash', GOOD_HASH, '--threshold', GOOD_THRESHOLD, '--backends', 'wasm']);
    ok('exits 0 with --backends wasm',              r.exitCode === 0);
    ok('preamble shows default order',              r.stdout.includes('Default backend priority:'));
    ok('preamble shows requested order',            r.stdout.includes('Requested backend priority: wasm'));
    ok('preamble shows effective order: wasm',      r.stdout.includes('Effective backend priority: wasm'));
    ok('webgpu shown as skipped',                   r.stdout.includes('Probe webgpu: skipped'));
    ok('webgl shown as skipped',                    r.stdout.includes('Probe webgl: skipped'));
    ok('wasm shown as available',                   r.stdout.includes('Probe wasm: available'));
    ok('Selected backend: wasm',                    r.stdout.includes('Selected backend: wasm'));
  }

  // -------------------------------------------------------------------------
  // Default order preamble (no --backends)
  // -------------------------------------------------------------------------
  console.log('\n-- Default order preamble --');
  {
    const r = await runCLI(['--hash', GOOD_HASH, '--threshold', GOOD_THRESHOLD]);
    ok('exits 0',                                   r.exitCode === 0);
    ok('preamble shows default order line',         r.stdout.includes('Default backend priority:  webgpu, webgl, wasm'));
    ok('shows "(none — using default)" for requested', r.stdout.includes('none'));
    ok('webgpu shown as unavailable in Node',       r.stdout.includes('Probe webgpu: unavailable'));
    ok('webgl shown as unavailable in Node',        r.stdout.includes('Probe webgl: unavailable'));
    ok('Selected backend: wasm',                    r.stdout.includes('Selected backend: wasm'));
  }

  // -------------------------------------------------------------------------
  // Successful work generation output shape
  // -------------------------------------------------------------------------
  console.log('\n-- Successful work output shape --');
  {
    const r = await runCLI(['--hash', GOOD_HASH, '--threshold', GOOD_THRESHOLD, '--backends', 'wasm']);
    ok('exits 0',                          r.exitCode === 0);
    ok('includes Validation: valid line',  r.stdout.includes('Validation: valid'));
    ok('includes Elapsed: line',           r.stdout.includes('Elapsed:'));

    const work = lastLine(r.stdout);
    ok('final line is 16-char string',     work.length === 16);
    ok('final line is hex',                /^[0-9a-f]{16}$/.test(work));
    ok('final line is not all-zeros',      work !== '0000000000000000');
  }

  // -------------------------------------------------------------------------
  // WASM batch count reported
  // -------------------------------------------------------------------------
  console.log('\n-- WASM batch count --');
  {
    const r = await runCLI(['--hash', GOOD_HASH, '--threshold', GOOD_THRESHOLD, '--backends', 'wasm']);
    ok('preamble includes WASM batches line', r.stdout.includes('WASM batches:'));
  }

  // -------------------------------------------------------------------------
  // DEBUG output goes to stderr, does not pollute stdout
  // -------------------------------------------------------------------------
  console.log('\n-- DEBUG output on stderr only --');
  {
    const r = await runCLI(
      ['--hash', GOOD_HASH, '--threshold', GOOD_THRESHOLD, '--backends', 'wasm'],
      { DEBUG: 'nano-pow:*' }
    );
    ok('exits 0 with DEBUG set',            r.exitCode === 0);
    ok('stderr contains debug trace',       r.stderr.includes('nano-pow:'));
    ok('final stdout line is still 16-hex', /^[0-9a-f]{16}$/.test(lastLine(r.stdout)));
  }

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
