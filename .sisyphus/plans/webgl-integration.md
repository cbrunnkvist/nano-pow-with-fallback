# WebGL PoW Integration Plan

## TL;DR

> **Quick Summary**: Integrate WebGL PoW backend from nano-webgl-pow repo as a third option between WebGPU and WASM in the fallback chain, add to benchmarks, and rotate table layout so contenders are rows.**Deliverables**:
> - `src/webgl-pow.js` - WebGL2-based PoW implementation with Promise wrapper
> - Updated `src/index.js` - Fallback chain: WebGPU → WebGL → WASM
> - Refactored `test/benchmark.js` - Rotated table with 3 backends as rows
> - Updated package.json exports for WebGL entry point

>**Estimated Effort**: Medium (4-6 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
User wants to integrate the WebGL PoW solution from https://github.com/numtel/nano-webgl-pow into the nanocurrency-wasm-pow repository to compare performance against existing WASM and WebGPU backends.

### Interview Summary
**Key Discussions**:
- **Fallback order**: WebGPU → WebGL → WASM (browser-only, WebGL in middle tier)
- **Table layout**: Rows = contenders (WASM, WebGPU, WebGL), columns = metrics
- **API exposure**: WebGL included in getProofOfWork() fallback chain

**Research Findings**:
- WebGL uses fragment shader (rendering) vs WebGPU's compute shader
- Browser-only (requires canvas + WebGL2 context)
- Each frame processes width × height nonces (default 512×512 = 262,144)
- Uses requestAnimationFrame (pauses in background tabs)
- Callback-based API needs Promise wrapper for consistency

### Metis Review
**Identified Gaps** (addressed):
- **Iteration counting**: frames × width × height (not just frames)
- **Callback wrapper**: Handle progress-callback abort pattern cleanly
- **Environment detection**: Browser vs Node.js detection
- **Concurrent calls**: Need internal locking mechanism
- **Memory management**: Canvas cleanup on failure

---

## Work Objectives

### Core Objective
Add WebGL as a third PoW backend option with consistent API, integrate into fallback chain, and display in benchmark comparisons.

### Concrete Deliverables
- `src/webgl-pow.js` exporting `WebGLPow` class
- Modified `src/index.js` with WebGL in fallback
- Refactored `test/benchmark.js` with rotated table
- Updated `package.json` with `/webgl`export

### Definition of Done
- [ ] `npm run benchmark` executes successfully with 3 backends
- [ ] Table shows rows for WASM, WebGPU, WebGL with correct columns
- [ ] WebGL skipped silently in Node.js (falls back to WASM)
- [ ] All three backends return valid 16-char hex nonces

### Must Have
- WebGLPow class with `async init()` and `async getProofOfWork(hash, threshold)`
- Fallback chain: WebGPU → WebGL → WASM
- Browser-only WebGL with proper environment detection
- Rotated benchmark table (rows = backends)

### Must NOT Have (Guardrails)
- NO external dependencies added (keep zero-deps)
- NO modifications to WASM or WebGPU core implementations
- NO WebGL1 support (WebGL2 only)
- NO progress callback exposure to users
- NO removal of existing benchmark metrics

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (no test framework detected)
- **Automated tests**: None (manual benchmark verification)
- **Agent-Executed QA**: YES - Node.js for environment tests, Playwright for browser tests

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Node.js**: Use Bash (node -e) — Import modules, verify signatures, test fallback
- **Browser/UI**: Use Playwright (playwright skill) — Load page, test WebGL, verify benchmark output
- **Benchmark**: Use Bash (npm run benchmark) — Run benchmark, parse output, verify table structure

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (StartImmediately — core implementation):
├── Task 1: Create WebGLPow class [quick]
├── Task 2: Add iteration tracking [quick]
└── Task 3: Fallback chain integration [quick]

Wave 2 (After Wave 1 — benchmark and testing):
├── Task 4: Benchmark table refactor [quick]
└── Task 5: Full integration testing [unspecified-high]

Critical Path: Task 1 → Task 3→ Task 4 → Task 5
```

### Agent Dispatch Summary
- **Wave 1**: **3** — T1-T2→ `quick`, T3 → `quick`
- **Wave 2**: **2** — T4 → `quick`, T5 → `unspecified-high`

---

## TODOs

- [x] 1. Create WebGLPow Class with Promise Wrapper

  **What to do**:
  - Create `src/webgl-pow.js` as ES module
  - Implement `WebGLPow` class with:
    - `constructor()` - Initialize state, no canvas yet
    - `async init()` - Create canvas, get WebGL2 context, compile shaders
    - `async getProofOfWork(hashHex, thresholdHex)` - Return 16-char hex nonce
  - Adapt nano-webgl-pow callback API to Promise-based wrapper
  - Handle progress-callback abort pattern (internal use only)
  - Add environment detection: `typeof window !== 'undefined' && window.document`
  - Throw clear error if WebGL2 unavailable
  - Track iterations as: `frames × width × height`
  - Default canvas size: 512×512 (262,144 nonces/frame)

  **Must NOT do**:
  - Do NOT expose progress callback to users
  - Do NOT add external dependencies
  - Do NOT support WebGL1

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward API wrapper implementation
  - **Skills**: [] (empty - no special skills needed)
  - **Parallelization**:
    - **Can Run In Parallel**: YES
    - **Parallel Group**: Wave 1 (with Tasks2, 3)
    - **Blocks**: Task 3, Task 5
    - **Blocked By**: None

  **References**:
  - `src/webgpu-pow.js:86-120` - Class structure pattern (constructor, init, getProofOfWork)
  - `src/webgpu-pow.js:125-260` - Proof-of-work loop pattern
  - `nano-webgl-pow.js:1-300` - WebGL implementation to adapt
  - `https://github.com/numtel/nano-webgl-pow/blob/master/nano-webgl-pow.js` - Source code

  **Acceptance Criteria**:
  - [ ] File `src/webgl-pow.js` exists and exports `WebGLPow` class
  - [ ] Class has `async init()` method returning Promise
  - [ ] Class has `async getProofOfWork(hashHex, thresholdHex)` method
  - [ ] Returns 16-char hex string on success
  - [ ] Throws on WebGL2 unavailability with clear message

  **QA Scenarios**:

  ```
  Scenario: WebGLPow class instantiation in Node.js
    Tool: Bash (node -e)
    Preconditions: Node.js environment, no browser APIs
    Steps:
      1. node -e "import('./src/webgl-pow.js').then(m => console.log(typeof m.WebGLPow))"
    Expected Result: "function"
    Failure Indicators: Error on import, module not found
    Evidence: .sisyphus/evidence/task-1-import-check.txt

  Scenario: WebGLPow throws in Node.js (no canvas)
    Tool: Bash (node -e)
    Preconditions: Node.js environment
    Steps:
      1. node -e "import('./src/webgl-pow.js').then(async m => { const w = new m.WebGLPow(); try { await w.init(); } catch(e) { console.log('OK:', e.message); } })"
    Expected Result: "OK: webgl2_required" or similar WebGL error
    Failure Indicators: No error thrown, hangs, or different error
    Evidence: .sisyphus/evidence/task-1-node-error.txt
  ```

  **Commit**: YES
  - Message: `feat(webgl): add WebGLPow class with Promise wrapper`
  - Files: `src/webgl-pow.js` (new)

---

- [x] 2. Add Iteration Tracking to WebGLPow

  **What to do**:
  - Add iteration counter to WebGLPow class
  - Track frames processed during getProofOfWork()
  - Calculate total iterations as: `frames × width × height`
  - Expose `getIterations()` method for benchmark use
  - Reset counter at start of each getProofOfWork() call

  **Must NOT do**:
  - Do NOT modify iteration calculation in WASM or WebGPU

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple counter addition
  - **Skills**: []
  - **Parallelization**:
    - **Can Run In Parallel**: YES
    - **Parallel Group**: Wave 1 (with Tasks 1, 3)
    - **Blocks**: Task 4
    - **Blocked By**: None

  **References**:
  - `test/benchmark.js:80-209` - Iteration tracking pattern in WebGPU benchmark

  **Acceptance Criteria**:
  - [ ] WebGLPow has `getIterations()` method returning number
  - [ ] Counter resets on each getProofOfWork() call
  - [ ] Returns accurate count: frames × width × height

  **QA Scenarios**:

  ```
  Scenario: Iteration counter increments correctly
    Tool: Playwright (browser test)
    Preconditions: Browser with WebGL2 support
    Steps:
      1. Load test page with WebGLPow
      2. Call webglPow.getProofOfWork(hash, threshold)
      3. Call webglPow.getIterations()
      4. Verify result > 0 and multiple of (width × height)
    Expected Result: Iterations > 0, divisible by 262144 (512×512)
    Failure Indicators: Returns 0, not divisible, or undefined
    Evidence: .sisyphus/evidence/task-2-iterations.png(screenshot)
  ```

  **Commit**: NO (groups with Task 1)

---

- [x] 3. Integrate WebGL into Fallback Chain

  **What to do**:
  - Modify `src/index.js` to import WebGLPow
  - Add WebGL detection: `typeof window !== 'undefined' && document.createElement`
  - Update fallback chain: try WebGPU → try WebGL → fall back to WASM
  - Handle WebGL initialization failure (shader compile error, etc.)
  - Log appropriate warnings on fallback
  - Export WebGLPow class from index.js

  **Must NOT do**:
  - Do NOT modify WASM or WebGPU implementation
  - Do NOT change existing API signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple import and conditional logic
  - **Skills**: []
  - **Parallelization**:
    - **Can Run In Parallel**: NO
    - **Parallel Group**: Wave1 (depends on Task 1)
    - **Blocks**: Task 5
    - **Blocked By**: Task 1

  **References**:
  - `src/index.js:1-26` - Current entry point and fallback pattern
  - `src/webgpu-pow.js:86-123` - Pattern for GPU initialization

  **Acceptance Criteria**:
  - [ ] `src/index.js` imports WebGLPow
  - [ ] Fallback order: WebGPU → WebGL → WASM
  - [ ] WebGL silently skipped in Node.js
  - [ ] Falls back to WASM if WebGL fails
  - [ ] Console warnings on fallback

  **QA Scenarios**:

  ```
  Scenario: Fallback chain in Node.js (skips WebGL)
    Tool: Bash (node -e)
    Preconditions: Node.js environment
    Steps:
      1. node -e "import('./src/index.js').then(async m => { const r = await m.getProofOfWork({hash: 'BD9F737DDECB0A34DFBA0EDF7017ACB0EF0AA04A6F7A73A406191EF80BB20000', threshold: 'fffffe0000000000'}); console.log(r.length); })"
    Expected Result: "16" (valid nonce from WASM)
    Failure Indicators: Error, or non-16-length result
    Evidence: .sisyphus/evidence/task-3-node-fallback.txt

  Scenario: Fallback chain in browser (tries WebGL)
    Tool: Playwright
    Preconditions: Browser with WebGL2 but no WebGPU
    Steps:
      1. Mock navigator.gpu = undefined
      2. Load page with getProofOfWork
      3. Call getProofOfWork
      4. Verify console shows "WebGPU failed, trying WebGL"
    Expected Result: WebGL is attempted, returns valid nonce
    Failure Indicators: No WebGL attempt, or error
    Evidence: .sisyphus/evidence/task-3-browser-fallback.png
  ```

  **Commit**: YES
  - Message: `feat(webgl): integrate into fallback chain`
  - Files: `src/index.js`

---

- [ ] 4. Refactor Benchmark Table Layout

  **What to do**:
  - Modify `test/benchmark.js` to rotate table structure
  - Rows: WASM, WebGPU, WebGL (one row per backend)
  - Columns: Threshold, Type, Avg HashRate, Range, Speedup
  - Add WebGL benchmark run with iteration tracking
  - Calculate WebGL iterations as: frames × width × height
  - Update output formatting for new table layout

  **Must NOT do**:
  - Do NOT remove existing benchmark metrics
  - Do NOT change test cases (threshold, hash)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Table formatting refactor
  - **Skills**: []
  - **Parallelization**:
    - **Can Run In Parallel**: NO
    - **Parallel Group**: Wave 2
    - **Blocks**: Task 5
    - **Blocked By**: Task 2

  **References**:
  - `test/benchmark.js:212-336` - Current benchmark structure and table output
  - `test/benchmark.js:54-78` - WASM benchmark iteration pattern
  - `test/benchmark.js:80-210` - WebGPU benchmark iteration pattern

  **Acceptance Criteria**:
  - [ ] Table has 3 rows: WASM, WebGPU, WebGL
  - [ ] Columns include: Implementation, Time, HashRate, Speedup
  - [ ] WebGL iteration count correctly calculated
  - [ ] Benchmark runs 5 iterations per backend per threshold

  **QA Scenarios**:

  ```
  Scenario: Benchmark outputs rotated table
    Tool: Bash (npm run benchmark)
    Preconditions: Node.js environment
    Steps:
      1. npm run benchmark 2>&1 | head -50
      2. Check output contains "WASM", "WebGPU", "WebGL" as rows
      3. Check output has columns with hash rates
    Expected Result: Table with 3 rows, proper columns
    Failure Indicators: Missing WebGL row, wrong column structure
    Evidence: .sisyphus/evidence/task-4-table-output.txt
  ```

  **Commit**: YES
  - Message: `refactor(bench): rotate table layout for multi-backend`
  - Files: `test/benchmark.js`

---

- [ ] 5. Full Integration Testing

  **What to do**:
  - Run full benchmark suite
  - Verify all 3 backends produce valid nonces
  - Verify table structure is correct
  - Test fallback chain in both Node.js and browser
  - Test WebGL failure scenarios (no WebGL2 context)
  - Verify iteration counts are reasonable

  **Must NOT do**:
  - Do NOT change any implementation code
  - Do NOT modify test cases

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive testing across environments
  - **Skills**: [`playwright`]
    - `playwright`: Browser testing for WebGL functionality

  **Parallelization**:
    - **Can Run In Parallel**: NO
    - **Parallel Group**: Wave 2(after Task 4)
    - **Blocks**: Final Verification
    - **Blocked By**: Task 3, Task 4

  **References**:
  - `test/benchmark.js` - Full benchmark to run
  - `test/verify-pow.js` - PoW verification utility

  **Acceptance Criteria**:
  - [ ] `npm run benchmark` completes successfully
  - [ ] All 3 backends show in table
  - [ ] All nonces are valid (pass verification)
  - [ ] WebGL skipped in Node.js, active in browser

  **QA Scenarios**:

  ```
  Scenario: Full benchmark run
    Tool: Bash (npm run benchmark)
    Preconditions: All implementation complete
    Steps:
      1. npm run benchmark
      2. Check exit code is 0
      3. Verify table has 3 rows2 test thresholds
    Expected Result: Clean run with 6 rows (3 backends ×2 thresholds)
    Failure Indicators: Error, missing rows, invalid results
    Evidence: .sisyphus/evidence/task-5-full-benchmark.txt

  Scenario: WebGL in browser
    Tool: Playwright
    Preconditions: Browser with WebGL2
    Steps:
      1. Load local test page
      2. Import WebGLPow
      3. Call getProofOfWork
      4. Verify 16-char hex result
    Expected Result: Valid 16-char hex nonce
    Failure Indicators: Error, wrong length, invalid characters
    Evidence: .sisyphus/evidence/task-5-browser-webgl.png
  ```

  **Commit**: NO (testing only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify all deliverables exist. Check evidence files in `.sisyphus/evidence/`. Compare against plan.Must Have [4/4] | Must NOT Have [5/5] | Tasks [5/5] | VERDICT: APPROVE/REJECT

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run benchmark` successfully. Review src/webgl-pow.js for: `as any`/`@ts-ignore`, empty catches, console.log in prod. Check API consistency with WebGPUPow. Verify browser-only detection.

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Run benchmark in both Node.js and browser. Verify WebGL is skipped in Node, active in browser. Verify table shows 3 backends as rows. Test fallback chain works.

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance.

---

## Commit Strategy

- **Commit 1**: `feat(webgl): add WebGLPow class with Promise wrapper` — src/webgl-pow.js
- **Commit 2**: `feat(webgl): integrate into fallback chain` — src/index.js
- **Commit 3**: `refactor(bench): rotate table layout for multi-backend` — test/benchmark.js
- **Commit 4**: `chore: add WebGL export to package.json` — package.json

---

## Success Criteria

### Verification Commands
```bash
# Node.js: Verify WebGL is skipped
node -e "const { getProofOfWork } = require('./src/index.js'); console.log('WebGL skipped in Node.js');"

# Browser: Load benchmark and verify table
npm run benchmark
# Expected: Table with 3 rows (WASM, WebGPU, WebGL)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Benchmark runs successfully
- [ ] Table shows 3 backends as rows
- [ ] WebGL skipped in Node.js