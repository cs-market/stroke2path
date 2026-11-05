const { test } = require('node:test');
const assert = require('node:assert');

test('vendored svgpath loads and works', () => {
  const svgpath = require('../vendor/svgpath.umd.js');
  assert.strictEqual(typeof svgpath, 'function');
  const out = svgpath('m1 1 2 2').abs().toString();
  assert.ok(out.replace(/\s+/g, ' ').trim().startsWith('M1 1'), 'abs() should start at M1 1, got: ' + out);
});

test('vendored clipper loads with required API', () => {
  const ClipperLib = require('../vendor/clipper.js');
  assert.ok(ClipperLib, 'ClipperLib defined');
  assert.ok(ClipperLib.ClipperOffset, 'ClipperOffset present');
  assert.ok(ClipperLib.JoinType, 'JoinType present');
  assert.ok(ClipperLib.EndType, 'EndType present');
});
