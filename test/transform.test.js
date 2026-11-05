const { test } = require('node:test');
const assert = require('node:assert');
const { transformScale } = require('../src/stroke2path.js');

test('empty transform -> scale 1', () => {
  assert.strictEqual(transformScale(''), 1);
});

test('uniform scale(2) -> 2', () => {
  assert.ok(Math.abs(transformScale('scale(2)') - 2) < 1e-6);
});

test('scale(3 3) -> 3', () => {
  assert.ok(Math.abs(transformScale('scale(3 3)') - 3) < 1e-6);
});

test('pure translate -> scale 1', () => {
  assert.ok(Math.abs(transformScale('translate(5,7)') - 1) < 1e-6);
});

test('rotation does not change scale', () => {
  assert.ok(Math.abs(transformScale('rotate(30)') - 1) < 1e-6);
});

test('composed translate+scale uses the scale', () => {
  assert.ok(Math.abs(transformScale('translate(10,0) scale(2)') - 2) < 1e-6);
});
