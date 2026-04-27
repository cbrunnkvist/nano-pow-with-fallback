/**
 * Tiny namespace-based debug logger keyed off the DEBUG environment variable.
 *
 * Usage:
 *   import { makeDebug } from './debug.js';
 *   const debug = makeDebug('nano-pow:wasm');
 *   debug('batch miss, nonce was zero');
 *
 * Enable with:
 *   DEBUG=nano-pow:*          — all namespaces
 *   DEBUG=nano-pow:wasm       — single namespace
 *   DEBUG=nano-pow:wasm,nano-pow:fallback  — multiple
 */

function buildMatcher(debugEnv) {
  if (!debugEnv) return () => false;

  const patterns = debugEnv.split(',').map((raw) => {
    const trimmed = raw.trim();
    // Convert glob-style '*' to a regex
    const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });

  return (ns) => patterns.some((re) => re.test(ns));
}

const isEnabled = buildMatcher(
  typeof process !== 'undefined' ? process.env.DEBUG : ''
);

export function makeDebug(namespace) {
  if (!isEnabled(namespace)) return () => {};
  return (...args) => {
    const ts = new Date().toISOString();
    process.stderr.write(`[${ts}] ${namespace} ${args.join(' ')}\n`);
  };
}
