import { describe, expect, it } from 'vitest';
import { countNight } from '../src/digest/counts.js';
import { readNight } from '../src/digest/read.js';

describe('countNight', () => {
  it('counts lines across the real night 2026-10-28', () => {
    const night = readNight('runs', '2026-10-28');
    if (night === null) throw new Error('runs/2026-10-28.jsonl is missing');
    // 15 good lines (the 16th is cut off and counted as a bad line, not here):
    // 10 ok, 4 retry (3 fixtures/refresh, 1 lane/sync), 1 fail (notes/backup).
    expect(countNight(night)).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});
