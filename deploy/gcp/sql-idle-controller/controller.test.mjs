import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedIdle, evaluate, IDLE_MS, METRIC_DELAY_MS } from './controller.mjs';

const now = Date.parse('2026-10-03T18:00:00Z');
const config = { project: 'project', instance: 'instance', database: 'employee_app', app: 'employee-app', dryRun: false };
function series() {
  return [{ metric: { labels: { database: 'employee_app' } }, points: Array.from({ length: 19 }, (_, i) => ({
    interval: { endTime: new Date(now - IDLE_MS - METRIC_DELAY_MS + i * 60_000).toISOString() }, value: { int64Value: '0' },
  })) }];
}
test('requires 15 continuous minutes and fresh telemetry', () => {
  assert.equal(confirmedIdle(series(), now, 'employee_app'), true);
  assert.equal(confirmedIdle([], now, 'employee_app'), false);
  const gap = series(); gap[0].points.splice(3, 2);
  assert.equal(confirmedIdle(gap, now, 'employee_app'), false);
  const stale = series(); stale[0].points.splice(15);
  assert.equal(confirmedIdle(stale, now, 'employee_app'), false);
  const short = series(); short[0].points.shift();
  assert.equal(confirmedIdle(short, now, 'employee_app'), false);
});
test('connections, including idle pooled connections, prevent shutdown', () => {
  const active = series(); active[0].points[5].value.int64Value = '1';
  assert.equal(confirmedIdle(active, now, 'employee_app'), false);
  const other = series(); other.push({ metric: { labels: { database: 'postgres' } }, points: [{ value: { int64Value: '1' } }] });
  assert.equal(confirmedIdle(other, now, 'employee_app'), false);
  other[1].metric.labels.database = 'cloudsqladmin';
  assert.equal(confirmedIdle(other, now, 'employee_app'), true);
});
function fake({ stopped = false, traffic = false, metrics = series(), recheckTraffic = false, state = 'RUNNABLE' } = {}) {
  const writes = []; let logCalls = 0;
  return { writes, api: async (url, body, method) => {
    if (method === 'PATCH') { writes.push(body); return { name: 'operation' }; }
    if (url.includes('sqladmin')) return { state, settings: { activationPolicy: stopped ? 'NEVER' : 'ALWAYS', settingsVersion: '123' } };
    if (url.includes('logging')) { logCalls++; return { entries: traffic || (logCalls > 1 && recheckTraffic) ? [{ timestamp: new Date(now).toISOString() }] : [] }; }
    return { timeSeries: metrics };
  } };
}
test('stops only confirmed idle instances using optimistic settings version', async () => {
  const f = fake(); assert.equal((await evaluate(f.api, config, now)).action, 'stop');
  assert.deepEqual(f.writes, [{ settings: { activationPolicy: 'NEVER', settingsVersion: '123' } }]);
});
test('app activity, returning traffic and missing data prevent stops', async () => {
  for (const options of [{ traffic: true }, { metrics: [] }, { recheckTraffic: true }, { state: 'MAINTENANCE' }]) {
    const f = fake(options); assert.equal((await evaluate(f.api, config, now)).action, 'skip'); assert.equal(f.writes.length, 0);
  }
});
test('stopped instances restart on traffic and otherwise remain stopped', async () => {
  const f = fake({ stopped: true, traffic: true }); assert.equal((await evaluate(f.api, config, now)).action, 'start');
  assert.equal(f.writes[0].settings.activationPolicy, 'ALWAYS');
  const idle = fake({ stopped: true }); assert.equal((await evaluate(idle.api, config, now)).action, 'skip'); assert.equal(idle.writes.length, 0);
});
test('dry run and API failures do not write settings', async () => {
  const f = fake(); assert.equal((await evaluate(f.api, { ...config, dryRun: true }, now)).action, 'would-stop'); assert.equal(f.writes.length, 0);
  await assert.rejects(evaluate(async () => { throw new Error('API unavailable'); }, config, now));
});
