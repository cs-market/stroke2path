(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var STORE_KEY = 'stroke2path.settings';
  var ZOOMS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
  var BG_COLOR = { light: '#FFFFFF', dark: '#1F232B', checker: '#FFFFFF' };
  var EMPTY_ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 56"><path d="M12 40C26 6 50 6 60 28S94 52 108 16" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"/></svg>';
  var SIZES = [16, 24, 32, 48, 64];
  var THEME = {
    light: { ghost: '#C7CDD6', grid: '#E9ECF0', frame: '#D3D8DF', accent: '#C8106F', node: '#FFFFFF', text: '#2A2F3A' },
    dark: { ghost: '#4A515F', grid: '#2B3039', frame: '#3A404B', accent: '#FF6FB0', node: '#1F232B', text: '#E8EAEE' },
    checker: { ghost: '#BCC3CE', grid: '#DCE0E6', frame: '#C9CFD8', accent: '#C8106F', node: '#FFFFFF', text: '#2A2F3A' }
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    code: $('code'), out: $('out'), file: $('file'),
    width: $('width'), smoothRange: $('smoothness-range'), smooth: $('smoothness'),
    color: $('color'), precision: $('precision'), compact: $('compact'), dims: $('dims'),
    statSize: $('stat-size'), statNodes: $('stat-nodes'), warnings: $('warnings'),
    files: $('files'), filesCount: $('files-count'), filesList: $('files-list'),
    palette: $('palette'), chips: $('chips'),
    viewport: $('viewport'), board: $('board'), empty: $('empty'), drop: $('drop'), stage: $('stage'),
    emptyTitle: $('empty-title'), emptyText: $('empty-text'), emptyArt: $('empty-art'),
    contrast: $('contrast-note'), legend: $('legend'), holes: $('holes-note'),
    compareBar: $('compare-bar'), compare: $('compare'), sizes: $('sizes'),
    zoomFit: $('zoom-fit'), grid: $('grid'), copy: $('copy'), zip: $('zip')
  };

  var state = { files: [], current: -1, view: 'fill', bg: 'light', zoom: 1, compare: 50, transparent: [] };
  var compareRefs = null;

  function radioValue(name) {
    var r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  }

  function setRadio(name, value) {
    var r = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (r) r.checked = true;
  }

  function readOptions() {
    var w = parseFloat(el.width.value);
    var sm = parseFloat(el.smooth.value);
    var mode = radioValue('color-mode');
    var p = el.precision.value;
    return {
      strokeWidth: w > 0 ? w : null,
      smoothness: sm > 0 ? sm : 0.05,
      precision: p === 'auto' ? 'auto' : parseInt(p, 10),
      color: mode === 'solid' ? el.color.value : mode === 'current' ? 'currentColor' : null,
      removeColor: mode === 'remove',
      compact: el.compact.checked,
      dimensions: !el.dims.checked,
      transparent: state.transparent.slice()
    };
  }

  function saveSettings() {
    var data = {
      width: el.width.value, smoothness: el.smooth.value, colorMode: radioValue('color-mode'), color: el.color.value,
      precision: el.precision.value, compact: el.compact.checked, dims: el.dims.checked,
      view: state.view, bg: state.bg, grid: el.grid.checked
    };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function loadSettings() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
    if (!data) return;
    if (typeof data.width === 'string') el.width.value = data.width;
    if (parseFloat(data.smoothness) > 0) { el.smooth.value = data.smoothness; el.smoothRange.value = data.smoothness; }
    if (data.colorMode) setRadio('color-mode', data.colorMode);
    if (/^#[0-9a-f]{6}$/i.test(data.color || '')) el.color.value = data.color;
    if (data.precision != null && el.precision.querySelector('option[value="' + data.precision + '"]')) el.precision.value = data.precision;
    if (typeof data.compact === 'boolean') el.compact.checked = data.compact;
    if (typeof data.dims === 'boolean') el.dims.checked = data.dims;
    if (data.view) { state.view = data.view; setRadio('view', data.view); }
    if (THEME[data.bg]) { state.bg = data.bg; setRadio('bg', data.bg); }
    if (typeof data.grid === 'boolean') el.grid.checked = data.grid;
  }

  function currentFile() {
    return state.files[state.current] || null;
  }

  function ensureResult(f, opts, key) {
    if (f.key === key) return;
    f.key = key;
    if (!f.source.trim()) { f.result = ''; f.warnings = []; return; }
    try {
      var r = window.stroke2path.convert(f.source, opts);
      f.result = r.svg;
      f.warnings = r.warnings || [];
    } catch (e) {
      f.result = f.source;
      f.warnings = ['Не удалось обработать файл: ' + e.message];
    }
  }

  var generation = 0;
  function refresh() {
    var opts = readOptions(), key = JSON.stringify(opts);
    var f = currentFile();
    if (f) ensureResult(f, opts, key);
    renderCurrent();
    renderFiles(key);
    var my = ++generation;
    var queue = state.files.filter(function (x) { return x.key !== key; });
    (function step() {
      if (my !== generation || !queue.length) return;
      ensureResult(queue.shift(), opts, key);
      renderFiles(key);
      setTimeout(step, 0);
    }());
  }

  var refreshTimer = 0;
  function refreshSoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 120);
  }

  function byteSize(s) {
    return new Blob([s]).size;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' Б';
    return (n / 1024).toFixed(1).replace('.', ',') + ' КБ';
  }

  function pathInfo(svgText) {
    var doc = parseSvg(svgText);
    var info = { anchors: 0, curves: 0, paths: [] };
    if (!doc) return info;
    var paths = doc.getElementsByTagName('path');
    for (var i = 0; i < paths.length; i++) {
      var d = paths[i].getAttribute('d') || '';
      if (!d) continue;
      info.paths.push(d);
      try {
        window.svgpath(d).abs().unshort().iterate(function (s) {
          if (s[0] === 'Z') return;
          info.anchors++;
          if (s[0] === 'C' || s[0] === 'Q') info.curves++;
        });
      } catch (e) {}
    }
    return info;
  }

  function renderCurrent() {
    var f = currentFile();
    var has = !!(f && f.source.trim());
    el.out.value = has ? f.result : '';
    el.warnings.textContent = has && f.warnings.length ? f.warnings.join('\n') : '';
    if (!has) {
      el.statSize.textContent = '—';
      el.statNodes.textContent = '—';
    } else {
      var before = byteSize(f.source), after = byteSize(f.result);
      var pct = before ? Math.round((after - before) / before * 100) : 0;
      el.statSize.innerHTML = '';
      el.statSize.appendChild(document.createTextNode(formatBytes(before) + ' → ' + formatBytes(after) + '  '));
      var g = document.createElement('span');
      g.className = pct < 0 ? 'gain' : '';
      g.textContent = (pct < 0 ? '−' : pct > 0 ? '+' : '') + Math.abs(pct) + ' %';
      el.statSize.appendChild(g);
      var info = pathInfo(f.result);
      el.statNodes.textContent = f.result === f.source ? '—' : info.anchors + ', из них на кривых ' + info.curves;
    }
    ['download', 'copy'].forEach(function (id) { $(id).disabled = !has; });
    renderPalette();
    renderBoard();
    renderSizes();
  }

  function renderPalette() {
    var f = currentFile();
    var colors = f && f.source.trim() ? window.stroke2path.listColors(f.source) : [];
    el.palette.hidden = colors.length < 2 && !colors.some(function (c) { return state.transparent.indexOf(c.key) !== -1; });
    el.chips.innerHTML = '';
    if (el.palette.hidden) return;
    colors.forEach(function (c) {
      var on = state.transparent.indexOf(c.key) !== -1;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var sw = document.createElement('i');
      sw.className = 'swatch' + (on ? ' swatch-checker' : '');
      sw.setAttribute('aria-hidden', 'true');
      if (!on) sw.style.background = c.key === 'currentcolor' ? 'currentColor' : c.key;
      var label = document.createElement('span');
      label.textContent = c.key === 'currentcolor' ? 'currentColor' : c.key.toUpperCase();
      b.title = on ? 'Прозрачный. Нажмите, чтобы вернуть цвет' : 'Сделать прозрачным';
      b.appendChild(sw);
      b.appendChild(label);
      b.addEventListener('click', function () {
        var i = state.transparent.indexOf(c.key);
        if (i === -1) state.transparent.push(c.key); else state.transparent.splice(i, 1);
        refresh();
        var again = el.chips.querySelectorAll('.chip')[colors.indexOf(c)];
        if (again) again.focus();
      });
      el.chips.appendChild(b);
    });
  }

  function renderFiles(key) {
    var multi = state.files.length > 1;
    el.files.hidden = !multi;
    if (!multi) return;
    el.filesCount.textContent = 'Файлов: ' + state.files.length;
    el.filesList.innerHTML = '';
    state.files.forEach(function (f, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-current', i === state.current ? 'true' : 'false');
      var name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = f.name;
      var meta = document.createElement('span');
      meta.className = 'file-meta';
      if (f.key === key) {
        if (!parseSvg(f.source)) {
          meta.textContent = 'не читается';
          meta.className += ' file-warn';
        } else if (f.result === f.source) {
          meta.textContent = 'без обводок';
        } else {
          meta.textContent = formatBytes(byteSize(f.source)) + ' → ' + formatBytes(byteSize(f.result));
          if (f.warnings.length) meta.className += ' file-warn';
        }
        if (f.warnings.length) b.title = f.warnings.join('\n');
      } else {
        meta.textContent = '…';
      }
      b.appendChild(name);
      b.appendChild(meta);
      b.addEventListener('click', function () { selectFile(i); });
      li.appendChild(b);
      el.filesList.appendChild(li);
    });
  }

  function selectFile(i) {
    state.current = i;
    el.code.value = state.files[i].source;
    refresh();
    centerScroll();
  }

  function centerScroll() {
    var vp = el.viewport;
    vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
    vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
  }

  function parseSvg(text) {
    if (!text || !text.trim()) return null;
    var doc;
    try { doc = new DOMParser().parseFromString(text, 'image/svg+xml'); } catch (e) { return null; }
    if (!doc || doc.getElementsByTagName('parsererror').length) return null;
    var root = doc.documentElement;
    if (!root || root.localName !== 'svg') return null;
    sanitize(root);
    return root;
  }

  function sanitize(root) {
    ['script', 'foreignObject', 'iframe'].forEach(function (tag) {
      var list = root.getElementsByTagName(tag);
      while (list.length) list[0].parentNode.removeChild(list[0]);
    });
    var all = root.getElementsByTagName('*');
    [root].concat(Array.prototype.slice.call(all)).forEach(function (node) {
      Array.prototype.slice.call(node.attributes).forEach(function (a) {
        var n = a.name.toLowerCase();
        if (n.indexOf('on') === 0) node.removeAttribute(a.name);
        else if ((n === 'href' || n === 'xlink:href') && /^\s*javascript:/i.test(a.value)) node.removeAttribute(a.name);
      });
    });
  }

  function viewBoxOf(svg) {
    if (!svg) return null;
    var n = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(parseFloat);
    if (n.length === 4 && n[2] > 0 && n[3] > 0) return n;
    var w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
    if (w > 0 && h > 0) return [0, 0, w, h];
    return null;
  }

  function make(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function nested(svg, vb) {
    var n = document.importNode(svg, true);
    var own = viewBoxOf(svg);
    if (own) n.setAttribute('viewBox', own.join(' '));
    n.setAttribute('x', vb[0]);
    n.setAttribute('y', vb[1]);
    n.setAttribute('width', vb[2]);
    n.setAttribute('height', vb[3]);
    n.removeAttribute('style');
    return n;
  }

  function ghostOf(svg, color) {
    var g = svg.cloneNode(true);
    var nodes = [g].concat(Array.prototype.slice.call(g.getElementsByTagName('*')));
    nodes.forEach(function (node) {
      ['fill', 'stroke'].forEach(function (a) {
        var v = node.getAttribute(a);
        if (v && v.trim() !== 'none') node.setAttribute(a, color);
      });
      var st = node.getAttribute('style');
      if (st) node.setAttribute('style', st.replace(/(fill|stroke)\s*:\s*(?!none)[^;]+/gi, '$1:' + color));
    });
    if (!g.getAttribute('fill')) g.setAttribute('fill', color);
    return g;
  }

  function gridLayer(vb, ppu, theme) {
    var g = make('g', { 'aria-hidden': 'true' });
    var size = Math.max(vb[2], vb[3]), step = 1;
    while (size / step > 48) step *= 2;
    if (step * ppu >= 6) {
      var x0 = Math.ceil(vb[0] / step) * step, y0 = Math.ceil(vb[1] / step) * step;
      for (var x = x0; x <= vb[0] + vb[2] + 1e-9; x += step) {
        g.appendChild(make('line', { x1: x, y1: vb[1], x2: x, y2: vb[1] + vb[3], stroke: theme.grid, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
      }
      for (var y = y0; y <= vb[1] + vb[3] + 1e-9; y += step) {
        g.appendChild(make('line', { x1: vb[0], y1: y, x2: vb[0] + vb[2], y2: y, stroke: theme.grid, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
      }
    }
    g.appendChild(make('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: 'none', stroke: theme.frame, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
    return g;
  }

  function outlineLayer(paths, ppu, theme) {
    var g = make('g');
    var handles = make('g', { stroke: theme.accent, 'stroke-width': 1, 'stroke-opacity': 0.4, 'vector-effect': 'non-scaling-stroke' });
    var controls = make('g', { fill: theme.accent });
    var anchors = make('g', { fill: theme.node, stroke: theme.accent, 'stroke-width': 1.25 });
    var half = 3.25 / ppu, cr = 2.25 / ppu;
    var line = function (x1, y1, x2, y2) {
      handles.appendChild(make('line', { x1: x1, y1: y1, x2: x2, y2: y2, 'vector-effect': 'non-scaling-stroke' }));
    };
    paths.forEach(function (d) {
      g.appendChild(make('path', { d: d, fill: 'none', stroke: theme.accent, 'stroke-width': 1.25, 'vector-effect': 'non-scaling-stroke' }));
      try {
        window.svgpath(d).abs().unshort().iterate(function (s, i, x, y) {
          var k = s[0], ex, ey;
          if (k === 'Z') return;
          if (k === 'H') { ex = s[1]; ey = y; }
          else if (k === 'V') { ex = x; ey = s[1]; }
          else { ex = s[s.length - 2]; ey = s[s.length - 1]; }
          if (k === 'C') {
            line(x, y, s[1], s[2]);
            line(ex, ey, s[3], s[4]);
            controls.appendChild(make('circle', { cx: s[1], cy: s[2], r: cr }));
            controls.appendChild(make('circle', { cx: s[3], cy: s[4], r: cr }));
          } else if (k === 'Q') {
            line(x, y, s[1], s[2]);
            line(ex, ey, s[1], s[2]);
            controls.appendChild(make('circle', { cx: s[1], cy: s[2], r: cr }));
          }
          anchors.appendChild(make('rect', { x: ex - half, y: ey - half, width: half * 2, height: half * 2, 'vector-effect': 'non-scaling-stroke' }));
        });
      } catch (e) {}
    });
    g.appendChild(handles);
    g.appendChild(controls);
    g.appendChild(anchors);
    return g;
  }

  function boardMetrics(vb) {
    var vp = el.viewport, cs = getComputedStyle(vp);
    var availW = vp.offsetWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var availH = vp.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var fit = Math.max(0.01, Math.min(availW / vb[2], availH / vb[3]));
    var ppu = fit * state.zoom;
    return { w: vb[2] * ppu, h: vb[3] * ppu, ppu: ppu };
  }

  function emptyState(title, text) {
    el.empty.hidden = false;
    el.stage.classList.add('is-empty');
    el.emptyTitle.textContent = title;
    el.emptyText.textContent = text;
    el.board.innerHTML = '';
    el.board.style.width = el.board.style.height = '0px';
    el.board.style.margin = '';
    el.compareBar.hidden = true;
    el.legend.hidden = true;
    el.contrast.hidden = true;
    el.holes.hidden = true;
    compareRefs = null;
  }

  function hexLuminance(hex) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    var c = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function lowContrast(svg, bg) {
    var lb = hexLuminance(BG_COLOR[bg]), seen = 0, low = 0;
    var nodes = [svg].concat(Array.prototype.slice.call(svg.getElementsByTagName('*')));
    nodes.forEach(function (n) {
      var v = n.getAttribute('fill');
      if (!v || v === 'none') return;
      var l = v === 'currentColor' ? hexLuminance(THEME[bg].text) : hexLuminance(v);
      if (l == null) return;
      seen++;
      var ratio = (Math.max(l, lb) + 0.05) / (Math.min(l, lb) + 0.05);
      if (ratio < 1.6) low++;
    });
    if (!seen && svg.getElementsByTagName('path').length) {
      var l0 = hexLuminance('#000000');
      return (Math.max(l0, lb) + 0.05) / (Math.min(l0, lb) + 0.05) < 1.6;
    }
    return seen > 0 && low === seen;
  }

  function renderBoard() {
    var f = currentFile();
    el.viewport.setAttribute('data-bg', state.bg);
    el.zoomFit.textContent = zoomLabel(state.zoom);
    if (!f || !f.source.trim()) {
      emptyState('Обводка становится контуром', 'Перетащите сюда .svg-файлы или вставьте код в поле «Исходный SVG». Можно сразу несколько файлов.');
      return;
    }
    var src = parseSvg(f.source), res = parseSvg(f.result) || src;
    if (!src) {
      emptyState('Код не читается как SVG', 'Проверьте, что код скопирован целиком — от <svg до </svg>.');
      return;
    }
    el.empty.hidden = true;
    el.stage.classList.remove('is-empty');
    el.legend.hidden = state.view !== 'outline';
    el.contrast.hidden = state.view === 'outline' || !lowContrast(res, state.bg);
    el.holes.hidden = !state.transparent.length || state.bg !== 'light' || state.view === 'outline' || f.result === f.source;

    var theme = THEME[state.bg];
    var vb = viewBoxOf(res) || viewBoxOf(src) || [0, 0, 24, 24];
    var m = boardMetrics(vb);
    el.board.style.width = m.w + 'px';
    el.board.style.height = m.h + 'px';
    el.board.style.margin = Math.abs(state.zoom - 1) > 1e-6 ? el.viewport.offsetHeight + 'px ' + el.viewport.offsetWidth + 'px' : '';
    el.board.style.color = theme.text;

    var svg = make('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': 'Превью иконки' });
    if (el.grid.checked) svg.appendChild(gridLayer(vb, m.ppu, theme));
    compareRefs = null;
    el.compareBar.hidden = state.view !== 'compare';

    if (state.view === 'outline') {
      svg.appendChild(nested(ghostOf(src, theme.ghost), vb));
      svg.appendChild(outlineLayer(pathInfo(f.result).paths, m.ppu, theme));
    } else if (state.view === 'compare') {
      var defs = make('defs');
      var big = Math.max(vb[2], vb[3]) * 4;
      var before = make('rect', { x: vb[0] - big, y: vb[1] - big, height: vb[3] + big * 2 });
      var after = make('rect', { y: vb[1] - big, height: vb[3] + big * 2 });
      var cb = make('clipPath', { id: 'cmp-before' }), ca = make('clipPath', { id: 'cmp-after' });
      cb.appendChild(before);
      ca.appendChild(after);
      defs.appendChild(cb);
      defs.appendChild(ca);
      svg.appendChild(defs);
      var gb = make('g', { 'clip-path': 'url(#cmp-before)' });
      gb.appendChild(nested(src, vb));
      var ga = make('g', { 'clip-path': 'url(#cmp-after)' });
      ga.appendChild(nested(res, vb));
      svg.appendChild(gb);
      svg.appendChild(ga);
      var divider = make('line', { y1: vb[1] - big, y2: vb[1] + vb[3] + big, stroke: theme.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
      svg.appendChild(divider);
      compareRefs = { before: before, after: after, divider: divider, vb: vb, big: big };
      updateCompare();
    } else {
      svg.appendChild(nested(res, vb));
    }
    el.board.innerHTML = '';
    el.board.appendChild(svg);
  }

  function updateCompare() {
    if (!compareRefs) return;
    var r = compareRefs, x = r.vb[0] + r.vb[2] * state.compare / 100;
    r.before.setAttribute('width', x - (r.vb[0] - r.big));
    r.after.setAttribute('x', x);
    r.after.setAttribute('width', r.vb[0] + r.vb[2] + r.big - x);
    r.divider.setAttribute('x1', x);
    r.divider.setAttribute('x2', x);
    el.compare.value = state.compare;
  }

  function renderSizes() {
    var f = currentFile();
    el.sizes.setAttribute('data-bg', state.bg);
    el.sizes.innerHTML = '';
    if (!f || !f.result || !parseSvg(f.result)) { el.sizes.hidden = true; return; }
    el.sizes.hidden = false;
    var svgText = f.result.replace(/currentColor/g, THEME[state.bg].text);
    if (!/xmlns=/.test(svgText)) svgText = svgText.replace('<svg', '<svg xmlns="' + SVGNS + '"');
    var vb = viewBoxOf(parseSvg(f.result)) || [0, 0, 1, 1];
    var src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    SIZES.forEach(function (s) {
      var fig = document.createElement('figure');
      var img = document.createElement('img');
      img.alt = '';
      img.width = s;
      img.height = Math.round(s * vb[3] / vb[2]);
      img.src = src;
      var cap = document.createElement('figcaption');
      cap.textContent = s + ' px';
      fig.appendChild(img);
      fig.appendChild(cap);
      el.sizes.appendChild(fig);
    });
  }

  function setFiles(list) {
    state.files = list;
    state.zoom = 1;
    state.current = list.length ? 0 : -1;
    el.code.value = list.length ? list[0].source : '';
    refresh();
    centerScroll();
  }

  function readFiles(fileList) {
    var svgs = Array.prototype.filter.call(fileList, function (f) {
      return /\.svg$/i.test(f.name) || f.type === 'image/svg+xml';
    });
    if (!svgs.length) {
      el.warnings.textContent = 'Среди выбранных файлов нет .svg.';
      return;
    }
    Promise.all(svgs.map(function (f) {
      return f.text().then(function (text) { return { name: f.name, source: text, key: null }; });
    })).then(setFiles);
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function flash(button, text) {
    var original = button.getAttribute('data-label') || button.textContent;
    button.setAttribute('data-label', original);
    button.textContent = text;
    clearTimeout(button._t);
    button._t = setTimeout(function () { button.textContent = original; }, 1600);
  }

  function copyResult() {
    var text = el.out.value;
    if (!text) return;
    var done = function () { flash(el.copy, 'Скопировано'); };
    var fallback = function () {
      el.out.focus();
      el.out.select();
      try { document.execCommand('copy'); done(); } catch (e) { flash(el.copy, 'Выделите и скопируйте вручную'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function downloadZip() {
    var opts = readOptions(), key = JSON.stringify(opts);
    var enc = new TextEncoder();
    var entries = [];
    state.files.forEach(function (f) {
      if (!f.source.trim()) return;
      ensureResult(f, opts, key);
      if (!parseSvg(f.result)) return;
      entries.push({ name: /\.svg$/i.test(f.name) ? f.name : f.name + '.svg', data: enc.encode(f.result) });
    });
    if (!entries.length) return;
    download(new Blob([window.s2pZip.makeZip(entries)], { type: 'application/zip' }), 'stroke2path-icons.zip');
    renderFiles(key);
  }

  function setZoom(z, ax, ay) {
    var vp = el.viewport, vr = vp.getBoundingClientRect();
    if (ax == null) {
      ax = vr.left + vp.clientWidth / 2;
      ay = vr.top + vp.clientHeight / 2;
    }
    var br = el.board.getBoundingClientRect();
    var fx = br.width ? (ax - br.left) / br.width : 0.5;
    var fy = br.height ? (ay - br.top) / br.height : 0.5;
    state.zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z));
    renderBoard();
    var nr = el.board.getBoundingClientRect();
    vp.scrollLeft += nr.left + fx * nr.width - ax;
    vp.scrollTop += nr.top + fy * nr.height - ay;
  }

  function zoomLabel(z) {
    var v = z >= 10 ? Math.round(z) : Math.round(z * 10) / 10;
    return '×' + String(v).replace('.', ',');
  }

  function renderEmptyArt() {
    var r;
    try { r = window.stroke2path.convert(EMPTY_ART, { smoothness: 0.05, precision: 2 }); } catch (e) { return; }
    var src = parseSvg(EMPTY_ART), res = parseSvg(r.svg);
    if (!src || !res) return;
    var vb = [0, 0, 120, 56];
    var svg = make('svg', { viewBox: vb.join(' ') });
    svg.appendChild(nested(ghostOf(src, THEME.light.ghost), vb));
    svg.appendChild(outlineLayer(pathInfo(r.svg).paths, 3, THEME.light));
    el.emptyArt.appendChild(svg);
  }

  function stepZoom(dir) {
    var list = dir > 0 ? ZOOMS : ZOOMS.slice().reverse();
    for (var i = 0; i < list.length; i++) {
      if (dir > 0 ? list[i] > state.zoom + 1e-6 : list[i] < state.zoom - 1e-6) { setZoom(list[i]); return; }
    }
  }

  el.code.addEventListener('input', function () {
    var f = currentFile();
    if (!f) {
      state.files = [{ name: 'icon.svg', source: '', key: null }];
      state.current = 0;
      f = state.files[0];
    }
    f.source = el.code.value;
    f.key = null;
    refreshSoon();
  });

  el.smoothRange.addEventListener('input', function () { el.smooth.value = el.smoothRange.value; });
  el.smooth.addEventListener('input', function () {
    if (parseFloat(el.smooth.value) > 0) el.smoothRange.value = el.smooth.value;
  });

  [el.width, el.smooth, el.smoothRange, el.precision, el.compact, el.dims, el.color].forEach(function (input) {
    input.addEventListener('input', function () { saveSettings(); refreshSoon(); });
    input.addEventListener('change', function () { saveSettings(); refreshSoon(); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="color-mode"]'), function (r) {
    r.addEventListener('change', function () { saveSettings(); refresh(); });
  });
  el.color.addEventListener('click', function () {
    if (radioValue('color-mode') !== 'solid') { setRadio('color-mode', 'solid'); saveSettings(); refresh(); }
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="view"]'), function (r) {
    r.addEventListener('change', function () { state.view = r.value; saveSettings(); renderBoard(); centerScroll(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="bg"]'), function (r) {
    r.addEventListener('change', function () { state.bg = r.value; saveSettings(); renderBoard(); renderSizes(); });
  });
  el.grid.addEventListener('change', function () { saveSettings(); renderBoard(); });

  $('zoom-in').addEventListener('click', function () { stepZoom(1); });
  $('zoom-out').addEventListener('click', function () { stepZoom(-1); });
  el.zoomFit.addEventListener('click', function () { setZoom(1); });
  var wheelZoom = null;
  el.viewport.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.viewport.clientHeight : 1);
    if (!wheelZoom) {
      wheelZoom = { factor: 1 };
      requestAnimationFrame(function () {
        var w = wheelZoom;
        wheelZoom = null;
        setZoom(state.zoom * w.factor, w.x, w.y);
      });
    }
    wheelZoom.factor *= Math.exp(-dy * 0.002);
    wheelZoom.x = e.clientX;
    wheelZoom.y = e.clientY;
  }, { passive: false });

  el.compare.addEventListener('input', function () {
    state.compare = parseFloat(el.compare.value);
    updateCompare();
  });
  var dragging = false;
  var comparePointer = function (e) {
    var rect = el.board.getBoundingClientRect();
    if (!rect.width) return;
    state.compare = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    updateCompare();
  };
  el.board.addEventListener('pointerdown', function (e) {
    if (state.view !== 'compare') return;
    dragging = true;
    el.board.classList.add('dragging');
    el.board.setPointerCapture(e.pointerId);
    comparePointer(e);
  });
  el.board.addEventListener('pointermove', function (e) { if (dragging) comparePointer(e); });
  el.board.addEventListener('pointerup', function () { dragging = false; el.board.classList.remove('dragging'); });

  var openPicker = function () { el.file.click(); };
  $('open').addEventListener('click', openPicker);
  $('empty-open').addEventListener('click', openPicker);
  el.file.addEventListener('change', function () {
    if (el.file.files.length) readFiles(el.file.files);
    el.file.value = '';
  });

  $('files-clear').addEventListener('click', function () { setFiles([]); });

  $('download').addEventListener('click', function () {
    var f = currentFile();
    if (!f || !f.result) return;
    var name = /\.svg$/i.test(f.name) ? f.name : 'icon.svg';
    download(new Blob([f.result], { type: 'image/svg+xml' }), name);
  });
  el.copy.addEventListener('click', copyResult);
  el.zip.addEventListener('click', downloadZip);

  var dragDepth = 0;
  var hasFiles = function (e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
  };
  window.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    el.drop.hidden = false;
  });
  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) el.drop.hidden = true;
  });
  window.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    el.drop.hidden = true;
    readFiles(e.dataTransfer.files);
  });

  var resizeFrame = 0;
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(renderBoard);
    }).observe(el.viewport, { box: 'border-box' });
  } else {
    window.addEventListener('resize', renderBoard);
  }

  loadSettings();
  renderEmptyArt();
  refresh();
})();
