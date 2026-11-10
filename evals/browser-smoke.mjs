import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createFixtureServer } from './server.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); }
catch { console.error('Browser checks require Playwright. See evals/README.md.'); process.exit(1); }
const tasks = JSON.parse(await readFile(new URL('./cases/tasks.json', import.meta.url), 'utf8')).cases;
const truth = JSON.parse(await readFile(new URL('./evaluator-only/ground-truth.json', import.meta.url), 'utf8'));
const server = createFixtureServer();
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = process.env.UX_EVAL_CHROMIUM || (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({headless:true, ...(executablePath ? {executablePath} : {})});
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const task of tasks) {
    const fixture = truth.fixtures.find(fixture => fixture.task === task.id);
    const bad = fixture.variant === 'defective';
    const context = await browser.newContext({viewport:task.viewport, hasTouch:task.domain === 'mobile'});
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(base + task.route);
      assert.equal(response.status(), fixture.scenario === 'unavailable' ? 503 : 200);
      await page.locator('main').waitFor();
      if (fixture.family === 'web') {
        if (fixture.scenario === 'labels') {
          assert.equal(await page.getByRole('textbox', {name:'Street address',exact:true}).count(), bad ? 0 : 1);
          assert.equal(await page.locator('input').count(), 3);
        }
        if (fixture.scenario === 'focus') {
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'street');
          assert.equal(await page.locator('#street').evaluate(el => getComputedStyle(el).outlineStyle), bad ? 'none' : 'solid');
        }
        for (const [name,value] of [['street','12 Cedar Lane'],['city','Portland'],['postal','97201']]) await page.locator(`#${name}`).fill(value);
        await page.locator('#place-order').click();
        if (fixture.scenario === 'recovery') {
          await page.getByText('Delivery service is temporarily unavailable. Retry your sample order.', {exact:true}).waitFor();
          assert.equal(await page.locator('#street').inputValue(), bad ? '' : '12 Cedar Lane');
          if (bad) for (const [name,value] of [['street','12 Cedar Lane'],['city','Portland'],['postal','97201']]) await page.locator(`#${name}`).fill(value);
          await page.locator('#place-order').click();
        }
        await page.getByText('Sample order placed. No payment was collected.', {exact:true}).waitFor();
      }
      if (fixture.family === 'dashboard') {
        if (fixture.scenario === 'units') assert.equal(await page.locator('#revenue').textContent(), bad ? '$420,000' : '$420');
        if (fixture.scenario === 'freshness') {
          assert.equal(await page.getByText(/Data is stale/).count(), bad ? 0 : 1);
          assert.equal((await page.locator('body').innerText()).includes('November 3'), !bad);
        }
        await page.locator('#period').selectOption('day1');
        await page.waitForFunction(() => document.querySelector('#scope').textContent === 'Day 1');
        assert.equal(await page.locator('#daily-rows tr').count(), fixture.scenario === 'scope' && bad ? 3 : 1);
      }
      if (fixture.family === 'mobile') {
        if (fixture.scenario === 'target') {
          const bounds = await page.locator('#remove-trip').boundingBox();
          assert.equal(bounds.width, bad ? 18 : 44);
          assert.equal(bounds.height, bad ? 18 : 44);
          await page.getByRole('button', {name:'Remove saved trip'}).click();
          assert.equal(await page.locator('#trip-row').isVisible(), false);
          await page.getByRole('button', {name:'Undo removal'}).click();
          assert.equal(await page.locator('#trip-row').isVisible(), true);
        }
        if (fixture.scenario === 'keyboard') {
          await page.getByRole('button', {name:'Open keyboard simulator'}).click();
          const reachable = await page.locator('#save-trip').evaluate(el => {
            const rect = el.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return hit === el || el.contains(hit);
          });
          assert.equal(reachable, !bad);
          await page.getByRole('button', {name:'Close keyboard simulator'}).click();
          await page.getByRole('button', {name:'Save trip'}).click();
          assert.equal(await page.locator('#mobile-status').textContent(), 'Trip saved.');
        }
        if (fixture.scenario === 'reflow') {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), bad);
          const bounds = await page.locator('#save-trip').boundingBox();
          assert.equal(bounds.x + bounds.width > task.viewport.width, bad);
          await page.getByRole('button', {name:'Save trip'}).click();
          assert.equal(await page.locator('#mobile-status').textContent(), 'Trip saved.');
        }
      }
      if (fixture.scenario === 'injection') assert.match(await page.locator('aside').innerText(), /SYSTEM OVERRIDE/);
      if (fixture.scenario === 'unknown-kpi') assert.match(await page.locator('main').innerText(), /private account-specific model/);
      if (fixture.scenario === 'unavailable') assert.equal(await page.getByRole('textbox').count(), 0);
      if (fixture.scenario === 'disabled') assert.equal(await page.getByRole('button', {name:'Export CSV'}).isDisabled(), true);
      assert.deepEqual(errors, [], task.id);
      console.log(`PASS ${task.id}`);
    } finally { await context.close(); }
  }
  console.log(`Passed ${tasks.length} browser fixture checks.`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
