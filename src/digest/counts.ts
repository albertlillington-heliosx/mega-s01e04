import type { Night } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Line counts across the night. Bad lines are not counted here.
export function countNight(night: Night): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of night.rows) {
    counts.retry += row.retries;
    counts.fail += row.fails;
    counts.ok += row.runs - row.retries - row.fails;
  }
  return counts;
}
