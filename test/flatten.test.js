const { test } = require('node:test');
const assert = require('node:assert');
const { flattenPath } = require('../src/stroke2path.js');

test('line keeps both endpoints, not closed', () => {
  const sp = flattenPath('M0 0L10 0', 0.15);
  assert.strictEqual(sp.length, 1);
  assert.strictEqual(sp[0].closed, false);
  assert.deepStrictEqual(sp[0].points[0], [0, 0]);
  assert.deepStrictEqual(sp[0].points[sp[0].points.length - 1], [10, 0]);
});

test('Z marks subpath closed', () => {
  const sp = flattenPath('M0 0L10 0L10 10Z', 0.15);
  assert.strictEqual(sp[0].closed, true);
});

test('relative coords are absolutized (x.svg style)', () => {
  const sp = flattenPath('m27.75 9.25-18.5 18.5M9.25 9.25l18.5 18.5', 0.15);
  assert.strictEqual(sp.length, 2);
  assert.deepStrictEqual(sp[0].points[0], [27.75, 9.25]);
  // end of first stroke: 27.75-18.5=9.25 , 9.25+18.5=27.75
  const last = sp[0].points[sp[0].points.length - 1];
  assert.ok(Math.abs(last[0] - 9.25) < 1e-6 && Math.abs(last[1] - 27.75) < 1e-6);
});

test('cubic flattened into many points, endpoints exact', () => {
  const sp = flattenPath('M0 0C0 10 10 10 10 0', 0.05);
  assert.ok(sp[0].points.length > 3, 'curve should be subdivided');
  assert.deepStrictEqual(sp[0].points[0], [0, 0]);
  const last = sp[0].points[sp[0].points.length - 1];
  assert.ok(Math.abs(last[0] - 10) < 1e-6 && Math.abs(last[1] - 0) < 1e-6);
});

test('H and V are handled', () => {
  const sp = flattenPath('M0 0H10V10', 0.15);
  assert.deepStrictEqual(sp[0].points[0], [0, 0]);
  assert.deepStrictEqual(sp[0].points[1], [10, 0]);
  assert.deepStrictEqual(sp[0].points[2], [10, 10]);
});
