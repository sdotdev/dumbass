import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixtureServer } from '../server.mjs';
import { exportTasks } from '../export-tasks.mjs';

const tasks = JSON.parse(await readFile(new URL('../cases/tasks.json', import.meta.url), 'utf8'));
const truth = JSON.parse(await readFile(new URL('../evaluator-only/ground-truth.json', import.meta.url), 'utf8'));

test('corpus has unique, consistent task and answer contracts', () => {
  assert.equal(tasks.version, 1);
  assert.equal(truth.version, 1);
  assert.equal(tasks.cases.length, 22);
  assert.equal(new Set(tasks.cases.map(task => task.id)).size, 22);
  assert.equal(new Set(tasks.cases.map(task => task.route)).size, 22);
  assert.equal(new Set(truth.fixtures.map(fixture => fixture.id)).size, 22);
  for (const task of tasks.cases) {
    assert.ok(['dev','validation','held-out','adversarial'].includes(task.split));
    assert.ok(['web','dashboard','mobile'].includes(task.domain));
    assert.match(task.route, /^\/app\/f\d{2}$/);
    assert.ok(task.goal.length > 30);
    assert.ok(task.viewport.width >= 320 && task.viewport.height >= 640);
    assert.ok(task.budget.maxActions > 0 && task.budget.maxSeconds > 0);
    const fixture = truth.fixtures.find(fixture => fixture.task === task.id);
    assert.ok(fixture, `Missing answer for ${task.id}`);
    assert.equal(task.route, `/app/${fixture.id}`);
    for (const issue of fixture.expected) {
      assert.ok(truth.issues[issue], `Unknown issue ${issue}`);
      assert.ok(truth.issues[issue].reproduce.length >= 2);
      assert.ok(['critical','high','medium','low'].includes(truth.issues[issue].severity));
    }
    if (task.split === 'adversarial') assert.ok(fixture.requiredBehavior);
    else assert.equal(fixture.family, task.domain);
  }
});

test('each ordinary split balances healthy and defective fixtures in every domain', () => {
  for (const split of ['dev','validation','held-out']) {
    const selected = tasks.cases.filter(task => task.split === split);
    assert.equal(selected.length, 6);
    for (const domain of ['web','dashboard','mobile']) {
      const pair = selected.filter(task => task.domain === domain).map(task => truth.fixtures.find(fixture => fixture.task === task.id));
      assert.equal(pair.length, 2);
      assert.deepEqual(pair.map(fixture => fixture.variant).sort(), ['defective','healthy']);
      assert.equal(pair[0].scenario, pair[1].scenario);
      assert.equal(pair.find(fixture => fixture.variant === 'healthy').expected.length, 0);
      assert.equal(pair.find(fixture => fixture.variant === 'defective').expected.length, 1);
    }
  }
});

test('held-out seeded defects are distinct from development and validation', () => {
  const seen = new Set(tasks.cases.filter(task => ['dev','validation'].includes(task.split)).flatMap(task => truth.fixtures.find(fixture => fixture.task === task.id).expected));
  for (const task of tasks.cases.filter(task => task.split === 'held-out')) {
    for (const issue of truth.fixtures.find(fixture => fixture.task === task.id).expected) assert.ok(!seen.has(issue));
  }
});

test('agent export defaults to development and strips evaluator metadata', async () => {
  const exported = await exportTasks();
  assert.equal(exported.length, 6);
  for (const task of exported) {
    assert.deepEqual(Object.keys(task).sort(), ['budget','goal','url','viewport']);
    assert.match(task.url, /^http:\/\/127\.0\.0\.1:4173\/app\/f\d{2}$/);
    assert.ok(!/healthy|defective|W_LABEL|D_UNIT|M_TARGET/.test(JSON.stringify(task)));
  }
  assert.equal((await exportTasks('adversarial')).length, 4);
  assert.equal((await exportTasks('held-out', 'https://example.test')).length, 6);
  await assert.rejects(exportTasks('all'), /Unknown split/);
  await assert.rejects(exportTasks('dev', 'file:///tmp'), /HTTP/);
  await assert.rejects(exportTasks('dev', 'https://user:secret@example.test'), /credentials/);
});

async function withServer(t) {
  const server = createFixtureServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('every task route renders deterministic HTML with local assets only', async t => {
  const base = await withServer(t);
  for (const task of tasks.cases) {
    const response = await fetch(base + task.route);
    assert.equal(response.status, task.id === 'adversarial-unavailable' ? 503 : 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await response.text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<main>/);
    assert.match(html, /\/assets\/app.js/);
    assert.ok(!/https?:\/\//.test(html));
    assert.ok(!/ground-truth|"expected"|"variant"|W_LABEL|D_UNIT|M_TARGET/.test(html));
    assert.equal(await (await fetch(base + task.route)).text(), html);
  }
});

test('server refuses answer files, task manifests, arbitrary paths and wrong methods', async t => {
  const base = await withServer(t);
  for (const path of ['/', '/evaluator-only/ground-truth.json','/cases/tasks.json','/server.mjs','/README.md','/.git/config','/assets/../evaluator-only/ground-truth.json','/assets/%2e%2e%2fevaluator-only/ground-truth.json','/app/f99','/app/f01/extra','/api/f19/order','/api/f01/dashboard']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'Not found');
  }
  assert.equal((await fetch(base + '/app/f01', {method:'POST'})).status, 404);
  assert.deepEqual(await (await fetch(base + '/health')).json(), {ok:true});
  for (const path of ['/assets/style.css','/assets/app.js']) assert.equal((await fetch(base + path)).status, 200);
});

test('dashboard pairs expose the intended unit and scope differences', async t => {
  const base = await withServer(t);
  const get = async (id, period = 'all') => (await fetch(`${base}/api/${id}/dashboard?period=${period}`)).json();
  assert.equal((await get('f03')).revenue, 420000);
  assert.equal((await get('f04')).revenue, 420);
  for (const id of ['f03','f04']) assert.equal((await get(id)).rows.reduce((sum, row) => sum + row.revenue, 0), 420);
  assert.equal((await get('f09','day1')).rows.length, 1);
  assert.equal((await get('f10','day1')).rows.length, 3);
  assert.equal((await get('f09','day1')).revenue, 120);
  assert.equal((await get('f10','day1')).revenue, 120);
  assert.equal((await fetch(`${base}/api/f09/dashboard?period=bad`)).status, 400);
});

test('recovery pair returns the same service failure with distinct preservation behavior', async t => {
  const base = await withServer(t);
  const post = (id, input) => fetch(`${base}/api/${id}/order`, {method:'POST', body:JSON.stringify(input)});
  const input = {street:'12 Cedar Lane',city:'Portland',postal:'97201',attempt:1};
  for (const [id, clearFields] of [['f13',true],['f14',false]]) {
    const failed = await post(id, input);
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).clearFields, clearFields);
    assert.equal((await post(id, {...input, attempt:2})).status, 200);
    assert.equal((await post(id, input)).status, 503, 'State must reset deterministically');
  }
  assert.equal((await post('f01', input)).status, 200);
  assert.equal((await post('f01', {...input, street:''})).status, 400);
  assert.equal((await post('f01', null)).status, 400);
  assert.equal((await post('f01', {...input, attempt:0})).status, 400);
  assert.equal((await fetch(`${base}/api/f01/order`, {method:'POST',body:'bad-json'})).status, 400);
  assert.equal((await fetch(`${base}/api/f01/order`, {method:'POST',body:'x'.repeat(9000)})).status, 413);
});
