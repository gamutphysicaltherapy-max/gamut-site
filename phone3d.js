// The 3D phones on index.html and teams.html. Every .stage that holds a
// .phone gets a real modelled iPhone drawn in WebGL: a titanium frame that
// catches the studio lights as it turns, black glass, a camera plateau with
// three lenses on the back, side buttons. No library: this file is the whole
// renderer (about 9 KB gzipped), so the page stays light.
//
// THE SCREEN IS NOT A TEXTURE. The phone's glass is drawn with a clear window
// where the display is, and the page's own element (the <img>, a stack of
// them, a <video>, or any live HTML) sits under that window, fitted to the
// display's four corners with a matrix3d every frame. So whatever is on the
// screen stays sharp, lazy-loads, plays and can be tapped like any other part
// of the page. To put something new on a phone, make it the .phone's first
// child; nothing here needs to change.
//
// The page's layout still decides where each phone goes: a .phone's box sets
// the phone's place and width, data-z its depth (px toward the viewer) and
// data-rot its roll (deg, clockwise). The resting lean is the .tilt's --rx /
// --ry, as before. World units are CSS px with the stage's centre as origin,
// and the camera sits CAM px in front, which is what CSS perspective means,
// so the 3D phone lands where the flat one was.
//
// Moving the pointer leans the phones toward it; dragging spins them (all the
// way round, to see the back) and they settle home on a spring. Without WebGL,
// or with scripts off, the flat CSS phones in landing.css remain.
(function () {
  'use strict';
  var stages = Array.prototype.slice.call(document.querySelectorAll('.stage')).filter(function (s) { return s.querySelector('.phone'); });
  if (!stages.length) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var CAM = 1500, BLEED = 90, RAD = Math.PI / 180;

  // The phone, in units of its own width. Proportions of an iPhone Pro.
  var P = { h: 2.09, d: 0.115, r: 0.175, ch: 0.024, bezel: 0.035 };
  P.sw = 1 - 2 * P.bezel; P.sh = P.sw * 1434 / 660; P.h = P.sh + 2 * P.bezel; P.sr = P.r - P.bezel;

  // ---------- small matrix kit (column-major, like GL) ----------
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
  function T(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
  function S(s) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]); }
  function RX(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function RY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function RZ(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function apply(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }

  // ---------- geometry: a rounded rectangle swept through a rounded edge ----------
  // Returns one buffer (position, normal) and three index ranges: the side
  // band with its two rounded edges, the front cap and the back cap.
  function sweep(w, h, r, depth, ch) {
    var outline = [], ARC = 14, K = 6, i, j;
    var cx = [w / 2 - r, -w / 2 + r, -w / 2 + r, w / 2 - r], cy = [h / 2 - r, h / 2 - r, -h / 2 + r, -h / 2 + r];
    for (var q = 0; q < 4; q++) for (i = 0; i <= ARC; i++) {
      var a = (q + i / ARC) * Math.PI / 2;
      outline.push([cx[q] + r * Math.cos(a), cy[q] + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    var profile = [];
    for (j = 0; j <= K; j++) { var f = j / K * Math.PI / 2; profile.push([ch * (1 - Math.sin(f)), depth / 2 - ch * (1 - Math.cos(f)), Math.sin(f), Math.cos(f)]); }
    for (j = 0; j <= K; j++) { var b = Math.PI / 2 + j / K * Math.PI / 2; profile.push([ch * (1 - Math.sin(b)), -depth / 2 + ch * (1 + Math.cos(b)), Math.sin(b), Math.cos(b)]); }
    var v = [], idx = [], n = outline.length, m = profile.length;
    for (i = 0; i < n; i++) for (j = 0; j < m; j++) {
      var o = outline[i], p = profile[j];
      v.push(o[0] - o[2] * p[0], o[1] - o[3] * p[0], p[1], o[2] * p[2], o[3] * p[2], p[3]);
    }
    for (i = 0; i < n; i++) for (j = 0; j < m - 1; j++) {
      var a0 = i * m + j, a1 = ((i + 1) % n) * m + j;
      idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1);
    }
    var side = [0, idx.length];
    function cap(z, nz) {
      var start = idx.length, base = v.length / 6;
      v.push(0, 0, z, 0, 0, nz);
      for (i = 0; i < n; i++) v.push(outline[i][0] - outline[i][2] * ch, outline[i][1] - outline[i][3] * ch, z, 0, 0, nz);
      for (i = 0; i < n; i++) { var c0 = base + 1 + i, c1 = base + 1 + (i + 1) % n; if (nz > 0) idx.push(base, c0, c1); else idx.push(base, c1, c0); }
      return [start, idx.length - start];
    }
    var front = cap(depth / 2, 1), back = cap(-depth / 2, -1);
    return { v: new Float32Array(v), i: new Uint16Array(idx), side: side, front: front, back: back };
  }

  // ---------- shaders ----------
  var VS = [
    'attribute vec3 aPos; attribute vec3 aNor;',
    'uniform mat4 uProj, uModel, uPart;',
    'varying vec3 vW, vN, vL, vP;',
    'void main(){ vec4 l = uPart * vec4(aPos, 1.0); vL = l.xyz; vP = aPos; vec4 w = uModel * l; vW = w.xyz;',
    '  vN = mat3(uModel) * mat3(uPart) * aNor; gl_Position = uProj * w; }'
  ].join('\n');
  var FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'varying vec3 vW, vN, vL, vP;',
    'uniform int uMat; uniform vec3 uCam; uniform vec4 uScreen; uniform vec3 uTint; uniform sampler2D uEmblem; uniform float uHasEmblem; uniform vec3 uFade;',
    // A photo studio, written as maths: soft boxes of light on a dark room.
    'float box(vec3 d, vec3 c, vec3 up, vec2 half_, float s){',
    '  float f = dot(d, c); vec3 t = normalize(cross(up, c)); vec3 b = cross(c, t);',
    '  vec2 q = vec2(dot(d, t), dot(d, b)) / max(f, 0.001);',
    '  vec2 e = smoothstep(half_ + s, half_ - s, abs(q)); return e.x * e.y * step(0.0, f); }',
    'vec3 env(vec3 d, float rough){',
    '  float s = mix(0.05, 0.7, rough);',
    '  vec3 c = mix(vec3(0.012, 0.016, 0.010), vec3(0.085, 0.10, 0.075), smoothstep(-0.6, 1.0, d.y));',
    '  c += vec3(1.00, 0.96, 0.88) * 5.0 * box(d, normalize(vec3(-0.75, 0.42, 0.52)), vec3(0,1,0), vec2(0.42, 0.85), s);',
    '  c += vec3(0.86, 0.95, 0.82) * 3.2 * box(d, normalize(vec3(0.85, -0.05, 0.45)), vec3(0,1,0), vec2(0.30, 0.90), s);',
    '  c += vec3(1.0) * 9.0 * box(d, normalize(vec3(0.38, 0.10, 0.92)), vec3(0,1,0), vec2(0.05, 1.3), s * 0.6);',
    '  c += vec3(1.00, 0.92, 0.82) * 2.2 * box(d, normalize(vec3(0.0, 0.95, 0.30)), vec3(0,0,-1), vec2(1.2, 0.26), s);',
    '  c += vec3(0.86, 0.55, 0.36) * 1.3 * box(d, normalize(vec3(0.1, -0.92, 0.36)), vec3(0,0,1), vec2(1.1, 0.2), s);',
    '  c += vec3(0.62, 0.72, 0.56) * 1.6 * box(d, normalize(vec3(-0.3, 0.2, -0.93)), vec3(0,1,0), vec2(0.8, 1.0), s);',
    '  return c; }',
    'float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }',
    'vec3 tone(vec3 c){ c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }',
    'float fadeAt(){ return uFade.z < 0.5 ? 1.0 : clamp((gl_FragCoord.y - uFade.y) / (uFade.x - uFade.y), 0.0, 1.0); }',
    'void main(){',
    '  vec3 N = normalize(vN); vec3 V = normalize(uCam - vW); if (dot(N, V) < 0.0) N = -N;',
    '  vec3 R = reflect(-V, N); float nv = clamp(dot(N, V), 0.0, 1.0); float fr = pow(1.0 - nv, 5.0);',
    '  vec3 col; float a = 1.0;',
    '  if (uMat == 0) {', // titanium: frame, buttons, lens rings
    '    vec3 base = uTint; vec3 F = base + (1.0 - base) * fr;',
    '    col = F * (env(R, 0.34) * 0.8 + env(R, 0.7) * 0.35) + base * 0.012;',
    '  } else if (uMat == 1) {', // front glass, with the display as a window
    '    vec3 refl = env(R, 0.03) * (0.045 + 0.6 * fr);',
    '    float sd = rr(vL.xy, uScreen.xy, uScreen.z); float aa = max(fwidth(sd), 0.0001);',
    '    float win = smoothstep(aa, -aa, sd + aa);',
    '    vec2 ip = vL.xy - vec2(0.0, uScreen.y - 0.088);',
    '    float isl = smoothstep(aa, -aa, rr(ip, vec2(0.128, 0.039), 0.039));',
    '    float lensd = length(ip - vec2(0.062, 0.0));',
    '    vec3 island = vec3(0.0) + vec3(0.012, 0.016, 0.04) * smoothstep(0.014, 0.006, lensd) + refl * 0.5;',
    '    vec3 bez = tone(vec3(0.004) + refl);',
    '    vec3 glare = tone(env(R, 0.03) * (0.010 + 0.45 * fr));',
    '    float ga = clamp(dot(glare, vec3(0.45)), 0.0, 0.35);',
    '    vec4 o = mix(vec4(bez, 1.0), vec4(glare, ga), win);',
    '    o = mix(o, vec4(tone(island), 1.0), isl * win);',
    '    gl_FragColor = o * fadeAt(); return;',
    '  } else if (uMat == 2 || uMat == 3) {', // back glass (2), camera plateau (3)
    '    float rough = uMat == 2 ? 0.55 : 0.3;',
    '    vec3 base = uTint * (uMat == 2 ? 1.0 : 1.25);',
    '    col = base * (0.16 + env(N, 1.0) * 0.5) + env(R, rough) * (0.022 + 0.32 * fr);',
    '    if (uMat == 2 && uHasEmblem > 0.5) {',
    '      vec2 uv = vec2(0.5 - vL.x / 0.17, 0.5 - (vL.y + 0.02) / 0.26);',
    '      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {',
    '        float m = texture2D(uEmblem, uv).a; col = mix(col, env(R, 0.2) * 0.55 + base * 0.5, m * 0.85); } }',
    '  } else {', // lens glass
    '    float rad = length(vP.xy);',
    '    vec3 glass = vec3(0.004, 0.005, 0.012) + env(R, 0.02) * (0.022 + 0.45 * fr);',
    '    glass += vec3(0.10, 0.07, 0.22) * smoothstep(0.050, 0.0, rad) * (0.35 + 0.65 * fr);',
    '    glass *= 0.55 + 0.45 * smoothstep(0.018, 0.03, rad);',
    '    col = glass;',
    '  }',
    '  gl_FragColor = vec4(tone(col), a) * fadeAt();',
    '}'
  ].join('\n');

  // ---------- 4 corners -> matrix3d (fits an element to a quad) ----------
  function adj(m) { return [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]]; }
  function mm(a, b) { var c = [], i, j, k; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) { var s = 0; for (k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s; } return c; }
  function mv(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function basis(p) { var m = [p[0], p[2], p[4], p[1], p[3], p[5], 1, 1, 1], v = mv(adj(m), [p[6], p[7], 1]); return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); }
  function quadCss(w, h, d) {
    var t = mm(basis(d), adj(basis([0, 0, w, 0, 0, h, w, h])));
    for (var i = 0; i < 9; i++) t[i] /= t[8];
    return 'matrix3d(' + [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(',') + ')';
  }

  // ---------- one stage ----------
  var MESH = {
    body: sweep(1, P.h, P.r, P.d, P.ch),
    plateau: sweep(0.47, 0.49, 0.135, 0.036, 0.012),
    lens: sweep(0.19, 0.19, 0.095, 0.034, 0.009),
    button: sweep(0.034, 1, 0.016, 0.022, 0.007)
  };
  var emblemImg = new Image();
  emblemImg.src = 'img/emblem.png';

  function Stage(el) {
    var canvas = document.createElement('canvas');
    canvas.className = 'gl-phone';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;

    function shader(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var prog = gl.createProgram();
    try { gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); } catch (e) { if (window.console) console.warn('phone3d', e); return null; }
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aNor');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    var U = {};
    ['uFade', 'uProj', 'uModel', 'uPart', 'uMat', 'uCam', 'uScreen', 'uTint', 'uEmblem', 'uHasEmblem'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    var bufs = {};
    Object.keys(MESH).forEach(function (k) {
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, MESH[k].v, gl.STATIC_DRAW);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MESH[k].i, gl.STATIC_DRAW);
      bufs[k] = { vb: vb, ib: ib };
    });
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
    var tex = gl.createTexture(), hasEmblem = false;
    function loadEmblem() {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, emblemImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      hasEmblem = true; dirty = true;
    }
    if (emblemImg.complete && emblemImg.naturalWidth) loadEmblem(); else emblemImg.addEventListener('load', loadEmblem);

    var tilt = el.querySelector('.tilt');
    var phones = Array.prototype.slice.call(el.querySelectorAll('.phone')).map(function (ph, n) {
      return { el: ph, screen: ph.firstElementChild, z: +(ph.getAttribute('data-z') || 0), rot: +(ph.getAttribute('data-rot') || 0),
        bob: ph.classList.contains('float') ? (ph.classList.contains('slow') ? 9.5 : 7) : 0, phase: n * 2.1 };
    });
    var tags = Array.prototype.slice.call(el.querySelectorAll('.tag-float')).map(function (t, n) {
      return { el: t, z: +(t.getAttribute('data-z') || 100), bob: t.classList.contains('slow') ? 9.5 : 7, phase: 1 + n * 1.7 };
    });
    // Tags sit above the canvas, so they leave .tilt (which may be masked, and
    // so stacks as one layer under it). Same positioned box, so nothing moves.
    if (tilt && tilt.offsetWidth === el.offsetWidth) tags.forEach(function (g) { el.appendChild(g.el); });
    el.appendChild(canvas);

    var W = 0, H = 0, dpr = 1, pivot = [0, 0], rest = { rx: 0, ry: 0 }, proj;
    var fade = null, dead = false;
    var dirty = true, visible = true, hovering = false, dragging = false;
    var cur = { rx: 0, ry: 0 }, vel = { rx: 0, ry: 0 }, hover = { rx: 0, ry: 0 }, spin = { rx: 0, ry: 0 }, last = null;

    function measure() {
      el.classList.add('gl-measure');
      var sr = el.getBoundingClientRect();
      W = sr.width; H = sr.height;
      var cs = tilt ? getComputedStyle(tilt) : null;
      rest.rx = cs ? parseFloat(cs.getPropertyValue('--rx')) || 0 : 0;
      rest.ry = cs ? parseFloat(cs.getPropertyValue('--ry')) || 0 : 0;
      // A stage may fade out toward its bottom edge (--fade-from / --fade-to, in
      // percent of its height). Safari stops repainting a WebGL canvas that sits
      // under a CSS mask, so the fade is drawn here instead: in the shader for
      // the phone and as opacity on each tag. The screens fade as one group,
      // through a mask on .tilt (landing.css), which holds no canvas.
      var es = getComputedStyle(el), f0 = parseFloat(es.getPropertyValue('--fade-from')), f1 = parseFloat(es.getPropertyValue('--fade-to'));
      fade = f1 > f0 ? [f0 / 100 * H, f1 / 100 * H] : null;
      var tr = tilt ? tilt.getBoundingClientRect() : sr;
      pivot = [tr.left + tr.width / 2 - sr.left - W / 2, -(tr.top + tr.height / 2 - sr.top - H / 2)];
      phones.forEach(function (p) {
        var r = p.el.getBoundingClientRect(), s = p.screen.getBoundingClientRect();
        p.w = r.width; p.x = r.left + r.width / 2 - sr.left - W / 2; p.y = -(r.top + r.height / 2 - sr.top - H / 2);
        p.sx = s.left - sr.left; p.sy = s.top - sr.top; p.sW = p.screen.offsetWidth; p.sH = p.screen.offsetHeight;
        p.screen.style.borderRadius = (P.sr / P.sw * p.sW).toFixed(2) + 'px';
      });
      tags.forEach(function (t) {
        var r = t.el.getBoundingClientRect();
        t.x = r.left + r.width / 2 - sr.left - W / 2; t.y = -(r.top + r.height / 2 - sr.top - H / 2);
      });
      el.classList.remove('gl-measure');
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = W + 2 * BLEED, ch = H + 2 * BLEED;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      var f = 2 * CAM / ch, near = CAM - 700, far = CAM + 700;
      proj = chain(new Float32Array([f * ch / cw, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]), T(0, 0, -CAM));
      dirty = true;
    }
    // World (px, y up, stage centre) to stage px (y down, top-left).
    function toPage(p) { var k = CAM / (CAM - p[2]); return [W / 2 + p[0] * k, H / 2 - p[1] * k]; }

    function part(mesh, range, mat, m, tint) {
      var b = bufs[mesh];
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.uniformMatrix4fv(U.uPart, false, m); gl.uniform1i(U.uMat, mat);
      if (tint) gl.uniform3fv(U.uTint, tint);
      gl.drawElements(gl.TRIANGLES, range[1], gl.UNSIGNED_SHORT, range[0] * 2);
    }
    var I = T(0, 0, 0), TI = [0.56, 0.545, 0.51], DARK = [0.16, 0.16, 0.15], REAR = [0.075, 0.105, 0.06];
    var PLAT = chain(T(0.215, P.h / 2 - 0.295, -P.d / 2 - 0.012), RY(Math.PI));
    var LENSES = [[0.105, 0.115], [0.105, -0.115], [-0.105, 0]].map(function (o) { return chain(T(0.215 + o[0], P.h / 2 - 0.295 + o[1], -P.d / 2 - 0.028), RY(Math.PI)); });
    function btn(side, y, len) { return chain(T(side * 0.4975, y, 0), RY(side * Math.PI / 2), new Float32Array([1, 0, 0, 0, 0, len, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])); }
    var BUTTONS = [btn(1, 0.33, 0.3), btn(-1, 0.63, 0.1), btn(-1, 0.43, 0.17), btn(-1, 0.22, 0.17)];

    function draw(now) {
      var t = now / 1000;
      var rig = chain(T(pivot[0], pivot[1], 0), RX(-cur.rx * RAD), RY(cur.ry * RAD), T(-pivot[0], -pivot[1], 0));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uProj, false, proj);
      gl.uniform3f(U.uCam, 0, 0, CAM);
      gl.uniform4f(U.uScreen, P.sw / 2, P.sh / 2, P.sr, 0);
      gl.uniform1f(U.uHasEmblem, hasEmblem ? 1 : 0);
      var sy = canvas.height / (H + 2 * BLEED);
      if (fade) gl.uniform3f(U.uFade, (H + BLEED - fade[0]) * sy, (H + BLEED - fade[1]) * sy, 1); else gl.uniform3f(U.uFade, 0, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.uEmblem, 0);
      phones.forEach(function (p) {
        var bob = p.bob && !reduce ? Math.sin(t * 2 * Math.PI / p.bob + p.phase) * 6 : 0;
        var M = chain(rig, T(p.x, p.y + bob, p.z), RZ(-p.rot * RAD), S(p.w));
        gl.uniformMatrix4fv(U.uModel, false, M);
        part('body', MESH.body.side, 0, I, TI);
        part('body', MESH.body.front, 1, I);
        part('body', MESH.body.back, 2, I, REAR);
        part('plateau', MESH.plateau.side, 3, PLAT, REAR);
        part('plateau', MESH.plateau.front, 3, PLAT, REAR);
        LENSES.forEach(function (L) { part('lens', MESH.lens.side, 0, L, DARK); part('lens', MESH.lens.front, 4, L); });
        BUTTONS.forEach(function (B) { part('button', MESH.button.side, 0, B, TI); part('button', MESH.button.front, 0, B, TI); });
        // Fit the page's own element to the display's four corners.
        var hw = P.sw / 2 + 0.004, hh = P.sh / 2 + 0.004, z = P.d / 2;
        var c = [[-hw, hh], [hw, hh], [-hw, -hh], [hw, -hh]].map(function (q) { var s = toPage(apply(M, q[0], q[1], z)); return [s[0] - p.sx, s[1] - p.sy]; });
        var facing = (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]);
        if (facing > 1) {
          p.screen.style.transform = quadCss(p.sW, p.sH, [c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]]);
          p.screen.style.visibility = '';
        } else p.screen.style.visibility = 'hidden';
        p.el.style.zIndex = Math.round(10 + apply(M, 0, 0, 0)[2] / 10);
      });
      tags.forEach(function (g) {
        var bob = reduce ? 0 : Math.sin(t * 2 * Math.PI / g.bob + g.phase) * 7;
        var s = toPage(apply(rig, g.x, g.y + bob, g.z)), home = [W / 2 + g.x, H / 2 - g.y];
        var back = Math.cos(cur.ry * RAD) < 0.2;
        g.el.style.transform = 'translate(' + (s[0] - home[0]).toFixed(2) + 'px,' + (s[1] - home[1]).toFixed(2) + 'px)';
        var fo = fade ? Math.max(0, Math.min(1, (fade[1] - s[1]) / (fade[1] - fade[0]))) : 1;
        g.el.style.opacity = back ? 0 : fo < 1 ? fo.toFixed(2) : '';
      });
    }

    function frame(now) {
      raf = 0;
      if (!visible || dead) return;
      var dt = last == null ? 0.016 : Math.min(0.05, (now - last) / 1000); last = now;
      var t = now / 1000, sway = reduce ? 0 : (fine ? 1.6 : 4.5);
      var goalX = rest.rx + (hovering && !dragging ? hover.rx - rest.rx : 0) + spin.rx + Math.sin(t * 0.43) * sway * 0.4;
      var goalY = rest.ry + (hovering && !dragging ? hover.ry - rest.ry : 0) + spin.ry + Math.sin(t * 0.31) * sway;
      var k = dragging ? 260 : 60, c = dragging ? 30 : 13;
      vel.rx += ((goalX - cur.rx) * k - vel.rx * c) * dt; vel.ry += ((goalY - cur.ry) * k - vel.ry * c) * dt;
      cur.rx += vel.rx * dt; cur.ry += vel.ry * dt;
      // Let go, and a spin finishes on the nearest front face.
      if (!dragging) { spin.ry -= spin.ry * Math.min(1, dt * 2.2); spin.rx -= spin.rx * Math.min(1, dt * 3); if (Math.abs(spin.ry) < 0.01) spin.ry = 0; }
      draw(now);
      var still = reduce && !dragging && Math.abs(vel.rx) + Math.abs(vel.ry) < 0.02 && Math.abs(goalX - cur.rx) + Math.abs(goalY - cur.ry) < 0.02;
      if (!still) raf = requestAnimationFrame(frame); else last = null;
    }
    var raf = 0;
    function wake() { if (!raf && visible && !dead) raf = requestAnimationFrame(frame); }

    // Pointer: lean on hover, spin on drag.
    el.addEventListener('pointermove', function (e) {
      if (dead) return;
      if (dragging) {
        spin.ry += (e.clientX - dragging.x) * 0.45; spin.rx = Math.max(-40, Math.min(40, spin.rx - (e.clientY - dragging.y) * 0.3));
        dragging.x = e.clientX; dragging.y = e.clientY; wake(); return;
      }
      if (!fine || reduce) return;
      var r = el.getBoundingClientRect();
      hover.ry = ((e.clientX - r.left) / r.width - 0.5) * 26; hover.rx = -((e.clientY - r.top) / r.height - 0.5) * 16;
      hovering = true; wake();
    });
    el.addEventListener('pointerleave', function () { hovering = false; wake(); });
    el.addEventListener('pointerdown', function (e) {
      if (dead || e.button || e.target.closest('a,button,input,video,[data-live]')) return;
      dragging = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      el.classList.add('grabbing'); wake();
    });
    function drop() {
      if (!dragging) return;
      dragging = false; el.classList.remove('grabbing');
      // Unwind to the nearest whole turn, so a spin never has to rewind.
      var turns = Math.round((cur.ry - rest.ry) / 360) * 360;
      cur.ry -= turns; spin.ry -= turns;
      wake();
    }
    el.addEventListener('pointerup', drop); el.addEventListener('pointercancel', drop);
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting && !document.hidden; last = null; wake(); }, { rootMargin: '120px' }).observe(el);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = null; wake(); } });
    var resizeTimer;
    function remeasure() { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (dead) return; measure(); wake(); }, 80); }
    window.addEventListener('resize', remeasure);
    window.addEventListener('load', remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    // If the browser takes the context away, hand the stage back to the flat
    // CSS phones completely: no half state where screens move and frames don't.
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); dead = true; el.classList.remove('gl', 'grabbing');
      phones.forEach(function (p) { var s = p.screen.style; s.transform = s.visibility = s.borderRadius = ''; p.el.style.zIndex = ''; });
      tags.forEach(function (g) { g.el.style.transform = g.el.style.opacity = ''; });
    });

    measure();
    cur.rx = rest.rx; cur.ry = rest.ry;
    el.classList.add('gl');
    draw(performance.now());
    wake();
    return true;
  }

  stages.forEach(function (el) { try { Stage(el); } catch (e) { el.classList.remove('gl'); if (window.console) console.warn('phone3d', e); } });
})();
