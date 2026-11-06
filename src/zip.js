(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.s2pZip = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function uniqueNames(names) {
    var seen = {};
    return names.map(function (name) {
      if (!seen[name]) { seen[name] = 1; return name; }
      var dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
      var n = seen[name] + 1, candidate = base + '-' + n + ext;
      while (seen[candidate]) { n++; candidate = base + '-' + n + ext; }
      seen[name] = n;
      seen[candidate] = 1;
      return candidate;
    });
  }

  function makeZip(files, date) {
    date = date || new Date();
    var time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    var day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    var enc = new TextEncoder();
    var names = uniqueNames(files.map(function (f) { return f.name; }));
    var entries = files.map(function (f, i) {
      var nameBytes = enc.encode(names[i]);
      return { name: nameBytes, data: f.data, crc: crc32(f.data) };
    });

    var size = 22;
    entries.forEach(function (e) { size += 30 + e.name.length + e.data.length + 46 + e.name.length; });
    var buf = new Uint8Array(size), view = new DataView(buf.buffer), pos = 0;
    var u16 = function (v) { view.setUint16(pos, v, true); pos += 2; };
    var u32 = function (v) { view.setUint32(pos, v >>> 0, true); pos += 4; };
    var bytes = function (b) { buf.set(b, pos); pos += b.length; };

    entries.forEach(function (e) {
      e.offset = pos;
      u32(0x04034B50); u16(20); u16(0x0800); u16(0); u16(time); u16(day);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
      bytes(e.name); bytes(e.data);
    });
    var cdStart = pos;
    entries.forEach(function (e) {
      u32(0x02014B50); u16(20); u16(20); u16(0x0800); u16(0); u16(time); u16(day);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); u16(0);
      u16(0); u16(0); u32(0); u32(e.offset);
      bytes(e.name);
    });
    var cdSize = pos - cdStart;
    u32(0x06054B50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cdStart); u16(0);
    return buf;
  }

  return { makeZip: makeZip, crc32: crc32, uniqueNames: uniqueNames };
}));
