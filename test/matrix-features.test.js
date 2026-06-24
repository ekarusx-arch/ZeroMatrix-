import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTagColor,
  mergeTagPalette,
  normalizeTagPalette,
  toSlateTagPalette,
} from '../src/lib/tagPalette.js';
import { formatMinutes, getNextTimeEstimate } from '../src/lib/timeBudget.js';

test('tag palettes normalize, deduplicate, and preserve valid colors', () => {
  assert.deepEqual(normalizeTagPalette([
    { tag: '#기획', color: '#123456' },
    { tag: '기획', color: '#abcdef' },
    { tag: '개발', color: 'invalid' },
  ]), [
    { tag: '기획', color: '#123456' },
    { tag: '개발', color: '#34D399' },
  ]);
});

test('new tags merge without changing existing colors and export for ZeroSlate', () => {
  const palette = mergeTagPalette([{ tag: '기획', color: '#123456' }], ['#기획', '개발']);
  assert.equal(getTagColor(palette, '#기획'), '#123456');
  assert.deepEqual(toSlateTagPalette(palette), [
    { tag: '#기획', color: '#123456' },
    { tag: '#개발', color: '#34D399' },
  ]);
});

test('time estimates advance from arbitrary values to the next preset', () => {
  assert.equal(getNextTimeEstimate(0), 15);
  assert.equal(getNextTimeEstimate(15), 30);
  assert.equal(getNextTimeEstimate(45), 60);
  assert.equal(getNextTimeEstimate(90), 120);
  assert.equal(getNextTimeEstimate(120), 0);
});

test('minute formatting covers mixed and empty durations', () => {
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(75), '1h 15m');
  assert.equal(formatMinutes(120), '2h');
});
