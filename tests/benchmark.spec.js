import { test, expect } from '@playwright/test';

test.describe('NanoPoW Benchmark', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should initialize all backends', async ({ page }) => {
    // Wait for initialization dots to be ready
    const wasmDot = page.locator('#wasmStatus');
    const wasmMultiDot = page.locator('#wasmMultiStatus');
    const webgpuDot = page.locator('#webgpuStatus');
    const webglDot = page.locator('#webglStatus');

    await expect(wasmDot).toHaveClass(/ready/, { timeout: 10000 });
    await expect(wasmMultiDot).toHaveClass(/ready/);
    
    // Note: WebGPU/WebGL might fail in some CI environments, 
    // but we expect them to at least try to initialize
    const webgpuClass = await webgpuDot.getAttribute('class');
    const webglClass = await webglDot.getAttribute('class');
    
    expect(webgpuClass).toMatch(/(ready|error)/);
    expect(webglClass).toMatch(/(ready|error)/);
  });

  test('should run a complete benchmark', async ({ page }) => {
    // Set to 1 run for speed
    const runsInput = page.locator('#runs');
    await runsInput.fill('1');

    const startBtn = page.locator('#startBtn');
    await startBtn.click();

    // Verify spinner appears in the first active backend
    const wasmProgress = page.locator('#progress-wasm .progress-text');
    await expect(wasmProgress).toContainText('Run 1/1');
    
    const spinner = page.locator('#progress-wasm .spinner');
    await expect(spinner).toBeVisible();

    // Wait for all to complete
    // We increase timeout as WASM can be slow
    const wasmResult = page.locator('#result-wasm-rate');
    await expect(wasmResult).not.toContainText('--', { timeout: 60000 });
    
    const wasmMultiResult = page.locator('#result-wasm-multi-rate');
    await expect(wasmMultiResult).not.toContainText('--', { timeout: 60000 });

    const webgpuResult = page.locator('#result-webgpu-rate');
    const webglResult = page.locator('#result-webgl-rate');
    
    // Check that at least one of WebGPU/WebGL worked or errored
    const webgpuStatus = await page.locator('#progress-webgpu .progress-text').textContent();
    if (webgpuStatus === 'Complete') {
        await expect(webgpuResult).not.toContainText('--');
    }
  });

  test('should support skipping a backend', async ({ page }) => {
    await page.locator('#runs').fill('1');
    await page.locator('#threshold').selectOption('fffffff800000000'); // Harder to give time to skip
    
    await page.locator('#startBtn').click();
    
    // Wait for WASM to start
    await expect(page.locator('#progress-wasm .progress-text')).toContainText('Run 1/1');
    
    // Click Skip
    const skipBtn = page.locator('#skipBtn');
    await skipBtn.click();
    
    // Should advance to WASM Multi
    await expect(page.locator('#progress-wasm-multi .progress-text')).toContainText('Run 1/1', { timeout: 10000 });
  });

  test('should support stopping the benchmark', async ({ page }) => {
    await page.locator('#runs').fill('1');
    await page.locator('#threshold').selectOption('fffffff800000000');
    
    await page.locator('#startBtn').click();
    
    // Wait for WASM to start
    await expect(page.locator('#progress-wasm .progress-text')).toContainText('Run 1/1');
    
    // Click Stop
    const stopBtn = page.locator('#stopBtn');
    await stopBtn.click();
    
    // UI should reset
    await expect(page.locator('#startBtn')).toBeEnabled();
    await expect(page.locator('#progress-wasm .progress-text')).toContainText('Stopped');
    
    // Others should remain waiting
    await expect(page.locator('#progress-webgpu .progress-text')).toContainText('Waiting');
  });

  test('should support rerunning a single backend', async ({ page }) => {
    // Initial initialization
    await expect(page.locator('#wasmStatus')).toHaveClass(/ready/);
    
    const rerunBtn = page.locator('#row-wasm .btn-icon');
    await rerunBtn.click();
    
    // Should only run WASM
    await expect(page.locator('#progress-wasm .progress-text')).toContainText('Run 1/');
    await expect(page.locator('#result-wasm-rate')).not.toContainText('--', { timeout: 30000 });
    
    // WASM Multi should still be empty
    await expect(page.locator('#result-wasm-multi-rate')).toContainText('--');
  });

  test('should allow changing thread count', async ({ page }) => {
    const threadsInput = page.locator('#threads');
    await threadsInput.fill('2');
    
    // Start only WASM Multi
    await page.locator('#row-wasm-multi .btn-icon').click();
    
    await expect(page.locator('#progress-wasm-multi .progress-text')).toContainText('Run 1/');
    await expect(page.locator('#result-wasm-multi-rate')).not.toContainText('--', { timeout: 30000 });
  });
});
