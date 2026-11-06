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
        var rx = parseFloat(A('rx', '')), ry = parseFloat(A('ry', ''));
        if (!(rx > 0)) rx = ry > 0 ? ry : 0;
        if (!(ry > 0)) ry = rx;
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        if (!(rx > 0 && ry > 0)) {
          return 'M' + x + ' ' + y + 'L' + (x + w) + ' ' + y + 'L' + (x + w) + ' ' + (y + h) + 'L' + x + ' ' + (y + h) + 'Z';
        }
        var arc = 'A' + rx + ' ' + ry + ' 0 0 1 ';
        return 'M' + (x + rx) + ' ' + y + 'H' + (x + w - rx) + arc + (x + w) + ' ' + (y + ry) +
          'V' + (y + h - ry) + arc + (x + w - rx) + ' ' + (y + h) +
          'H' + (x + rx) + arc + x + ' ' + (y + h - ry) +
          'V' + (y + ry) + arc + (x + rx) + ' ' + y + 'Z';
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

  var FLATTEN_TURN = Math.PI / 18;

  function controlTurn(xs, ys) {
    var total = 0, px = 0, py = 0, has = false;
    for (var i = 1; i < xs.length; i++) {
      var lx = xs[i] - xs[i - 1], ly = ys[i] - ys[i - 1];
      if (lx === 0 && ly === 0) continue;
      if (has) total += Math.abs(Math.atan2(px * ly - py * lx, px * lx + py * ly));
      px = lx; py = ly; has = true;
    }
    return total;
  }

  function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, tol, out, depth) {
    var dx = x3 - x0, dy = y3 - y0;
    var d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
    var d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
    if (depth > 18 || ((d1 + d2) * (d1 + d2) < tol * tol * (dx * dx + dy * dy) &&
        controlTurn([x0, x1, x2, x3], [y0, y1, y2, y3]) <= FLATTEN_TURN)) {
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
    if (depth > 18 || (d * d < tol * tol * (dx * dx + dy * dy) &&
        controlTurn([x0, x1, x2], [y0, y1, y2]) <= FLATTEN_TURN)) {
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
    var tol = smoothness > 0 ? smoothness : 0.05;
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

  function simplifyPolyline(pts, tol) {
    if (pts.length < 3) return pts;
    var keep = [];
    for (var k = 0; k < pts.length; k++) keep.push(false);
    keep[0] = keep[pts.length - 1] = true;
    var stack = [[0, pts.length - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      var ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay;
      var len = Math.sqrt(dx * dx + dy * dy), maxD = 0, maxI = -1;
      for (var i = a + 1; i < b; i++) {
        var d = len > 0 ? Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len
          : Math.sqrt((pts[i][0] - ax) * (pts[i][0] - ax) + (pts[i][1] - ay) * (pts[i][1] - ay));
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > tol) { keep[maxI] = true; stack.push([a, maxI], [maxI, b]); }
    }
    return pts.filter(function (p, i) { return keep[i]; });
  }

  function arcSegmentCount(sweep, r, tol) {
    var n = 1;
    while (n < 64) {
      var q = sweep / n / 4;
      var err = r * 4 / 27 * Math.pow(Math.sin(q), 6) / Math.pow(Math.cos(q), 2);
      if (err <= tol) return n;
      n++;
    }
    return n;
  }

  var CORNER = Math.PI / 6;

  function v_sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function v_add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function v_scale(a, s) { return [a[0] * s, a[1] * s]; }
  function v_dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function v_len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function v_norm(a) { var l = v_len(a); return l > 0 ? [a[0] / l, a[1] / l] : [0, 0]; }
  function v_turn(a, b) {
    var x = a[0] * b[1] - a[1] * b[0], d = a[0] * b[0] + a[1] * b[1];
    return Math.abs(Math.atan2(x, d));
  }

  function bezPoint(b, t) {
    var u = 1 - t;
    return [
      u * u * u * b[0][0] + 3 * u * u * t * b[1][0] + 3 * u * t * t * b[2][0] + t * t * t * b[3][0],
      u * u * u * b[0][1] + 3 * u * u * t * b[1][1] + 3 * u * t * t * b[2][1] + t * t * t * b[3][1]
    ];
  }

  function chordParams(pts) {
    var u = [0];
    for (var i = 1; i < pts.length; i++) u.push(u[i - 1] + v_len(v_sub(pts[i], pts[i - 1])));
    var L = u[u.length - 1];
    return u.map(function (x) { return L > 0 ? x / L : 0; });
  }

  function generateBezier(pts, u, t1, t2) {
    var p0 = pts[0], p3 = pts[pts.length - 1];
    var C = [[0, 0], [0, 0]], X = [0, 0];
    for (var i = 0; i < pts.length; i++) {
      var t = u[i], s = 1 - t;
      var b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
      var A1 = v_scale(t1, b1), A2 = v_scale(t2, b2);
      C[0][0] += v_dot(A1, A1); C[0][1] += v_dot(A1, A2); C[1][1] += v_dot(A2, A2);
      var tmp = v_sub(pts[i], v_add(v_scale(p0, b0 + b1), v_scale(p3, b2 + b3)));
      X[0] += v_dot(A1, tmp); X[1] += v_dot(A2, tmp);
    }
    C[1][0] = C[0][1];
    var det = C[0][0] * C[1][1] - C[1][0] * C[0][1];
    var a1 = det !== 0 ? (X[0] * C[1][1] - C[0][1] * X[1]) / det : 0;
    var a2 = det !== 0 ? (C[0][0] * X[1] - X[0] * C[1][0]) / det : 0;
    var seg = v_len(v_sub(p3, p0)), eps = 1e-6 * seg;
    if (!(a1 > eps) || !(a2 > eps)) { a1 = seg / 3; a2 = seg / 3; }
    return [p0, v_add(p0, v_scale(t1, a1)), v_add(p3, v_scale(t2, a2)), p3];
  }

  function maxError(pts, b, u) {
    var max = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      var d = v_sub(bezPoint(b, u[i]), pts[i]);
      max = Math.max(max, v_dot(d, d));
    }
    return max;
  }

  function reparam(pts, b, u) {
    var d1 = [v_scale(v_sub(b[1], b[0]), 3), v_scale(v_sub(b[2], b[1]), 3), v_scale(v_sub(b[3], b[2]), 3)];
    var d2 = [v_scale(v_sub(d1[1], d1[0]), 2), v_scale(v_sub(d1[2], d1[1]), 2)];
    return u.map(function (t, i) {
      var s = 1 - t;
      var q = bezPoint(b, t);
      var q1 = [s * s * d1[0][0] + 2 * s * t * d1[1][0] + t * t * d1[2][0], s * s * d1[0][1] + 2 * s * t * d1[1][1] + t * t * d1[2][1]];
      var q2 = [s * d2[0][0] + t * d2[1][0], s * d2[0][1] + t * d2[1][1]];
      var diff = v_sub(q, pts[i]);
      var den = v_dot(q1, q1) + v_dot(diff, q2);
      var nt = den !== 0 ? t - v_dot(diff, q1) / den : t;
      return Math.max(0, Math.min(1, nt));
    });
  }

  function curveDeviation(b, pts) {
    var worst = 0;
    for (var t = 1; t < 24; t++) {
      var q = bezPoint(b, t / 24), best = Infinity;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], c = pts[i], dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy;
        var s = L ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)) : 0;
        var ex = q[0] - a[0] - s * dx, ey = q[1] - a[1] - s * dy, e = ex * ex + ey * ey;
        if (e < best) best = e;
      }
      if (best > worst) worst = best;
    }
    return worst;
  }

  function tryFit(pts, t1, t2, tol) {
    if (pts.length === 2) return { ok: true, item: [pts[1][0], pts[1][1]] };
    var err2 = tol * tol;
    var u = chordParams(pts), b = generateBezier(pts, u, t1, t2), me = maxError(pts, b, u);
    for (var it = 0; it < 12 && me > err2 && me < err2 * 64; it++) {
      u = reparam(pts, b, u);
      b = generateBezier(pts, u, t1, t2);
      me = maxError(pts, b, u);
    }
    if (me > err2 || curveDeviation(b, pts) > err2) return { ok: false };
    return { ok: true, item: cubicOrLine(b, pts, tol) };
  }

  function centerTangent(pts, i, win) {
    var a = i, b = i;
    while (a > 0 && v_len(v_sub(pts[a], pts[i])) < win) a--;
    while (b < pts.length - 1 && v_len(v_sub(pts[b], pts[i])) < win) b++;
    return v_norm(v_sub(pts[b], pts[a]));
  }

  function fitCubic(pts, t1, t2, tol, out) {
    var last = pts.length - 1, start = 0, tin = t1, win = tol;
    while (start < last) {
      var whole = tryFit(pts.slice(start), tin, t2, tol);
      if (whole.ok) { out.push(whole.item); return; }
      var lo = start + 1, hi = last - 1, best = null, bestEnd = start + 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, tc = centerTangent(pts, mid, win);
        var f = tryFit(pts.slice(start, mid + 1), tin, v_scale(tc, -1), tol);
        if (f.ok) { best = f; bestEnd = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (!best) { best = { item: [pts[start + 1][0], pts[start + 1][1]] }; bestEnd = start + 1; }
      out.push(best.item);
      tin = centerTangent(pts, bestEnd, win);
      start = bestEnd;
    }
  }

  function cubicOrLine(b, pts, tol) {
    var a = pts[0], z = pts[pts.length - 1], ch = v_sub(z, a), L = v_len(ch);
    if (L > 0) {
      var straight = true;
      for (var i = 1; i < pts.length - 1 && straight; i++) {
        var d = Math.abs((pts[i][0] - a[0]) * ch[1] - (pts[i][1] - a[1]) * ch[0]) / L;
        if (d > tol) straight = false;
      }
      if (straight) return [z[0], z[1]];
    }
    return [b[3][0], b[3][1], b[1][0], b[1][1], b[2][0], b[2][1]];
  }

  function tangentAt(pts, i, dir) {
    var j = i, p = pts[i], L = 0;
    while (true) {
      var nj = j + dir;
      if (nj < 0 || nj >= pts.length) break;
      j = nj;
      L = v_len(v_sub(pts[j], p));
      if (L > 0 && (Math.abs(j - i) >= 3)) break;
    }
    return v_norm(v_sub(pts[j], p));
  }

  function splitCorners(pts, cyclic, win) {
    var n = pts.length, turns = [], corners = [];
    var reach = function (i, dir) {
      var j = i, steps = 0;
      while (steps < n - 1) {
        var nj = j + dir;
        if (cyclic) nj = (nj + n) % n;
        else if (nj < 0 || nj >= n) break;
        j = nj; steps++;
        if (v_len(v_sub(pts[j], pts[i])) >= win) break;
      }
      return j;
    };
    for (var i = 0; i < n; i++) {
      turns.push(0);
      if (!cyclic && (i === 0 || i === n - 1)) continue;
      var a = pts[reach(i, -1)], b = pts[reach(i, 1)], p = pts[i];
      var din = v_sub(p, a), dout = v_sub(b, p);
      if (v_len(din) === 0 || v_len(dout) === 0) continue;
      turns[i] = v_turn(din, dout);
    }
    for (i = 0; i < n; i++) {
      if (turns[i] <= CORNER) continue;
      var isMax = true;
      for (var dir = -1; dir <= 1 && isMax; dir += 2) {
        var j = i;
        while (true) {
          var nj = j + dir;
          if (cyclic) nj = (nj + n) % n;
          else if (nj < 0 || nj >= n) break;
          if (nj === i || v_len(v_sub(pts[nj], pts[i])) >= win) break;
          j = nj;
          if (turns[j] > turns[i] || (turns[j] === turns[i] && (dir < 0))) { isMax = false; break; }
        }
      }
      if (isMax) corners.push(i);
    }
    return corners;
  }

  function fitPolyRun(pts, t1, t2, tol, out) {
    var corners = splitCorners(pts, false, Math.min(tol / 2, 0.03));
    var cuts = [0].concat(corners, [pts.length - 1]);
    for (var c = 0; c < cuts.length - 1; c++) {
      var seg = pts.slice(cuts[c], cuts[c + 1] + 1);
      if (seg.length < 2) continue;
      var a = c === 0 && t1 ? t1 : tangentAt(seg, 0, 1);
      var b = c === cuts.length - 2 && t2 ? t2 : tangentAt(seg, seg.length - 1, -1);
      var simple = simplifyPolyline(seg, tol);
      if (simple.length === 2) { out.push(seg[seg.length - 1]); continue; }
      fitCubic(seg, a, b, tol, out);
    }
  }

  function fitContour(contour, centers, tol, S) {
    var n = contour.length;
    if (n < 3) return contour;
    var maxStep = Math.PI / 6, minSweep = Math.PI / 12;
    var near = function (p, c) {
      var d = Math.sqrt((p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]));
      return Math.abs(d - c[2]) < 2 / S + c[2] * 1e-3;
    };
    var angle = function (p, c) { return Math.atan2(p[1] - c[1], p[0] - c[0]); };
    var wrap = function (a) {
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a <= -Math.PI) a += 2 * Math.PI;
      return a;
    };

    var edgeCenter = [], edgeSweep = [];
    for (var i = 0; i < n; i++) {
      var p = contour[i], q = contour[(i + 1) % n], found = -1, sw = 0;
      for (var k = 0; k < centers.length; k++) {
        var c = centers[k];
        if (!near(p, c) || !near(q, c)) continue;
        var d = wrap(angle(q, c) - angle(p, c));
        if (Math.abs(d) < maxStep && Math.abs(d) > 1e-9) { found = k; sw = d; break; }
      }
      edgeCenter.push(found);
      edgeSweep.push(sw);
    }

    var runs = [], j0 = 0;
    for (i = 1; i <= n; i++) {
      if (i === n || edgeCenter[i] !== edgeCenter[j0]) {
        var s = 0;
        for (var t = j0; t < i; t++) s += edgeSweep[t];
        runs.push({ k: edgeCenter[j0], from: j0, to: i, sweep: s });
        j0 = i;
      }
    }
    if (runs.length > 1 && runs[0].k === runs[runs.length - 1].k) {
      var lr = runs.pop();
      runs[0] = { k: lr.k, from: lr.from - n, to: runs[0].to, sweep: lr.sweep + runs[0].sweep };
    }
    runs.forEach(function (rn) { rn.arc = rn.k >= 0 && Math.abs(rn.sweep) >= minSweep; });

    var at = function (idx) { return contour[((idx % n) + n) % n]; };

    if (!runs.some(function (rn) { return rn.arc; })) {
      var ring = contour.slice();
      var corners = splitCorners(ring, true, Math.min(tol / 2, 0.03));
      var out0 = [];
      if (corners.length) {
        var st = corners[0];
        var rot = ring.slice(st).concat(ring.slice(0, st));
        rot.push(rot[0]);
        out0.push(rot[0]);
        fitPolyRun(rot, null, null, tol, out0);
      } else {
        var closedPts = ring.concat([ring[0]]);
        var tg = v_norm(v_sub(ring[1], ring[n - 1]));
        out0.push(ring[0]);
        fitCubic(closedPts, tg, v_scale(tg, -1), tol, out0);
      }
      if (out0[out0.length - 1].length === 2) out0.pop();
      return out0;
    }

    var firstArc = 0;
    while (!runs[firstArc].arc) firstArc++;
    var ordered = runs.slice(firstArc).concat(runs.slice(0, firstArc).map(function (x) {
      return { k: x.k, from: x.from + n, to: x.to + n, sweep: x.sweep, arc: x.arc };
    }));
    var startIdx = ordered[0].from;
    var out = [at(startIdx)];
    var arcTangent = function (rn, end) {
      var c = centers[rn.k], pt = at(end ? rn.to : rn.from), a = angle(pt, c), sg = rn.sweep > 0 ? 1 : -1;
      return [-Math.sin(a) * sg, Math.cos(a) * sg];
    };

    var m = 0;
    while (m < ordered.length) {
      var rn = ordered[m];
      if (rn.arc) {
        var cc = centers[rn.k], r = cc[2], segs = arcSegmentCount(Math.abs(rn.sweep), r, tol), step = rn.sweep / segs;
        var a0 = angle(at(rn.from), cc), h = 4 / 3 * Math.tan(step / 4);
        for (var sI = 0; sI < segs; sI++) {
          var a1 = a0 + step;
          var p0 = sI === 0 ? at(rn.from) : [cc[0] + r * Math.cos(a0), cc[1] + r * Math.sin(a0)];
          var p3 = sI === segs - 1 ? at(rn.to) : [cc[0] + r * Math.cos(a1), cc[1] + r * Math.sin(a1)];
          out.push([p3[0], p3[1], p0[0] - h * r * Math.sin(a0), p0[1] + h * r * Math.cos(a0), p3[0] + h * r * Math.sin(a1), p3[1] - h * r * Math.cos(a1)]);
          a0 = a1;
        }
        m++;
        continue;
      }
      var prev = ordered[m - 1];
      var e = m;
      while (e < ordered.length && !ordered[e].arc) e++;
      var next = ordered[e % ordered.length];
      var from = rn.from, to = ordered[e - 1].to;
      var pts = [];
      for (var x = from; x <= to; x++) pts.push(at(x));
      var t1 = arcTangent(prev, true), t2 = v_scale(arcTangent(next, false), -1);
      if (pts.length > 2) {
        if (v_turn(t1, v_sub(pts[1], pts[0])) > CORNER) t1 = null;
        if (v_turn(v_scale(t2, -1), v_sub(pts[pts.length - 1], pts[pts.length - 2])) > CORNER) t2 = null;
      }
      fitPolyRun(pts, t1, t2, tol, out);
      m = e;
    }
    var last = out[out.length - 1];
    if (out.length > 1 && last.length === 2 && last[0] === out[0][0] && last[1] === out[0][1]) out.pop();
    return out;
  }

  function toClipperPath(points, S) {
    return points.map(function (p) { return { X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }; });
  }

  function fromClipperPath(path, S) {
    return path.map(function (pt) { return [pt.X / S, pt.Y / S]; });
  }

  function strokeRaw(subpaths, stroke, S) {
    var JT = ClipperLib.JoinType, ET = ClipperLib.EndType;
    var jt = stroke.linejoin === 'round' ? JT.jtRound
      : stroke.linejoin === 'bevel' ? JT.jtSquare
      : JT.jtMiter;
    var capET = stroke.linecap === 'round' ? ET.etOpenRound
      : stroke.linecap === 'square' ? ET.etOpenSquare
      : ET.etOpenButt;
    var r = stroke.width / 2;
    var co = new ClipperLib.ClipperOffset(stroke.miterLimit || 4, ClipperLib.ClipperOffset.def_arc_tolerance);
    var centers = [];

    subpaths.forEach(function (sp) {
      var pts = sp.points.slice();
      var closed = sp.closed;
      if (closed && pts.length > 1) {
        var a = pts[0], b = pts[pts.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
      }
      if (closed && pts.length < 3) closed = false;
      if (pts.length < 2) return;
      var path = toClipperPath(pts, S);
      path.forEach(function (pt, i) {
        var isEnd = !closed && (i === 0 || i === path.length - 1);
        if (isEnd ? stroke.linecap === 'round' : stroke.linejoin === 'round') centers.push([pt.X / S, pt.Y / S, r]);
      });
      co.AddPath(path, jt, closed ? ET.etClosedLine : capET);
    });

    var solution = [];
    co.Execute(solution, r * S);
    return { paths: solution, centers: centers };
  }

  function fillRaw(subpaths, fillRule, S) {
    var paths = [];
    subpaths.forEach(function (sp) {
      var pts = sp.points.slice();
      if (pts.length > 1) {
        var a = pts[0], b = pts[pts.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
      }
      if (pts.length >= 3) paths.push(toClipperPath(pts, S));
    });
    var ft = fillRule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero;
    var c = new ClipperLib.Clipper(), solution = [];
    c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    c.Execute(ClipperLib.ClipType.ctUnion, solution, ft, ft);
    return { paths: solution, centers: [] };
  }

  function clipPaths(subject, clip, type) {
    var c = new ClipperLib.Clipper(), solution = [];
    c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
    c.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return solution;
  }

  function outlineSubpaths(subpaths, stroke, opts) {
    opts = opts || {};
    var S = opts.scale || 1000;
    var smoothness = opts.smoothness > 0 ? opts.smoothness : 0.05;
    var raw = strokeRaw(subpaths, stroke, S);
    return raw.paths.map(function (path) {
      return fitContour(fromClipperPath(path, S), raw.centers, smoothness, S);
    });
  }

  function roundNum(n, p) {
    var f = Math.pow(10, p);
    return Math.round(n * f) / f;
  }

  function fmt(n, p) {
    var s = String(roundNum(n, p));
    if (s === '-0') return '0';
    return s.replace(/^(-?)0\./, '$1.');
  }

  function contoursToPathData(contours, precision, compact) {
    var R = function (v) { return roundNum(v, precision); };
    var cmds = [], cx = 0, cy = 0;
    contours.forEach(function (c) {
      if (!c.length) return;
      var sx = R(c[0][0]), sy = R(c[0][1]);
      c.forEach(function (pt, i) {
        var x = R(pt[0]), y = R(pt[1]), dx = R(x - cx), dy = R(y - cy);
        if (i === 0) {
          cmds.push(cmds.length ? [['m', [dx, dy]], ['M', [x, y]]] : [['M', [x, y]]]);
        } else if (pt.length === 2) {
          if (dx === 0 && dy === 0) return;
          cmds.push(dx === 0 ? [['v', [dy]], ['V', [y]]]
            : dy === 0 ? [['h', [dx]], ['H', [x]]]
            : [['l', [dx, dy]], ['L', [x, y]]]);
        } else {
          var c1x = R(pt[2]), c1y = R(pt[3]), c2x = R(pt[4]), c2y = R(pt[5]);
          cmds.push([
            ['c', [R(c1x - cx), R(c1y - cy), R(c2x - cx), R(c2y - cy), dx, dy]],
            ['C', [c1x, c1y, c2x, c2y, x, y]]
          ]);
        }
        cx = x; cy = y;
      });
      cmds.push([['z', []]]);
      cx = sx; cy = sy;
    });

    var out = '', prevLetter = '', prevNum = '';
    var render = function (letter, nums) {
      var dropLetter = compact && letter === prevLetter && 'mMzZ'.indexOf(letter) === -1;
      var str = dropLetter ? '' : letter, last = dropLetter ? prevNum : '';
      nums.forEach(function (v, i) {
        var n = fmt(v, precision);
        var glue = (i === 0 && !dropLetter) || n.charAt(0) === '-' || (n.charAt(0) === '.' && last.indexOf('.') !== -1);
        str += (glue ? '' : ' ') + n;
        last = n;
      });
      return { str: str, last: last, letter: letter };
    };
    cmds.forEach(function (variants) {
      var best = null;
      (compact ? variants : variants.slice(0, 1)).forEach(function (v) {
        var r = render(v[0], v[1]);
        if (!best || r.str.length < best.str.length) best = r;
      });
      out += best.str;
      prevLetter = best.letter;
      prevNum = best.last;
    });
    return out;
  }

  function emitSvg(outlineByColor, fillPaths, attrs) {
    var p = attrs.precision != null ? attrs.precision : 3;
    var compact = attrs.compact !== false;
    var parts = [];

    fillPaths.forEach(function (fp) {
      var fr = (fp.fillRule && fp.fillRule !== 'nonzero') ? ' fill-rule="' + fp.fillRule + '"' : '';
      parts.push('<path' + (fp.fill ? ' fill="' + fp.fill + '"' : '') + fr + ' d="' + fp.d + '"/>');
    });

    outlineByColor.forEach(function (contours, color) {
      var d = contoursToPathData(contours, p, compact);
      if (d) parts.push('<path' + (color ? ' fill="' + color + '"' : '') + ' d="' + d + '"/>');
    });

    var vb = attrs.viewBox ? ' viewBox="' + attrs.viewBox + '"' : '';
    var dims = (attrs.width ? ' width="' + attrs.width + '"' : '') +
      (attrs.height ? ' height="' + attrs.height + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg"' + vb + dims + '>' + parts.join('') + '</svg>';
  }

  function autoPrecision(viewBox) {
    var n = (String(viewBox).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    var size = n.length === 4 ? Math.max(n[2], n[3]) : 0;
    if (!(size > 0)) return 3;
    return Math.max(0, Math.min(4, Math.ceil(Math.log(2000 / size) / Math.LN10 - 1e-9)));
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

  var NAMED_COLORS = {
    white: '#ffffff', black: '#000000', red: '#ff0000', lime: '#00ff00', green: '#008000', blue: '#0000ff',
    yellow: '#ffff00', gray: '#808080', grey: '#808080', silver: '#c0c0c0', orange: '#ffa500',
    navy: '#000080', purple: '#800080', maroon: '#800000', teal: '#008080', aqua: '#00ffff', fuchsia: '#ff00ff'
  };

  function normalizeColorKey(c) {
    if (c == null) return '';
    c = String(c).trim().toLowerCase();
    if (!c || c === 'none' || c === 'transparent') return '';
    if (NAMED_COLORS[c]) return NAMED_COLORS[c];
    var m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(c);
    if (m) {
      var h = m[1].length <= 4 ? m[1].replace(/./g, '$&$&') : m[1];
      return '#' + h.slice(0, 6);
    }
    m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(c);
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(function (v) {
        var n = /%$/.test(v) ? parseFloat(v) * 2.55 : parseFloat(v);
        var hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
        return hex.length < 2 ? '0' + hex : hex;
      }).join('');
    }
    return c;
  }

  function paintsFill(style) {
    if (style.fill) return style.fill !== 'none';
    return !style.stroke || style.stroke === 'none';
  }

  function parseRoot(svgString, options) {
    var parser = options.parser || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
    if (!parser) return { error: 'Нет XML-парсера.' };
    var doc;
    try { doc = parser.parseFromString(svgString, 'image/svg+xml'); }
    catch (e) { return { error: 'Не удалось разобрать SVG.' }; }
    var root = doc && doc.documentElement;
    if (!root || localName(root) !== 'svg') return { error: 'Не удалось разобрать SVG.' };
    if (doc.getElementsByTagName) {
      var pe = doc.getElementsByTagName('parsererror');
      if (pe && pe.length) return { error: 'Не удалось разобрать SVG.' };
    }
    return { root: root };
  }

  // fill пустой = «не задан явно». Дефолтный SVG-black НЕ сохраняем как заливку:
  // у stroke-иконок это лишь осевые линии, чёрная заливка была бы мусором.
  var INITIAL_STYLE = {
    stroke: 'none', strokeWidth: '1', linecap: 'butt',
    linejoin: 'miter', miterlimit: '4', fill: '', fillRule: 'nonzero'
  };

  function walkShapes(root, warnings, visit) {
    (function walk(parent, inheritedStyle, inheritedT) {
      var nodes = parent.childNodes;
      if (!nodes) return;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || el.nodeType !== 1) continue;
        var tag = localName(el);
        var style = computeStyle(el, inheritedStyle);
        var combinedT = (inheritedT + ' ' + (el.getAttribute('transform') || '')).trim();
        if (tag === 'g' || tag === 'svg') { walk(el, style, combinedT); continue; }
        if (SKIP_SILENT[tag]) continue;
        if (!SHAPES[tag]) { warnings.push('Пропущен <' + tag + '>'); continue; }
        visit(el, tag, style, combinedT);
      }
    }(root, computeStyle(root, INITIAL_STYLE), (root.getAttribute('transform') || '').trim()));
  }

  function listColors(svgString, options) {
    var parsed = parseRoot(svgString, options || {});
    if (!parsed.root) return [];
    var found = [], index = {};
    var add = function (value) {
      var key = normalizeColorKey(value);
      if (!key) return;
      if (index[key] == null) {
        index[key] = found.length;
        found.push({ key: key, value: String(value).trim(), count: 0 });
      }
      found[index[key]].count++;
    };
    walkShapes(parsed.root, [], function (el, tag, style) {
      if (paintsFill(style)) add(style.fill || '#000');
      if (style.stroke && style.stroke !== 'none') add(style.stroke);
    });
    return found;
  }

  function convert(svgString, options) {
    options = options || {};
    var smoothness = options.smoothness > 0 ? options.smoothness : 0.05;
    var warnings = [];
    var S = 1000;

    var parsed = parseRoot(svgString, options);
    if (!parsed.root) return { svg: svgString, warnings: [parsed.error] };
    var root = parsed.root;

    var viewBox = root.getAttribute('viewBox') || '';
    var width = root.getAttribute('width') || '';
    var height = root.getAttribute('height') || '';
    if (!viewBox && width && height) viewBox = '0 0 ' + parseFloat(width) + ' ' + parseFloat(height);
    var precision = options.precision === 'auto' ? autoPrecision(viewBox)
      : options.precision >= 0 ? Math.round(options.precision) : 3;
    var recolor = options.removeColor ? '' : options.color ? String(options.color).trim() : null;
    var outColorOf = function (c) { return recolor !== null ? recolor : normalizeColor(c); };
    var transparent = (options.transparent || []).map(normalizeColorKey).filter(Boolean);
    var geometric = transparent.length > 0;

    var outlineByColor = new Map();
    var fillPaths = [];
    var layers = [];

    function paint(paintColor, raw) {
      if (!raw.paths.length) return;
      var Clip = ClipperLib.ClipType;
      if (transparent.indexOf(normalizeColorKey(paintColor)) !== -1) {
        layers.forEach(function (L) { L.paths = clipPaths(L.paths, raw.paths, Clip.ctDifference); });
        return;
      }
      var outColor = outColorOf(paintColor), key = normalizeColorKey(outColor), own = null;
      layers.forEach(function (L) {
        if (L.key === key) own = L;
        else L.paths = clipPaths(L.paths, raw.paths, Clip.ctDifference);
      });
      if (!own) {
        own = { key: key, color: outColor, paths: [], centers: [] };
        layers.push(own);
      }
      own.paths = clipPaths(own.paths, raw.paths, Clip.ctUnion);
      own.centers = own.centers.concat(raw.centers);
    }

    walkShapes(root, warnings, function (el, tag, style, combinedT) {
      var d0 = shapeToPathData(el, tag);
      if (!d0) { warnings.push('Пропущена пустая фигура <' + tag + '>'); return; }

      var sp = svgpath(d0).abs().unarc().unshort();
      if (combinedT) sp = sp.transform(combinedT);
      var dAbs = sp.toString();

      var localW = options.strokeWidth > 0 ? options.strokeWidth : (parseFloat(style.strokeWidth) || 1);
      var strokeWidth = localW * transformScale(combinedT);
      var hasStroke = style.stroke && style.stroke !== 'none' && strokeWidth > 0;
      var hasFill = paintsFill(style);
      var subpaths = hasStroke || (hasFill && geometric) ? flattenPath(dAbs, smoothness / 10) : null;
      var strokeParams = {
        width: strokeWidth,
        linecap: style.linecap,
        linejoin: style.linejoin,
        miterLimit: parseFloat(style.miterlimit) || 4
      };

      if (geometric) {
        if (hasFill) paint(style.fill || '#000', fillRaw(subpaths, style.fillRule, S));
        if (hasStroke) paint(style.stroke, strokeRaw(subpaths, strokeParams, S));
        return;
      }

      if (hasStroke) {
        var contours = outlineSubpaths(subpaths, strokeParams, { smoothness: smoothness, scale: S });
        if (contours.length) {
          var outlineColor = outColorOf(style.stroke);
          if (!outlineByColor.has(outlineColor)) outlineByColor.set(outlineColor, []);
          var bucket = outlineByColor.get(outlineColor);
          for (var k = 0; k < contours.length; k++) bucket.push(contours[k]);
        }
      }

      if (hasFill) {
        fillPaths.push({
          d: sp.round(precision).toString(),
          fill: outColorOf(style.fill),
          fillRule: style.fillRule
        });
      }
    });

    if (geometric) {
      layers.forEach(function (L) {
        var contours = L.paths.map(function (path) {
          return fitContour(fromClipperPath(path, S), L.centers, smoothness, S);
        });
        if (contours.length) outlineByColor.set(L.color, contours);
      });
      if (outlineByColor.size === 0) warnings.push('После вырезания ничего не осталось — всё закрыто прозрачными фигурами.');
    } else if (outlineByColor.size === 0) {
      if (recolor === null || !fillPaths.length) {
        warnings.push('Обводок не найдено — конвертировать нечего (иконка уже на заливке?).');
        return { svg: svgString, warnings: warnings };
      }
      warnings.push(recolor ? 'Обводок не найдено — заливки только перекрашены.' : 'Обводок не найдено — у заливок только убран цвет.');
    }

    var keepDims = options.dimensions !== false;
    var svg = emitSvg(outlineByColor, fillPaths, {
      viewBox: viewBox,
      width: keepDims ? width : '',
      height: keepDims ? height : '',
      precision: precision,
      compact: options.compact !== false
    });
    return { svg: svg, warnings: warnings };
  }

  return {
    convert: convert,
    shapeToPathData: shapeToPathData,
    flattenPath: flattenPath,
    outlineSubpaths: outlineSubpaths,
    emitSvg: emitSvg,
    autoPrecision: autoPrecision,
    transformScale: transformScale,
    computeStyle: computeStyle,
    normalizeColor: normalizeColor,
    normalizeColorKey: normalizeColorKey,
    listColors: listColors
  };
}));
