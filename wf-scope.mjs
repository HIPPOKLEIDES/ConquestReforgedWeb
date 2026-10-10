// Re-scopes Webflow's stylesheet under `.wfs` so original Webflow markup can live inside our own page chrome
// without its html/body/element rules touching the Webstudio header, footer and banner.
export function scopeCss(css, scope = '.wfs') {
  let i = 0;
  const n = css.length;
  const skipWs = () => { while (i < n && /\s/.test(css[i])) i++; };
  const readUntil = (chars) => {
    let depth = 0, q = null;
    const s = i;
    while (i < n) {
      const c = css[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (!depth && chars.includes(c)) break;
      i++;
    }
    return css.slice(s, i);
  };
  const readBlock = () => { // positioned at '{'
    i++;
    const s = i;
    let d = 1, q = null;
    while (i < n && d) {
      const c = css[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '{') d++;
      else if (c === '}') d--;
      i++;
    }
    return css.slice(s, i - 1);
  };
  const splitSel = (sel) => {
    const out = [];
    let d = 0, s = 0;
    for (let k = 0; k < sel.length; k++) {
      const c = sel[k];
      if (c === '(' || c === '[') d++;
      else if (c === ')' || c === ']') d--;
      else if (c === ',' && !d) { out.push(sel.slice(s, k)); s = k + 1; }
    }
    out.push(sel.slice(s));
    return out.map((x) => x.trim()).filter(Boolean);
  };
  const scopeSel = (sel) => {
    if (sel === ':root') return scope;
    if (/^(:root|::-webkit-scrollbar)/.test(sel)) return null;
    if (/^html\b/.test(sel) && /\.w-mod-/.test(sel)) return null;
    const m = sel.match(/^(html|body)((?:\.[\w-]+|:[\w-]+)*)(.*)$/s);
    if (m && m[1] === 'html') return null;
    if (m) return (scope + (m[3] ? ' ' + m[3].trim() : '')).trim();
    return `${scope} ${sel}`;
  };
  let out = '';
  while (i < n) {
    skipWs();
    if (i >= n) break;
    if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
    if (css[i] === '@') {
      const head = readUntil(';{');
      if (css[i] === ';') { i++; if (!/^@(charset|import)/.test(head)) out += head + ';'; continue; }
      const body = readBlock();
      if (/^@(media|supports|container|layer)/.test(head)) out += `${head}{${scopeCss(body, scope)}}`;
      else out += `${head}{${body}}`; // @font-face, @keyframes
      continue;
    }
    const sel = readUntil('{');
    if (css[i] !== '{') break;
    const body = readBlock();
    const sels = splitSel(sel).map(scopeSel).filter(Boolean);
    if (sels.length) out += `${sels.join(',')}{${body}}`;
  }
  return out;
}
