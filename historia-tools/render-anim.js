// Molang + Bedrock animation support for render.html (classic script, loaded before the module).
// Exposes window.HAnim = { mol, poseModel }.
(function () {
  const rad = (d) => (d || 0) * Math.PI / 180;
  const molCache = new Map();
  const MATH = {
    sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, trunc: Math.trunc, sqrt: Math.sqrt, pow: Math.pow, min: Math.min, max: Math.max, exp: Math.exp, ln: Math.log,
    mod: (a, b) => a % b, clamp: (x, a, b) => Math.min(Math.max(x, a), b), lerp: (a, b, t) => a + (b - a) * t,
    lerprotate: (a, b, t) => a + (b - a) * t, hermite_blend: (t) => 3 * t * t - 2 * t * t * t, random: (a, b) => (a + b) / 2,
    random_integer: (a, b) => Math.round((a + b) / 2), die_roll: () => 0, die_roll_integer: () => 0, pi: Math.PI,
    atan: (x) => Math.atan(x) * 180 / Math.PI, atan2: (y, x) => Math.atan2(y, x) * 180 / Math.PI,
    asin: (x) => Math.asin(x) * 180 / Math.PI, acos: (x) => Math.acos(x) * 180 / Math.PI, sign: Math.sign, min_angle: (a) => a,
  };
  function compile(src) {
    if (typeof src === 'number') return () => src;
    if (typeof src === 'boolean') return () => +src;
    const s = String(src).toLowerCase().trim();
    if (molCache.has(s)) return molCache.get(s);
    let js = s
      .replace(/'[^']*'/g, '0')
      .replace(/\bmath\.(\w+)/g, 'M.$1')
      .replace(/\b(?:query|q)\.(\w+)\s*\(/g, '__f(')
      .replace(/\b(?:query|q)\.(\w+)/g, '(Q.$1??0)')
      .replace(/\b(?:variable|v)\.(\w+)\s*=(?!=)/g, 'V.$1=')
      .replace(/\b(?:variable|v)\.(\w+)/g, '(V.$1??0)')
      .replace(/\b(?:temp|t)\.(\w+)\s*=(?!=)/g, 'T.$1=')
      .replace(/\b(?:temp|t)\.(\w+)/g, '(T.$1??0)')
      .replace(/\b(?:context|c)\.\w+/g, '0')
      .replace(/\bthis\b/g, '0');
    let fn;
    try {
      if (js.includes(';')) {
        const body = js.split(';').map((x) => x.trim()).filter(Boolean).map((x) => x + ';').join('\n');
        fn = new Function('Q', 'V', 'M', '__f', `const T={};${body} return 0;`);
      } else fn = new Function('Q', 'V', 'M', '__f', `const T={}; return (${js});`);
    } catch (e) { console.warn('molang', s); fn = () => 0; }
    const out = (ctx) => {
      try { const r = fn(ctx.q, ctx.v, MATH, () => 0); return r === true ? 1 : (typeof r === 'number' && isFinite(r) ? r : 0); } catch { return 0; }
    };
    molCache.set(s, out);
    return out;
  }
  const mol = (x, ctx) => compile(x)(ctx);
  const vec3 = (v, ctx, def) => {
    if (v == null) return def;
    if (Array.isArray(v)) return [0, 1, 2].map((i) => (v[i] == null ? def[i] : mol(v[i], ctx)));
    const n = mol(v, ctx); return [n, n, n];
  };
  function channel(ch, t, ctx, def) {
    if (ch == null) return null;
    if (Array.isArray(ch) || typeof ch !== 'object') return vec3(ch, ctx, def);
    if (ch.vector !== undefined) return vec3(ch.vector, ctx, def);
    const entries = Object.entries(ch).map(([k, v]) => [Number(k), v]).filter(([k]) => !isNaN(k)).sort((a, b) => a[0] - b[0]);
    if (!entries.length) return null;
    const val = (e, side) => (e && !Array.isArray(e) && typeof e === 'object' ? vec3(e[side] ?? e.post ?? e.pre, ctx, def) : vec3(e, ctx, def));
    const mode = (e) => (e && typeof e === 'object' && !Array.isArray(e) ? e.lerp_mode : null);
    if (t <= entries[0][0]) return val(entries[0][1], 'pre');
    const last = entries[entries.length - 1];
    if (t >= last[0]) return val(last[1], 'post');
    let i = 0; while (entries[i + 1][0] < t) i++;
    const [k0, e0] = entries[i], [k1, e1] = entries[i + 1];
    const a = val(e0, 'post'), b = val(e1, 'pre');
    const f = (t - k0) / (k1 - k0);
    if (mode(e0) === 'step') return a;
    if (mode(e0) === 'catmullrom' || mode(e1) === 'catmullrom') {
      const p0 = val(entries[Math.max(i - 1, 0)][1], 'post'), p3 = val(entries[Math.min(i + 2, entries.length - 1)][1], 'pre');
      const f2 = f * f, f3 = f2 * f;
      return a.map((_, j) => 0.5 * ((2 * a[j]) + (-p0[j] + b[j]) * f + (2 * p0[j] - 5 * a[j] + 4 * b[j] - p3[j]) * f2 + (-p0[j] + 3 * a[j] - 3 * b[j] + p3[j]) * f3));
    }
    return a.map((x, j) => x + (b[j] - x) * f);
  }
  function poseModel(model, anims, t, ctx) {
    const groups = model.userData.groups;
    const byLower = {};
    for (const [k, g] of Object.entries(groups)) byLower[k.toLowerCase()] = g;
    for (const g of Object.values(groups)) { g.rotation.copy(g.userData.restRot); g.position.copy(g.userData.restPos); g.scale.set(1, 1, 1); }
    for (const a of anims) {
      const len = a.animation_length || 0;
      const at = len && a.loop ? t % len : t;
      ctx.q.anim_time = at;
      for (const [bone, chans] of Object.entries(a.bones || {})) {
        const g = byLower[bone.toLowerCase()];
        if (!g) continue;
        const r = channel(chans.rotation, at, ctx, [0, 0, 0]);
        if (r) { g.rotation.x += rad(-r[0]); g.rotation.y += rad(-r[1]); g.rotation.z += rad(r[2]); }
        const p = channel(chans.position, at, ctx, [0, 0, 0]);
        if (p) { g.position.x += -p[0]; g.position.y += p[1]; g.position.z += p[2]; }
        const sc = channel(chans.scale, at, ctx, [1, 1, 1]);
        if (sc) g.scale.set(g.scale.x * sc[0], g.scale.y * sc[1], g.scale.z * sc[2]);
      }
    }
  }
  window.HAnim = { mol, poseModel };
})();
