import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const IDLE_MS = 15 * 60_000;
export const METRIC_DELAY_MS = 3 * 60_000;

// Require a continuous, recent series of zero connections. Missing telemetry
// must never be interpreted as inactivity.
export function confirmedIdle(series, now, database) {
  const end = now - METRIC_DELAY_MS;
  const start = end - IDLE_MS;
  const application = series.filter(s => s.metric.labels.database === database);
  if (application.length !== 1) return false;
  for (const item of series) {
    if (item.metric.labels.database === 'cloudsqladmin') continue;
    if (item.points.some(p => Number(p.value.int64Value ?? p.value.doubleValue) > 0)) return false;
  }
  const points = application[0].points.map(p => ({
    time: Date.parse(p.interval.endTime),
    value: Number(p.value.int64Value ?? p.value.doubleValue),
  })).sort((a, b) => a.time - b.time);
  if (!points.length || points.some(p => !Number.isFinite(p.value) || p.value !== 0)) return false;
  if (points[0].time > start || points.at(-1).time < end) return false;
  return points.every((p, i) => i === 0 || p.time - points[i - 1].time <= 90_000);
}

export async function evaluate(api, config, now = Date.now()) {
  const instancePath = `https://sqladmin.googleapis.com/v1/projects/${config.project}/instances/${config.instance}`;
  const instance = await api(instancePath);
  if (instance.state !== 'RUNNABLE') return { action: 'skip', reason: 'instance-transition', state: instance.state };
  const stopped = instance.settings.activationPolicy === 'NEVER';
  const since = new Date(now - (stopped ? 5 * 60_000 : IDLE_MS + METRIC_DELAY_MS + 60_000)).toISOString();
  const logs = await api('https://logging.googleapis.com/v2/entries:list', {
    resourceNames: [`projects/${config.project}`],
    filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${config.app}" AND logName="projects/${config.project}/logs/run.googleapis.com%2Frequests" AND timestamp>="${since}"`,
    orderBy: 'timestamp desc', pageSize: 1,
  });
  const traffic = (logs.entries ?? []).length > 0;
  if (stopped && !traffic) return { action: 'skip', reason: 'stopped-no-traffic' };
  if (!stopped && traffic) return { action: 'skip', reason: 'recent-app-request', lastRequest: logs.entries[0].timestamp };
  if (!stopped) {
    const filter = `metric.type="cloudsql.googleapis.com/database/postgresql/num_backends" AND resource.labels.database_id="${config.project}:${config.instance}"`;
    const params = new URLSearchParams({ filter,
      'interval.startTime': new Date(now - IDLE_MS - METRIC_DELAY_MS - 60_000).toISOString(),
      'interval.endTime': new Date(now).toISOString(), pageSize: '1000' });
    const metrics = await api(`https://monitoring.googleapis.com/v3/projects/${config.project}/timeSeries?${params}`);
    if (metrics.nextPageToken || !confirmedIdle(metrics.timeSeries ?? [], now, config.database)) {
      return { action: 'skip', reason: 'connections-active-or-telemetry-incomplete' };
    }
    // Recheck request logs immediately before stopping to narrow the race with
    // returning users. A sampled signal cannot guarantee zero concurrent work.
    const recent = await api('https://logging.googleapis.com/v2/entries:list', {
      resourceNames: [`projects/${config.project}`],
      filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${config.app}" AND logName="projects/${config.project}/logs/run.googleapis.com%2Frequests" AND timestamp>="${since}"`,
      orderBy: 'timestamp desc', pageSize: 1,
    });
    if ((recent.entries ?? []).length) return { action: 'skip', reason: 'app-request-before-stop' };
  }
  const policy = stopped ? 'ALWAYS' : 'NEVER';
  const action = stopped ? 'start' : 'stop';
  if (config.dryRun) return { action: `would-${action}`, activationPolicy: policy };
  const operation = await api(instancePath, { settings: {
    activationPolicy: policy, settingsVersion: instance.settings.settingsVersion,
  } }, 'PATCH');
  return { action, activationPolicy: policy, operation: operation.name };
}

async function googleApi(url, body, method = body ? 'POST' : 'GET') {
  const tokenResponse = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new Error(`Metadata token HTTP ${tokenResponse.status}`);
  const { access_token } = await tokenResponse.json();
  const response = await fetch(url, { method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Google API HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = { project: process.env.PROJECT_ID, instance: process.env.SQL_INSTANCE,
    database: process.env.DATABASE_NAME, app: process.env.APP_SERVICE,
    dryRun: process.env.DRY_RUN !== 'false' };
  if (Object.values(config).some(v => v === undefined)) throw new Error('Missing controller configuration');
  http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') { res.end('ok'); return; }
    if (req.method !== 'POST' || req.url !== '/') { res.writeHead(404); res.end(); return; }
    try {
      const result = await evaluate(googleApi, config);
      console.log(JSON.stringify({ severity: 'INFO', ...result, instance: config.instance, dryRun: config.dryRun }));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
    } catch (error) {
      console.error(JSON.stringify({ severity: 'ERROR', message: error.message }));
      res.writeHead(503); res.end('Controller failed; no further action taken.');
    }
  }).listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
}
