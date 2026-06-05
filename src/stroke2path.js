(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var svgpath = root.svgpath || require('../vendor/svgpath.umd.js');
    var ClipperLib = root.ClipperLib || require('../vendor/clipper.js');
    module.exports = factory(svgpath, ClipperLib);
  } else {
    root.stroke2path = factory(root.svgpath, root.ClipperLib);
  }
}(typeof self !== 'undefined' ? self : this, function (svgpath, ClipperLib) {
  'use strict';

  function shapeToPathData(el, tname) {
    tname = tname || (el.localName || el.tagName || '').toLowerCase();
    var A = function (n, d) { var v = el.getAttribute(n); return v == null || v === '' ? d : v; };
    var num = function (n, d) { return parseFloat(A(n, d)); };

    switch (tname) {
      case 'path':
        return el.getAttribute('d') || '';
      case 'line':
        return 'M' + num('x1', 0) + ' ' + num('y1', 0) + 'L' + num('x2', 0) + ' ' + num('y2', 0);
      case 'polyline':
      case 'polygon': {
        var pts = (A('points', '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
        if (pts.length < 4) return '';
        var d = 'M' + pts[0] + ' ' + pts[1];
        for (var i = 2; i < pts.length - 1; i += 2) d += 'L' + pts[i] + ' ' + pts[i + 1];
        if (tname === 'polygon') d += 'Z';
        return d;
      }
      case 'rect': {
        var x = num('x', 0), y = num('y', 0), w = num('width', 0), h = num('height', 0);
        if (!(w > 0 && h > 0)) return '';
        return 'M' + x + ' ' + y + 'L' + (x + w) + ' ' + y + 'L' + (x + w) + ' ' + (y + h) + 'L' + x + ' ' + (y + h) + 'Z';
      }
      case 'circle': {
        var cx = num('cx', 0), cy = num('cy', 0), r = num('r', 0);
        if (!(r > 0)) return '';
        return 'M' + (cx - r) + ' ' + cy +
          'A' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy +
          'A' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy + 'Z';
      }
      case 'ellipse': {
        var ex = num('cx', 0), ey = num('cy', 0), rx = num('rx', 0), ry = num('ry', 0);
        if (!(rx > 0 && ry > 0)) return '';
        return 'M' + (ex - rx) + ' ' + ey +
          'A' + rx + ' ' + ry + ' 0 1 0 ' + (ex + rx) + ' ' + ey +
          'A' + rx + ' ' + ry + ' 0 1 0 ' + (ex - rx) + ' ' + ey + 'Z';
      }
      default:
        return '';
    }
  }

  function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, tol, out, depth) {
    var dx = x3 - x0, dy = y3 - y0;
    var d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
    var d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
    if (depth > 18 || (d1 + d2) * (d1 + d2) < tol * tol * (dx * dx + dy * dy)) {
      out.push([x3, y3]);
      return;
    }
    var x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2;
    var x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2;
    var x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
    var x012 = (x01 + x12) / 2, y012 = (y01 + y12) / 2;
    var x123 = (x12 + x23) / 2, y123 = (y12 + y23) / 2;
    var xm = (x012 + x123) / 2, ym = (y012 + y123) / 2;
    flattenCubic(x0, y0, x01, y01, x012, y012, xm, ym, tol, out, depth + 1);
    flattenCubic(xm, ym, x123, y123, x23, y23, x3, y3, tol, out, depth + 1);
  }

  function flattenQuad(x0, y0, x1, y1, x2, y2, tol, out, depth) {
    var dx = x2 - x0, dy = y2 - y0;
    var d = Math.abs((x1 - x2) * dy - (y1 - y2) * dx);
    if (depth > 18 || d * d < tol * tol * (dx * dx + dy * dy)) {
      out.push([x2, y2]);
      return;
    }
    var x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2;
    var x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2;
    var xm = (x01 + x12) / 2, ym = (y01 + y12) / 2;
    flattenQuad(x0, y0, x01, y01, xm, ym, tol, out, depth + 1);
    flattenQuad(xm, ym, x12, y12, x2, y2, tol, out, depth + 1);
  }

  function flattenPath(d, smoothness) {
    var tol = smoothness > 0 ? smoothness : 0.15;
    var subpaths = [];
    var cur = null;
    var startX = 0, startY = 0, curX = 0, curY = 0;

    function moveTo(x, y) {
      if (cur && cur.points.length > 1) subpaths.push(cur);
      cur = { points: [[x, y]], closed: false };
      startX = x; startY = y; curX = x; curY = y;
    }
    function lineTo(x, y) {
      if (!cur) { moveTo(x, y); return; }
      cur.points.push([x, y]);
      curX = x; curY = y;
    }

    svgpath(d).abs().unarc().unshort().iterate(function (seg) {
      var c = seg[0];
      if (c === 'M') { moveTo(seg[1], seg[2]); }
      else if (c === 'L') { lineTo(seg[1], seg[2]); }
      else if (c === 'H') { lineTo(seg[1], curY); }
      else if (c === 'V') { lineTo(curX, seg[1]); }
      else if (c === 'C') {
        if (!cur) moveTo(curX, curY);
        flattenCubic(curX, curY, seg[1], seg[2], seg[3], seg[4], seg[5], seg[6], tol, cur.points, 0);
        curX = seg[5]; curY = seg[6];
      } else if (c === 'Q') {
        if (!cur) moveTo(curX, curY);
        flattenQuad(curX, curY, seg[1], seg[2], seg[3], seg[4], tol, cur.points, 0);
        curX = seg[3]; curY = seg[4];
      } else if (c === 'Z' || c === 'z') {
        if (cur) cur.closed = true;
        curX = startX; curY = startY;
      }
    });

    if (cur && cur.points.length > 1) subpaths.push(cur);
    return subpaths;
  }

  function outlineSubpaths(subpaths, stroke, opts) {
    opts = opts || {};
    var S = opts.scale || 1000;
    var smoothness = opts.smoothness > 0 ? opts.smoothness : 0.15;
    var JT = ClipperLib.JoinType, ET = ClipperLib.EndType;
    var jt = stroke.linejoin === 'round' ? JT.jtRound
      : stroke.linejoin === 'bevel' ? JT.jtSquare
      : JT.jtMiter;
    var capET = stroke.linecap === 'round' ? ET.etOpenRound
      : stroke.linecap === 'square' ? ET.etOpenSquare
      : ET.etOpenButt;

    var co = new ClipperLib.ClipperOffset(stroke.miterLimit || 4, smoothness * S);

    subpaths.forEach(function (sp) {
      var pts = sp.points.slice();
      var closed = sp.closed;
      if (closed && pts.length > 1) {
        var a = pts[0], b = pts[pts.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
      }
      if (closed && pts.length < 3) closed = false;
      if (pts.length < 2) return;
      var path = pts.map(function (p) {
        return { X: Math.round(p[0] * S), Y: Math.round(p[1] * S) };
      });
      co.AddPath(path, jt, closed ? ET.etClosedLine : capET);
    });

    var solution = [];
    co.Execute(solution, (stroke.width / 2) * S);
    return solution.map(function (path) {
      return path.map(function (pt) { return [pt.X / S, pt.Y / S]; });
    });
  }

  function roundNum(n, p) {
    var f = Math.pow(10, p);
    return Math.round(n * f) / f;
  }

  function fmt(n, p) {
    return String(roundNum(n, p));
  }

  function contoursToPathData(contours, precision) {
    return contours.map(function (c) {
      var s = '';
      for (var i = 0; i < c.length; i++) {
        s += (i === 0 ? 'M' : 'L') + fmt(c[i][0], precision) + ' ' + fmt(c[i][1], precision);
      }
      return s + 'Z';
    }).join('');
  }

  function emitSvg(outlineByColor, fillPaths, attrs) {
    var p = attrs.precision != null ? attrs.precision : 3;
    var parts = [];

    fillPaths.forEach(function (fp) {
      var fr = (fp.fillRule && fp.fillRule !== 'nonzero') ? ' fill-rule="' + fp.fillRule + '"' : '';
      parts.push('<path fill="' + fp.fill + '"' + fr + ' d="' + fp.d + '"/>');
    });

    outlineByColor.forEach(function (contours, color) {
      var d = contoursToPathData(contours, p);
      if (d) parts.push('<path fill="' + color + '" fill-rule="nonzero" d="' + d + '"/>');
    });

    var vb = attrs.viewBox ? ' viewBox="' + attrs.viewBox + '"' : '';
    var dims = (attrs.width ? ' width="' + attrs.width + '"' : '') +
      (attrs.height ? ' height="' + attrs.height + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg"' + vb + dims + '>' + parts.join('') + '</svg>';
  }

  function transformScale(t) {
    if (!t) return 1;
    var s;
    try {
      s = svgpath('M0 0L1 0L0 1').transform(t).abs().toString();
    } catch (e) {
      return 1;
    }
    var n = (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (n.length < 6) return 1;
    var ux = n[2] - n[0], uy = n[3] - n[1];
    var vx = n[4] - n[0], vy = n[5] - n[1];
    var det = Math.abs(ux * vy - uy * vx);
    var sc = Math.sqrt(det);
    return sc > 0 ? sc : 1;
  }

  var SHAPES = { path: 1, line: 1, polyline: 1, polygon: 1, rect: 1, circle: 1, ellipse: 1 };
  var SKIP_SILENT = { defs: 1, title: 1, desc: 1, metadata: 1, style: 1 };

  function localName(el) {
    return (el.localName || el.tagName || '').toLowerCase();
  }

  function normalizeColor(c) {
    if (!c) return '#000';
    c = String(c).trim();
    if (c === 'currentColor') return '#000';
    return c;
  }

  function computeStyle(el, inherited) {
    var s = {
      stroke: inherited.stroke, strokeWidth: inherited.strokeWidth,
      linecap: inherited.linecap, linejoin: inherited.linejoin,
      miterlimit: inherited.miterlimit, fill: inherited.fill, fillRule: inherited.fillRule
    };
    function setAttr(name, key) {
      var v = el.getAttribute(name);
      if (v != null && v !== '') s[key] = v.trim();
    }
    setAttr('stroke', 'stroke');
    setAttr('stroke-width', 'strokeWidth');
    setAttr('stroke-linecap', 'linecap');
    setAttr('stroke-linejoin', 'linejoin');
    setAttr('stroke-miterlimit', 'miterlimit');
    setAttr('fill', 'fill');
    setAttr('fill-rule', 'fillRule');

    var style = el.getAttribute('style');
    if (style) {
      style.split(';').forEach(function (decl) {
        var i = decl.indexOf(':');
        if (i < 0) return;
        var k = decl.slice(0, i).trim();
        var v = decl.slice(i + 1).trim();
        if (!v) return;
        if (k === 'stroke') s.stroke = v;
        else if (k === 'stroke-width') s.strokeWidth = v;
        else if (k === 'stroke-linecap') s.linecap = v;
        else if (k === 'stroke-linejoin') s.linejoin = v;
        else if (k === 'stroke-miterlimit') s.miterlimit = v;
        else if (k === 'fill') s.fill = v;
        else if (k === 'fill-rule') s.fillRule = v;
      });
    }
    return s;
  }

  function convert(svgString, options) {
    options = options || {};
    var precision = options.precision != null ? options.precision : 3;
    var smoothness = options.smoothness > 0 ? options.smoothness : 0.15;
    var warnings = [];

    var parser = options.parser || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
    if (!parser) return { svg: svgString, warnings: ['Нет XML-парсера.'] };

    var doc;
    try { doc = parser.parseFromString(svgString, 'image/svg+xml'); }
    catch (e) { return { svg: svgString, warnings: ['Не удалось разобрать SVG.'] }; }

    var root = doc && doc.documentElement;
    if (!root || localName(root) !== 'svg') {
      return { svg: svgString, warnings: ['Не удалось разобрать SVG.'] };
    }
    if (doc.getElementsByTagName) {
      var pe = doc.getElementsByTagName('parsererror');
      if (pe && pe.length) return { svg: svgString, warnings: ['Не удалось разобрать SVG.'] };
    }

    var viewBox = root.getAttribute('viewBox') || '';
    var width = root.getAttribute('width') || '';
    var height = root.getAttribute('height') || '';
    if (!viewBox && width && height) viewBox = '0 0 ' + parseFloat(width) + ' ' + parseFloat(height);

    // fill пустой = «не задан явно». Дефолтный SVG-black НЕ сохраняем как заливку:
    // у stroke-иконок это лишь осевые линии, чёрная заливка была бы мусором.
    var initial = {
      stroke: 'none', strokeWidth: '1', linecap: 'butt',
      linejoin: 'miter', miterlimit: '4', fill: '', fillRule: 'nonzero'
    };
    var outlineByColor = new Map();
    var fillPaths = [];

    function processShape(el, tag, style, combinedT) {
      var d0 = shapeToPathData(el, tag);
      if (!d0) { warnings.push('Пропущена пустая фигура <' + tag + '>'); return; }

      var sp = svgpath(d0).abs().unarc().unshort();
      if (combinedT) sp = sp.transform(combinedT);
      var dAbs = sp.toString();

      var scale = transformScale(combinedT);
      var localW = options.strokeWidth != null ? options.strokeWidth : (parseFloat(style.strokeWidth) || 1);
      var strokeWidth = localW * scale;

      if (style.stroke && style.stroke !== 'none' && strokeWidth > 0) {
        var subpaths = flattenPath(dAbs, smoothness);
        var contours = outlineSubpaths(subpaths, {
          width: strokeWidth,
          linecap: style.linecap,
          linejoin: style.linejoin,
          miterLimit: parseFloat(style.miterlimit) || 4
        }, { smoothness: smoothness });
        if (contours.length) {
          var color = normalizeColor(style.stroke);
          if (!outlineByColor.has(color)) outlineByColor.set(color, []);
          var bucket = outlineByColor.get(color);
          for (var k = 0; k < contours.length; k++) bucket.push(contours[k]);
        }
      }

      if (style.fill && style.fill !== 'none') {
        fillPaths.push({
          d: sp.round(precision).toString(),
          fill: normalizeColor(style.fill),
          fillRule: style.fillRule
        });
      }
    }

    function walk(parent, inheritedStyle, inheritedT) {
      var nodes = parent.childNodes;
      if (!nodes) return;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || el.nodeType !== 1) continue;
        var tag = localName(el);
        var style = computeStyle(el, inheritedStyle);
        var ownT = el.getAttribute('transform') || '';
        var combinedT = (inheritedT + ' ' + ownT).trim();
        if (tag === 'g' || tag === 'svg') { walk(el, style, combinedT); continue; }
        if (SKIP_SILENT[tag]) continue;
        if (!SHAPES[tag]) { warnings.push('Пропущен <' + tag + '>'); continue; }
        processShape(el, tag, style, combinedT);
      }
    }

    var rootStyle = computeStyle(root, initial);
    var rootT = (root.getAttribute('transform') || '').trim();
    walk(root, rootStyle, rootT);

    if (outlineByColor.size === 0) {
      warnings.push('Обводок не найдено — конвертировать нечего (иконка уже на заливке?).');
      return { svg: svgString, warnings: warnings };
    }

    var svg = emitSvg(outlineByColor, fillPaths, {
      viewBox: viewBox, width: width, height: height, precision: precision
    });
    return { svg: svg, warnings: warnings };
  }

  return {
    convert: convert,
    shapeToPathData: shapeToPathData,
    flattenPath: flattenPath,
    outlineSubpaths: outlineSubpaths,
    emitSvg: emitSvg,
    transformScale: transformScale,
    computeStyle: computeStyle,
    normalizeColor: normalizeColor
  };
}));
