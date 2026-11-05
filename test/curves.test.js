const { test } = require('node:test');
const assert = require('node:assert');
const { DOMParser } = require('@xmldom/xmldom');
const { convert, outlineSubpaths } = require('../src/stroke2path.js');

function samples(contour) {
  const out = [];
  for (let i = 1; i <= contour.length; i++) {
    const a = contour[i - 1], p = contour[i % contour.length];
    for (let t = 0; t <= 1; t += 0.02) {
      const u = 1 - t;
      if (p.length === 2) out.push([a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t]);
      else out.push([
        u * u * u * a[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[0],
        u * u * u * a[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[1]
      ]);
    }
  }
  return out;
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const ROUND = { width: 2, linecap: 'round', linejoin: 'round', miterLimit: 4 };

test('round caps are emitted as cubic curves, not facets', () => {
  const out = outlineSubpaths([{ points: [[0, 0], [10, 0]], closed: false }], ROUND, { smoothness: 0.05 });
  assert.strictEqual(out.length, 1);
  const curves = out[0].filter(function (p) { return p.length === 6; });
  assert.ok(curves.length >= 2, 'expected curves at both caps: ' + JSON.stringify(out[0]));
  assert.ok(out[0].length <= 8, 'a capsule needs only a few segments, got ' + out[0].length);
});

test('round-capped outline stays within tolerance of the true capsule', () => {
  const out = outlineSubpaths([{ points: [[0, 0], [10, 0]], closed: false }], ROUND, { smoothness: 0.05 });
  samples(out[0]).forEach(function (p) {
    const err = Math.abs(distToSegment(p, [0, 0], [10, 0]) - 1);
    assert.ok(err < 0.05, 'point ' + p + ' off by ' + err);
  });
});

test('round joins of a polyline become curves and stay accurate', () => {
  const pts = [[4, 12], [9, 17], [20, 6]];
  const out = outlineSubpaths([{ points: pts, closed: false }], ROUND, { smoothness: 0.05 });
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].some(function (p) { return p.length === 6; }));
  samples(out[0]).forEach(function (p) {
    const d = Math.min(distToSegment(p, pts[0], pts[1]), distToSegment(p, pts[1], pts[2]));
    assert.ok(d < 1.05, 'point ' + p + ' outside stroke: ' + d);
  });
});

test('zero-length round-capped line becomes a dot made of curves', () => {
  const out = outlineSubpaths([{ points: [[5, 5], [5, 5]], closed: false }], ROUND, { smoothness: 0.05 });
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].every(function (p, i) { return i === 0 || p.length === 6; }), JSON.stringify(out[0]));
  samples(out[0]).forEach(function (p) {
    assert.ok(Math.abs(Math.hypot(p[0] - 5, p[1] - 5) - 1) < 0.05);
  });
});

test('large radius gets enough curve segments to stay accurate', () => {
  const out = outlineSubpaths([{ points: [[100, 100], [900, 100]], closed: false }],
    { width: 80, linecap: 'round', linejoin: 'round', miterLimit: 4 }, { smoothness: 0.05 });
  samples(out[0]).forEach(function (p) {
    const err = Math.abs(distToSegment(p, [100, 100], [900, 100]) - 40);
    assert.ok(err < 0.06, 'point ' + p + ' off by ' + err);
  });
});

test('baltika x.svg: smooth curves and smaller than the old faceted output', () => {
  const x = '<svg width="24" height="25" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M18 6.50977L6 18.5098" stroke="#212121" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6 6.50977L18 18.5098" stroke="#212121" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const r = convert(x, { parser: new DOMParser() });
  assert.ok(/c/.test(r.svg.match(/ d="([^"]+)"/)[1]), 'path contains curves: ' + r.svg);
  assert.ok(r.svg.length <= 346, 'size ' + r.svg.length + ' should not exceed old 0.15 output (346)');
});
