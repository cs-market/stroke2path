const { test } = require('node:test');
const assert = require('node:assert');
const { DOMParser } = require('@xmldom/xmldom');
const { convert } = require('../src/stroke2path.js');

const parser = new DOMParser();
function conv(svg, opts) {
  opts = Object.assign({ parser: parser }, opts || {});
  return convert(svg, opts);
}

const X = '<svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" fill="none" viewBox="0 0 37 37"><path stroke="#9b9ba0" stroke-linecap="round" stroke-linejoin="round" d="m27.75 9.25-18.5 18.5M9.25 9.25l18.5 18.5"/></svg>';

test('x.svg: stroke becomes filled path, no stroke attrs remain', () => {
  const r = conv(X);
  assert.strictEqual(r.svg.indexOf('stroke'), -1, 'no stroke* attributes: ' + r.svg);
  assert.ok(r.svg.indexOf('fill="#9b9ba0"') !== -1, 'fill uses former stroke color');
  assert.ok(r.svg.indexOf('fill-rule="nonzero"') !== -1);
  assert.ok(r.svg.indexOf('viewBox="0 0 37 37"') !== -1);
});

test('x.svg: root fill="none" is inherited, centerline is not leaked as a fill', () => {
  const r = conv(X);
  const count = (r.svg.match(/<path/g) || []).length;
  assert.strictEqual(count, 1, 'exactly one outlined path, no preserved fill: ' + r.svg);
});

test('strokeWidth override changes output geometry', () => {
  const a = conv(X, { strokeWidth: 2 }).svg;
  const b = conv(X, { strokeWidth: 6 }).svg;
  assert.notStrictEqual(a, b);
});

test('svg without any stroke is passed through with a warning', () => {
  const noStroke = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="black"/></svg>';
  const r = conv(noStroke);
  assert.strictEqual(r.svg, noStroke);
  assert.ok(r.warnings.some(function (w) { return /Обводок не найдено/.test(w); }));
});

test('group transform is baked into coordinates', () => {
  const g = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><g transform="translate(10,0)"><line x1="0" y1="0" x2="0" y2="10" stroke="#000" stroke-width="2"/></g></svg>';
  const r = conv(g);
  const nums = (r.svg.match(/-?\d*\.?\d+/g) || []).map(Number);
  assert.ok(nums.some(function (n) { return n > 8.5 && n < 11.5; }), 'expected x near 10: ' + r.svg);
});

test('stroke set on parent group is inherited by child shape', () => {
  const g = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g stroke="#123456" stroke-width="2"><line x1="0" y1="5" x2="10" y2="5"/></g></svg>';
  const r = conv(g);
  assert.ok(r.svg.indexOf('fill="#123456"') !== -1, 'inherited stroke color used: ' + r.svg);
});

test('inline style stroke is honored', () => {
  const s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="0" y1="5" x2="10" y2="5" style="stroke:#abcdef;stroke-width:2"/></svg>';
  const r = conv(s);
  assert.ok(r.svg.indexOf('fill="#abcdef"') !== -1, r.svg);
});

test('unsupported element produces a warning and is skipped', () => {
  const t = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="0" y="5">hi</text><line x1="0" y1="0" x2="10" y2="0" stroke="#000" stroke-width="1"/></svg>';
  const r = conv(t);
  assert.ok(r.warnings.some(function (w) { return /text/.test(w); }), r.warnings.join(','));
  assert.ok(r.svg.indexOf('<path') !== -1, 'the line is still converted');
});

test('mixed icon: explicit fill preserved AND stroke outlined', () => {
  const mixed = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">' +
    '<circle cx="10" cy="10" r="5" fill="#ff0000"/>' +
    '<line x1="0" y1="0" x2="20" y2="20" stroke="#00ff00" stroke-width="2"/>' +
    '</svg>';
  const r = conv(mixed);
  assert.ok(r.svg.indexOf('fill="#ff0000"') !== -1, 'explicit fill preserved: ' + r.svg);
  assert.ok(r.svg.indexOf('fill="#00ff00"') !== -1, 'stroke outlined with its color: ' + r.svg);
  const count = (r.svg.match(/<path/g) || []).length;
  assert.strictEqual(count, 2, 'one preserved fill + one outlined stroke');
});

test('invalid svg returns input unchanged with a warning', () => {
  const r = conv('this is not svg at all <<<');
  assert.strictEqual(r.svg, 'this is not svg at all <<<');
  assert.ok(r.warnings.length > 0);
});
