# Web Benchmark UI Plan

## TL;DR

> **Quick Summary**: Create a browser-based benchmark UI that runs WASM, WebGPU, and WebGL PoW tests with interactive controls (start/stop/skip) using HTMX, displaying results in a gorgeous clean HTML table.

> **Deliverables**:
> - `benchmark.html` - Main benchmark page with HTMX interactivity
> - `benchmark-server.js` - Simple static file server for testing
> - Real-time progress tracking for each backend

> **Estimated Effort**: Medium (2-4hours)
> **Parallel Execution**: YES - HTML and server can be built in parallel
> **Critical Path**: HTML → Server → Testing

---

## Context

###Original Request
User wants a web version of benchmarks with same tests but in gorgeous basic HTML. Use HTMX for interactivity (start/stop/skip buttons, rerun specific backends).

### CurrentState
- WebGL integration complete: `src/webgl-pow.js`, `src/index.js`
- Node.js benchmark updated: `test/benchmark.js`
- All three backends (WASM, WebGPU, WebGL) working

### Key Requirements
- **Same tests**: Open/Receive (~1M hashes) and Send/Change (~8M hashes)
- **Same report structure**: Rows = backends, columns = metrics
- **HTMX interactivity**:
  - Start button (begin all benchmarks)
  - Stop button (halt current benchmark)
  - Skip button (skip current backend, continue to next)
  - Rerun button (rerun specific backend)
- **Gorgeous basic HTML**: Clean, minimal, attractive
- **Real-time progress**: Live updates during benchmark runs

---

## Work Objectives

### Core Objective
Create a browser-based benchmark UI that allows interactive testing of all three PoW backends with real-time progress updates and the ability to control execution.

### Concrete Deliverables
- `benchmark.html` with embedded CSS and HTMX
- `benchmark-server.js` (simple Express/static server)
- Progress tracking for each backend
- Results comparison table

### Definition of Done
- [ ] HTML page loads and displays benchmark controls
- [ ] Start button runs all three backends sequentially
- [ ] Stop button halts current benchmark
- [ ] Skip button jumps to next backend
- [ ] Rerun button retests specific backend
- [ ] Results display in clean table format
- [ ] Works in modern browsers (Chrome, Firefox, Safari)

### Must Have
- All three backends testable: WASM, WebGPU, WebGL
- HTMX-based interactivity (no complex JS framework)
- Clear visual feedback during benchmark
- Clean, minimal HTML/CSS design

### Must NOT Have (Guardrails)
- NO complex build system (keep it simple)
- NO Node.js bundler (use ES modules directly)
- NO external CSS framework (custom minimal CSS)
- NO unnecessary dependencies (only HTMX CDN)

---

## Implementation Plan

### Task Breakdown

---

- [x] 1. Create Benchmark HTML Structure (quick)

  **What to do**:
  - Create `benchmark.html` in project root
  - Include HTMX from CDN
  - Include all three backend scripts (WASM, WebGPU, WebGL)
  - Create basic layout: header, controls, progress area, results table
  - Add minimal CSS for clean design

  **Must Have**:
  - Clean, semantic HTML structure
  - HTMX attributes for interactivity
  - Progress indicators for each backend
  - Results table with proper columns

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`,`documentation-lookup`]
  - **Parallelization**: YES- can run with Task 2

  **Commit**: YES- `feat(ui): add web benchmark HTML page`

---

- [x] 2. Implement Benchmark Logic Module (quick)

  **What to do**:
  - Create `src/benchmark-runner.js` as ES module
  - Export `runBenchmark(backend, hash, threshold, onProgress)`
  - Implement progress callback for real-time updates
  - Handle stop/skip functionality with AbortController pattern
  - Support all three backends (WASM, WebGPU, WebGL)

  **Must Have**:
  - Promise-based benchmark runner
  - Progress callback (iterations, hashRate)
  - AbortController support for stop/skip
  - Consistent API across all backends

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Parallelization**: YES- can run with Task 1

  **Commit**: YES- ` feat(benchmark): add benchmark runner module`

---

- [x] 3. Wire HTMX to Benchmark Logic (quick)

  **What to do**:
  - Add HTMX event handlers to HTML
  - Connect Start button to `runAllBenchmarks()`
  - Connect Stop button to abort controller
  - Connect Skip button to skip current backend
  - Connect Rerun button to run specific backend
  - Update progress indicators during execution
  - Populate results table on completion

  **Must Have**:
  - Start runs all backends sequentially
  - Stop halts current benchmark immediately
  - Skip jumps to next backend
  - Rerun retests specific backend
  - Progress updates in real-time

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`documentation-lookup`] (HTMX docs)

  **Commit**: YES- `feat(ui): wire HTMX to benchmark logic`

---

- [x] 4. Create Simple Dev Server (quick)

  **What to do**:
  - Create `benchmark-server.js` using Express or http-server
  - Serve static files from project root
  - Enable ES modules support
  - Add CORS headers if needed
  - Document how to run in README

  **Must Have**:
  - `node benchmark-server.js` starts server
  - Serves `benchmark.html` at `/`
  - Serves all source files correctly
  - Works with browser ES modules

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Commit**: YES- `chore: add benchmark dev server`

---

- [x] 5. Test andDocument

  **What to do**:
  - Run full benchmark in Chrome, Firefox, Safari
  - Verify all three backends work
  - Verify stop/skip/rerun functionality
  - Update README with benchmark instructions
  - Add screenshot to docs

  **Must Have**:
  - Benchmark runs successfully in all browsers
  - Controls work as expected
  - Documentation updated

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Commit**: YES- `docs: add web benchmark documentation`

---

## UI Design Specification

### Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│Nano PoW Benchmark                        [Start] [Stop] │
├─────────────────────────────────────────────────────────┤
│ Configuration                                           │
│ Threshold: [fffffe0000000000 ▼]  Runs: [5]             │
├─────────────────────────────────────────────────────────┤
│ Progress                                                │
│ ████████████████████░░░░░░░░░░░░░░░ WebGPU 45%         │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ WebGL waiting...   │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ WASM waiting...     │
├─────────────────────────────────────────────────────────┤
│ Results                                                 │
│ ┌─────────────┬──────────┬──────────┬──────────┬─────┐│
│ │ Backend     │ AvgRate  │ Range    │ Speedup  │ Act ││
│ ├─────────────┼──────────┼──────────┼──────────┼─────┤│
│ │ WASM        │ 7.15MH/s │ 1.98-10.6│ 1.0x     │[↻]  ││
│ │ WebGPU      │92.53MH/s │ 82.2-99.9│ 12.9x    │[↻]  ││
│ │ WebGL       │ --       │ --       │ --       │[↻]  ││
│ └─────────────┴──────────┴──────────┴──────────┴─────┘│
└─────────────────────────────────────────────────────────┘
```

### ColorScheme
- Background: `#fafafa` (light gray)
- Primary: `#2563eb` (blue)
- Success: `#16a34a` (green)
- Warning: `#ca8a04` (amber)
- Error: `#dc2626` (red)
- Border: `#e5e7eb` (gray)

### Controls
- **Start**: Begins benchmark from current position
- **Stop**: Aborts current backend, shows partial results
- **Skip**: Jumps to next backend (only during execution)
- **Rerun [↻]**: Retests specific backend

---

## HTMX Patterns

### Start Button
```html
<button hx-post="/benchmark/start"
        hx-target="#results"
        hx-indicator="#progress">
  Start Benchmark
</button>
```

### Progress Updates
```html
<div id="progress" hx-ext="sse" sse-connect="/benchmark/progress">
  <div sse-swap="message">Waiting...</div>
</div>
```

### Rerun Button
```html
<button hx-post="/benchmark/rerun/wasm"
        hx-target="#results"
        hx-include="#config">
  ↻
</button>
```

---

## Final Verification

- [ ] F1. Run HTML benchmark in browser
- [ ] F2. Verify all three backends produce valid nonces
- [ ] F3. Test stop/skip/rerun controls
- [ ] F4. Check cross-browser compatibility

---

## Success Criteria

```bash
# Start dev server
node benchmark-server.js

# Open browser
open http://localhost:3000/benchmark.html

# Run benchmark
# Expected: All three backends show results
```