const { test } = require('node:test');
const assert = require('node:assert');
const { emitSvg } = require('../src/stroke2path.js');

test('builds svg with outlined path, nonzero rule, viewBox', () => {
  const m = new Map();
  m.set('#9b9ba0', [[[0, 0], [10, 0], [10, 1], [0, 1]]]);
  const svg = emitSvg(m, [], { viewBox: '0 0 37 37', precision: 2 });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37">'), svg);
  assert.ok(svg.indexOf('fill="#9b9ba0"') !== -1);
  assert.ok(svg.indexOf('fill-rule="nonzero"') !== -1);
  assert.ok(/M0 0h10v1h-10z/.test(svg), 'path data present: ' + svg);
  assert.ok(svg.endsWith('</svg>'));
});

test('coordinates are rounded to precision', () => {
  const m = new Map();
  m.set('#000', [[[0.123456, 1.987654], [2, 2]]]);
  const svg = emitSvg(m, [], { viewBox: '0 0 4 4', precision: 2 });
  assert.ok(svg.indexOf('M.12 1.99') !== -1, svg);
});

test('preserves existing fills with their fill-rule', () => {
  const svg = emitSvg(new Map(), [{ d: 'M0 0L4 0L4 4Z', fill: 'red', fillRule: 'evenodd' }], { viewBox: '0 0 4 4', precision: 2 });
  assert.ok(svg.indexOf('fill="red"') !== -1);
  assert.ok(svg.indexOf('fill-rule="evenodd"') !== -1);
});

test('width/height included when provided, omitted when empty', () => {
  const m = new Map(); m.set('#000', [[[0, 0], [1, 0], [1, 1]]]);
  const withDims = emitSvg(m, [], { viewBox: '0 0 2 2', width: '2', height: '2', precision: 1 });
  assert.ok(withDims.indexOf('width="2"') !== -1 && withDims.indexOf('height="2"') !== -1);
  const noDims = emitSvg(m, [], { viewBox: '0 0 2 2', precision: 1 });
  assert.ok(noDims.indexOf('width=') === -1 && noDims.indexOf('height=') === -1);
});

test('curve points are emitted as relative cubic commands', () => {
  const m = new Map();
  m.set('#000', [[[0, 0], [2, 0], [2, 2, 3, 0, 3, 2]]]);
  const svg = emitSvg(m, [], { viewBox: '0 0 4 4', precision: 2 });
  assert.ok(svg.indexOf('d="M0 0h2c1 0 1 2 0 2z"') !== -1, svg);
});
