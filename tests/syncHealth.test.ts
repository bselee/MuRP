import assert from 'node:assert/strict';
import {
  pickPrimaryRow,
  pickStaleRow,
  buildSyncStatusLabel,
  formatSyncTooltip,
  formatTimeAgo,
  type SyncHealthRow,
} from '../lib/sync/healthUtils.ts';

const sampleRows: SyncHealthRow[] = [
  {
    data_type: 'vendors',
    last_sync_time: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    item_count: 10,
    success: true,
    minutes_since_sync: 90,
    expected_interval_minutes: 60,
    is_stale: true,
  },
  {
    data_type: 'inventory',
    last_sync_time: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    item_count: 500,
    success: true,
    minutes_since_sync: 2,
    expected_interval_minutes: 5,
    is_stale: false,
  },
];

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: 'pickPrimaryRow prefers inventory when present',
    run: () => {
      const row = pickPrimaryRow(sampleRows);
      assert.equal(row?.data_type, 'inventory');
    },
  },
  {
    name: 'pickStaleRow finds stale or failed row',
    run: () => {
      const row = pickStaleRow(sampleRows);
      assert.equal(row?.data_type, 'vendors');
    },
  },
  {
    name: 'buildSyncStatusLabel prioritises spinner, stale, then freshness',
    run: () => {
      const staleRow = pickStaleRow(sampleRows);
      const freshRow = pickPrimaryRow(sampleRows);
      const withoutSpinner = buildSyncStatusLabel({
        showSpinner: false,
        staleRow,
        lastSyncDate: freshRow?.last_sync_time ? new Date(freshRow.last_sync_time) : null,
      });
      assert.equal(withoutSpinner, 'vendors stale');

      const withSpinner = buildSyncStatusLabel({
        showSpinner: true,
        staleRow,
        lastSyncDate: null,
      });
      assert.equal(withSpinner, 'Syncing…');
    },
  },
  {
    name: 'formatSyncTooltip summarises counts and cadence',
    run: () => {
      const primary = pickPrimaryRow(sampleRows);
      const tooltip = formatSyncTooltip({
        primaryRow: primary,
        lastSyncDate: primary?.last_sync_time ? new Date(primary.last_sync_time) : null,
        itemCount: primary?.item_count ?? 0,
        lastFetchedAt: new Date('2025-01-01T12:00:00Z'),
        now: Date.parse('2025-01-01T12:05:00Z'),
      });
      assert.match(tooltip, /Rows synced: 500/);
      assert.match(tooltip, /Expected cadence: 5m/);
    },
  },
  {
    name: 'formatTimeAgo handles nulls and long durations',
    run: () => {
      assert.equal(formatTimeAgo(null, 0), 'Never');
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
      assert.equal(formatTimeAgo(twoHoursAgo, twoHoursAgo.getTime() + 2 * 3600 * 1000), '2h ago');
    },
  },
];

let passed = 0;

tests.forEach((test) => {
  try {
    test.run();
    console.log(`✅ ${test.name}`);
    passed += 1;
  } catch (error) {
    console.error(`❌ ${test.name}`);
    throw error;
  }
});

console.log(`\n${passed}/${tests.length} sync health tests passed.`);
