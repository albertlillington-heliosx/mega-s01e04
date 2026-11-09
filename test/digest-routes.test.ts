import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// A temp runs dir: runs/ is read-only and holds real nights.
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-'));

  // Three good lines: b/job ok, a/job retry then ok. Times increase.
  writeFileSync(
    join(runsDir, '2026-10-01.jsonl'),
    [
      '{"at":"2026-10-01T01:00:00+01:00","job":"b/job","status":"ok","owner":"rook"}',
      '{"at":"2026-10-01T01:10:00+01:00","job":"a/job","status":"retry","owner":"rook","error":"x"}',
      '{"at":"2026-10-01T01:20:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
    ].join('\n'),
  );

  // An empty night.
  writeFileSync(join(runsDir, '2026-10-02.jsonl'), '');

  // One good line, then a truncated line that does not parse.
  writeFileSync(
    join(runsDir, '2026-10-03.jsonl'),
    [
      '{"at":"2026-10-03T01:00:00+01:00","job":"c/job","status":"ok","owner":"rook"}',
      '{"at":"2026-10-03T0',
    ].join('\n'),
  );

  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

describe('GET /digest/:night', () => {
  it('lists the jobs of a night, a/job before b/job', async () => {
    const res = await app.request('/digest/2026-10-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const a = html.indexOf('a/job');
    const b = html.indexOf('b/job');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-10-09');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-10-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('lists the good jobs of a night with a bad line and counts the bad line', async () => {
    const res = await app.request('/digest/2026-10-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('c/job');
    expect(html).toContain('1 line(s) did not parse');
  });

  it('answers 404 for a night that is not a date', async () => {
    const res = await app.request('/digest/not-a-date');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows of a night, sorted by job, with no bad lines', async () => {
    const res = await app.request('/api/digest/2026-10-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-01');
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
    expect(body.badLines).toBe(0);
  });

  it('returns no rows for an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-02');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body).toEqual({ night: '2026-10-02', rows: [], badLines: 0 });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-09');
    expect(res.status).toBe(404);
  });

  it('answers 404 for a night that is not a date', async () => {
    const res = await app.request('/api/digest/not-a-date');
    expect(res.status).toBe(404);
  });

  it('counts the bad line of a night and still lists its good job', async () => {
    const res = await app.request('/api/digest/2026-10-03');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['c/job']);
  });

  it('lists the jobs in the same order as the page', async () => {
    const jsonRes = await app.request('/api/digest/2026-10-01');
    const body = (await jsonRes.json()) as Night;
    const pageRes = await app.request('/digest/2026-10-01');
    const html = await pageRes.text();

    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });
});
