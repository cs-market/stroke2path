(function () {
  'use strict';

  var codeEl = document.getElementById('code');
  var widthEl = document.getElementById('width');
  var smoothEl = document.getElementById('smoothness');
  var convertBtn = document.getElementById('convert');
  var downloadBtn = document.getElementById('download');
  var warningsEl = document.getElementById('warnings');
  var pvBox = document.getElementById('pv-box');

  // Последний введённый пользователем SVG (до конвертации).
  // Нужен, чтобы смена настроек переконвертировала из оригинала, а не из уже залитого результата.
  var source = '';

  function parseWidth() {
    var v = widthEl.value.trim();
    return v === '' ? null : parseFloat(v);
  }
  function parseSmooth() {
    var v = parseFloat(smoothEl.value);
    return v > 0 ? v : 0.05;
  }

  function renderPreview() {
    var txt = codeEl.value.trim();
    pvBox.innerHTML = '';
    if (!txt) return;
    try {
      var doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      if (doc.getElementsByTagName('parsererror').length) { pvBox.textContent = 'Невалидный SVG'; return; }
      var svg = doc.documentElement;
      // вырезаем потенциально опасные узлы
      var scripts = svg.getElementsByTagName('script');
      while (scripts.length) scripts[0].parentNode.removeChild(scripts[0]);
      svg.setAttribute('width', '240');
      svg.setAttribute('height', '240');
      pvBox.appendChild(document.importNode(svg, true));
    } catch (e) {
      pvBox.textContent = 'Невалидный SVG';
    }
  }

  function showWarnings(warnings) {
    warningsEl.textContent = (warnings && warnings.length) ? warnings.join('\n') : '';
  }

  function doConvert() {
    if (!source.trim()) source = codeEl.value;
    if (!source.trim()) return;
    var res = window.stroke2path.convert(source, {
      strokeWidth: parseWidth(),
      smoothness: parseSmooth()
    });
    codeEl.value = res.svg;
    renderPreview();
    showWarnings(res.warnings);
  }

  codeEl.addEventListener('input', function () {
    source = codeEl.value;
    showWarnings([]);
    renderPreview();
  });

  convertBtn.addEventListener('click', doConvert);

  [widthEl, smoothEl].forEach(function (el) {
    el.addEventListener('input', function () {
      if (source.trim()) doConvert();
    });
  });

  // drag-n-drop файла в поле
  ['dragover', 'drop'].forEach(function (type) {
    codeEl.addEventListener(type, function (e) { e.preventDefault(); });
  });
  codeEl.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      codeEl.value = String(reader.result);
      source = codeEl.value;
      showWarnings([]);
      renderPreview();
    };
    reader.readAsText(f);
  });

  downloadBtn.addEventListener('click', function () {
    var data = codeEl.value;
    if (!data.trim()) return;
    var blob = new Blob([data], { type: 'image/svg+xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'icon.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  });
})();
