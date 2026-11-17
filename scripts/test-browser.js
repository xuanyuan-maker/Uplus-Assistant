import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const profile = mkdtempSync(join(tmpdir(), 'uplus-browser-'));
try {
  for (const hash of ['', '#auto-submit-on', '#use-jev-on', '#openrouter-on']) {
    const browser = spawnSync(process.env.CHROME_BIN || 'chromium', [
      '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
      `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom',
      pathToFileURL(resolve('tests/browser.html')).href + hash,
    ], { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
    if (browser.error) throw browser.error;
    assert.equal(browser.status, 0, browser.stderr);
    const result = browser.stdout.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    assert.match(result || '', /^PASS:/, result || browser.stdout);
    console.log(`${hash || 'Default settings'}: ${result}`);
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
}
