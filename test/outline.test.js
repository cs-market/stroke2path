const { test } = require('node:test');
const assert = require('node:assert');
const { outlineSubpaths } = require('../src/stroke2path.js');

function bbox(contour) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  contour.forEach(function (p) {
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
      minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    }
  });
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

test('open butt line becomes a width-2 band', () => {
  const out = outlineSubpaths(
    [{ points: [[0, 0], [10, 0]], closed: false }],
    { width: 2, linecap: 'butt', linejoin: 'miter', miterLimit: 4 },
    {}
  );
  assert.strictEqual(out.length, 1);
  const b = bbox(out[0]);
  assert.ok(Math.abs(b.minX - 0) < 0.05 && Math.abs(b.maxX - 10) < 0.05, 'x in [0,10]');
  assert.ok(Math.abs(b.minY + 1) < 0.05 && Math.abs(b.maxY - 1) < 0.05, 'y in [-1,1]');
});

test('round cap extends beyond endpoint further than butt', () => {
  const butt = outlineSubpaths([{ points: [[0, 0], [10, 0]], closed: false }],
    { width: 2, linecap: 'butt', linejoin: 'miter', miterLimit: 4 }, {});
  const round = outlineSubpaths([{ points: [[0, 0], [10, 0]], closed: false }],
    { width: 2, linecap: 'round', linejoin: 'miter', miterLimit: 4 }, {});
  assert.ok(bbox(round[0]).maxX > bbox(butt[0]).maxX + 0.5, 'round cap should add ~1 unit');
});

test('closed square stroke produces a ring (outer + inner = 2 contours)', () => {
  const out = outlineSubpaths(
    [{ points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], closed: true }],
    { width: 2, linecap: 'butt', linejoin: 'miter', miterLimit: 4 },
    {}
  );
  assert.strictEqual(out.length, 2);
});

test('crossing strokes are unioned into one contour (no even-odd hole)', () => {
  const out = outlineSubpaths(
    [
      { points: [[0, 0], [10, 10]], closed: false },
      { points: [[0, 10], [10, 0]], closed: false }
    ],
    { width: 2, linecap: 'butt', linejoin: 'miter', miterLimit: 4 },
    {}
  );
  // union of an X-cross = a single outer boundary, no inner hole contour
  assert.strictEqual(out.length, 1);
});
