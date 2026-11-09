import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function tempRunsDir(): string {
  return mkdtempSync(join(tmpdir(), 'rig-runs-'));
}

describe('readNight on runs/2026-10-28', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('gives one row per job, sorted by job, and counts the bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('counts retries and keeps the last status', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: null });
  });

  it('keeps the last error of a failed job', () => {
    expect(row('notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps the offset from the log', () => {
    expect(row('lane/sync')).toMatchObject({
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight on a temp runs dir', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(tempRunsDir(), '2026-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = tempRunsDir();
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts a bad line and still returns the night', () => {
    const dir = tempRunsDir();
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      [
        '{"at":"2026-01-01T23:00:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
        'not json',
        '{"at":"2026-01-01T23:01:00+01:00","job":"a/job","status":"maybe","owner":"rook"}',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(2);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]).toMatchObject({ job: 'a/job', runs: 1, lastStatus: 'ok' });
  });

  it('takes the last line in time order, not file order', () => {
    const dir = tempRunsDir();
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      [
        '{"at":"2026-01-02T02:00:00+01:00","job":"a/job","status":"fail","owner":"lane-07","error":"boom"}',
        '{"at":"2026-01-02T01:00:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
      ].join('\n') + '\n',
    );
    expect(readNight(dir, '2026-01-01')?.rows[0]).toMatchObject({
      owner: 'lane-07',
      lastStatus: 'fail',
      lastError: 'boom',
      firstAt: '2026-01-02T01:00:00+01:00',
      lastAt: '2026-01-02T02:00:00+01:00',
    });
  });
});
