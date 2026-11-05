const { test } = require('node:test');
const assert = require('node:assert');
const { shapeToPathData } = require('../src/stroke2path.js');

function fakeEl(tag, attrs) {
  return {
    localName: tag,
    tagName: tag,
    getAttribute: function (n) { return attrs[n] != null ? String(attrs[n]) : null; }
  };
}

test('path -> d passthrough', () => {
  assert.strictEqual(shapeToPathData(fakeEl('path', { d: 'M0 0L1 1' }), 'path'), 'M0 0L1 1');
});

test('line -> M..L..', () => {
  assert.strictEqual(shapeToPathData(fakeEl('line', { x1: 0, y1: 0, x2: 10, y2: 5 }), 'line'), 'M0 0L10 5');
});

test('rect -> closed rectangle', () => {
  assert.strictEqual(
    shapeToPathData(fakeEl('rect', { x: 1, y: 2, width: 4, height: 3 }), 'rect'),
    'M1 2L5 2L5 5L1 5Z'
  );
});

test('polygon adds Z, polyline does not', () => {
  assert.strictEqual(shapeToPathData(fakeEl('polyline', { points: '0,0 10,0 10,10' }), 'polyline'), 'M0 0L10 0L10 10');
  assert.strictEqual(shapeToPathData(fakeEl('polygon', { points: '0,0 10,0 10,10' }), 'polygon'), 'M0 0L10 0L10 10Z');
});

test('circle uses two arcs', () => {
  const d = shapeToPathData(fakeEl('circle', { cx: 5, cy: 5, r: 5 }), 'circle');
  assert.ok(d.indexOf('A5 5 0 1 0') !== -1, 'should contain arc segments: ' + d);
  assert.ok(d.endsWith('Z'));
});

test('degenerate shapes return empty string', () => {
  assert.strictEqual(shapeToPathData(fakeEl('rect', { x: 0, y: 0, width: 0, height: 5 }), 'rect'), '');
  assert.strictEqual(shapeToPathData(fakeEl('circle', { cx: 5, cy: 5, r: 0 }), 'circle'), '');
});
