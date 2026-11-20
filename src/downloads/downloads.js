// /downloads: pick a Minecraft version, how to install (modpack or the mod on its own), a mod loader and a
// launcher; the "Your download" box and the install steps follow the choice. Data: the Modrinth snapshot built
// into the page (#dl-data, from downloads-tools/fetch-downloads.mjs) plus settings (#dl-config), refreshed from
// the Modrinth API on load so a new release shows up without a site update. The choice is kept in the URL hash
// (#mc=1.20.1&how=pack&loader=fabric&launcher=prism) so a link to it can be shared.
(function () {
  var root = document.getElementById('dl-app');
  if (!root) return;
  var data = JSON.parse(document.getElementById('dl-data').textContent);
  var cfg = JSON.parse(document.getElementById('dl-config').textContent);
  var API = 'https://api.modrinth.com/v2';
  var LOADER = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function day(iso) { var d = new Date(iso); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }
  function size(b) { return b >= 1048576 ? Math.round(b / 1048576) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  // "1.20.1" > "1.19.2" > "1.10.2" (numeric parts)
  function cmp(a, b) { a = a.split('.').map(Number); b = b.split('.').map(Number); for (var i = 0; i < 3; i++) { var d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }
  function fill(s, v) { return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
  // old uploads carry "1.0.0" as their version number; the real one is in the file name (ConquestReforged-mc1.16.5-5.0.10.1.jar)
  function ver(v) {
    var m = /mc[\d.]+-(\d+(?:\.\d+)+)\.jar$/.exec(v.files[0].name) || /-(\d+(?:\.\d+)+)-mc[\d.]+\.jar$/.exec(v.files[0].name);
    return v.version === '1.0.0' && m ? m[1] : v.version;
  }
  function primary(v) { return v.files.filter(function (f) { return f.primary; })[0] || v.files[0]; }
  // newest version of a project for this Minecraft version (+ loader); releases before betas
  function newest(list, mc, loader) {
    var hit = (list || []).filter(function (v) { return v.mc.indexOf(mc) >= 0 && (!loader || v.loaders.indexOf(loader) >= 0); });
    return hit.filter(function (v) { return v.type === 'release'; })[0] || hit[0] || null;
  }
  function page(key, v) { var p = data.projects[key]; return 'https://modrinth.com/' + p.type + '/' + p.slug + (v ? '/version/' + v.id : ''); }

  // Minecraft versions the mod exists for, newest first
  function mcVersions() {
    var seen = {};
    data.versions.mod.forEach(function (v) { v.mc.forEach(function (m) { seen[m] = 1; }); });
    return Object.keys(seen).sort(cmp).reverse();
  }
  function packKey(loader) { return loader === 'forge' ? 'packForge' : 'packFabric'; }
  function loadersFor(mc, how) {
    return ['fabric', 'forge'].filter(function (l) { return how === 'pack' ? !!newest(data.versions[packKey(l)], mc) : !!newest(data.versions.mod, mc, l); });
  }

  // ---------- state ----------
  var state = {};
  function readHash() {
    var h = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[1]) h[kv[0]] = decodeURIComponent(kv[1]); });
    return h;
  }
  function settle(want) {
    var mcs = mcVersions();
    var mc = mcs.indexOf(want.mc) >= 0 ? want.mc : mcs[0];
    var hows = ['pack', 'mod'].filter(function (h) { return loadersFor(mc, h).length; });
    var how = hows.indexOf(want.how) >= 0 ? want.how : hows[0];
    var loaders = loadersFor(mc, how);
    var loader = loaders.indexOf(want.loader) >= 0 ? want.loader : loaders[0];
    var launchers = cfg.launchers.map(function (l) { return l.id; });
    var launcher = launchers.indexOf(want.launcher) >= 0 ? want.launcher : (cfg.launchers.filter(function (l) { return l.recommended; })[0] || cfg.launchers[0]).id;
    state = { mc: mc, how: how, loader: loader, launcher: launcher };
  }
  function writeHash() {
    var h = '#mc=' + state.mc + '&how=' + state.how + '&loader=' + state.loader + (state.how === 'pack' ? '&launcher=' + state.launcher : '');
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  // ---------- rendering ----------
  function opt(group, value, on, inner, extra) {
    return '<button type="button" class="dl-opt' + (on ? ' on' : '') + (extra || '') + '" data-group="' + group + '" data-value="' + esc(value) + '" aria-pressed="' + on + '"><i class="dl-check" aria-hidden="true"></i><span class="dl-opt-body">' + inner + '</span></button>';
  }
  function tag(t, cls) { return '<em class="dl-tag' + (cls ? ' ' + cls : '') + '">' + t + '</em>'; }

  function renderSteps() {
    var mcs = mcVersions(), latest = mcs[0];
    var main = [], older = [];
    mcs.forEach(function (mc) {
      var v = newest(data.versions.mod, mc);
      var legacy = cmp(mc, cfg.legacyBefore) < 0;
      var inner = '<b>Minecraft ' + esc(mc) + '</b>' + (mc === latest ? tag('Latest', 'gold') : legacy ? tag('No longer updated') : '')
        + '<small>Conquest Reforged ' + esc(ver(v)) + ' · ' + day(v.date) + '</small>';
      (mc === latest ? main : older).push(opt('mc', mc, mc === state.mc, inner, mc === latest ? ' big' : ''));
    });
    var olderOpen = state.mc !== latest;
    root.querySelector('[data-step="mc"] .dl-opts').innerHTML = main.join('')
      + '<details class="dl-older"' + (olderOpen ? ' open' : '') + '><summary>Older Minecraft versions <small>(' + older.length + ')</small></summary><div class="dl-opts dl-grid">' + older.join('') + '</div></details>';

    var packLoaders = loadersFor(state.mc, 'pack'), modLoaders = loadersFor(state.mc, 'mod');
    var pv = packLoaders.length ? newest(data.versions[packKey(packLoaders[0])], state.mc) : null;
    var nMods = pv ? pv.deps.length + 1 : 0;
    var hows = opt('how', 'pack', state.how === 'pack', '<b>Modpack</b>' + (packLoaders.length ? tag('Recommended', 'gold') : tag('Not for ' + esc(state.mc)))
      + '<small>' + (packLoaders.length ? 'Conquest Reforged, its resource pack and about ' + nMods + ' mods for performance, shaders and connected textures, all set up. Installs through a launcher.' : 'There is no modpack for this Minecraft version. Install the mod on its own.') + '</small>', packLoaders.length ? '' : ' off')
      + opt('how', 'mod', state.how === 'mod', '<b>Just the mod</b><small>The Conquest Reforged .jar, for your own modpack or a server. You add the required mods yourself.</small>', modLoaders.length ? '' : ' off');
    root.querySelector('[data-step="how"] .dl-opts').innerHTML = hows;

    var loaders = loadersFor(state.mc, state.how);
    root.querySelector('[data-step="loader"] .dl-opts').innerHTML = ['fabric', 'forge'].map(function (l) {
      var ok = loaders.indexOf(l) >= 0;
      var v = ok ? (state.how === 'pack' ? newest(data.versions[packKey(l)], state.mc) : newest(data.versions.mod, state.mc, l)) : null;
      var sub = !ok ? 'Not available for ' + esc(state.mc) : state.how === 'pack' ? (v.deps.length + 1) + ' mods · ' + esc(v.version) : esc(ver(v)) + ' · ' + size(primary(v).size);
      return opt('loader', l, ok && state.loader === l, '<b>' + LOADER[l] + '</b><small>' + sub + '</small>', ok ? '' : ' off');
    }).join('');

    var ls = root.querySelector('[data-step="launcher"]');
    ls.hidden = state.how !== 'pack';
    ls.querySelector('.dl-opts').innerHTML = cfg.launchers.map(function (l) {
      return opt('launcher', l.id, state.launcher === l.id, '<img src="' + l.icon + '" alt="" width="40" height="40"><b>' + esc(l.name) + '</b>' + (l.recommended ? tag('Recommended') : '') + '<small>' + esc(l.blurb) + '</small>', ' has-icon');
    }).join('');
    // step numbers follow the steps that are shown
    var n = 0;
    root.querySelectorAll('.dl-step').forEach(function (s) { if (!s.hidden) s.querySelector('.dl-n').textContent = 'Step ' + (++n); });
  }

  function renderPanel() {
    var pack = state.how === 'pack';
    var key = pack ? packKey(state.loader) : 'mod';
    var v = pack ? newest(data.versions[key], state.mc) : newest(data.versions.mod, state.mc, state.loader);
    if (!v) return;
    var f = primary(v), launcher = cfg.launchers.filter(function (l) { return l.id === state.launcher; })[0];
    var title = pack ? data.projects[key].title.replace(/\s*\((Fabric|Forge)\)/, '') : 'Conquest Reforged';
    var rows = '<li><span>' + esc(title) + '</span><b>' + esc(pack ? v.version : ver(v)) + '</b></li>'
      + '<li><span>Minecraft ' + esc(state.mc) + '</span><b>' + LOADER[state.loader] + '</b></li>'
      + '<li><span>Released</span><b>' + day(v.date) + '</b></li>';
    var file = '<p class="dl-file"><span>' + esc(f.name) + '</span><b>' + size(f.size) + '</b></p>';
    var btns;
    if (pack && state.launcher === 'modrinth') {
      btns = '<a class="dl-btn main" href="' + page(key) + '" target="_blank" rel="noopener">Open on Modrinth</a>'
        + '<a class="dl-btn" href="' + launcher.url + '" target="_blank" rel="noopener">Get the Modrinth App</a>';
    } else if (pack) {
      btns = '<a class="dl-btn main" href="' + launcher.url + '" target="_blank" rel="noopener">Get ' + esc(launcher.name) + '</a>'
        + '<a class="dl-btn" href="' + f.url + '">Download the .mrpack</a>'
        + '<a class="dl-btn" href="' + page(key) + '" target="_blank" rel="noopener">Modpack page on Modrinth</a>';
    } else {
      btns = '<a class="dl-btn main" href="' + f.url + '">Download the .jar</a>'
        + '<a class="dl-btn" href="' + page('mod', v) + '" target="_blank" rel="noopener">This version on Modrinth</a>';
    }
    var deps = '';
    if (!pack) {
      var req = v.deps.filter(function (d) { return d.type === 'required' && data.libs[d.id]; });
      var unknown = v.deps.filter(function (d) { return d.type === 'required' && !data.libs[d.id]; }).length;
      if (req.length || unknown) {
        deps = '<div class="dl-deps"><h4>Also needs</h4><ul>' + req.map(function (d) {
          var l = data.libs[d.id];
          return '<li><a href="https://modrinth.com/' + l.type + '/' + l.slug + '" target="_blank" rel="noopener">' + esc(l.title) + '</a></li>';
        }).join('') + (unknown ? '<li>and ' + unknown + ' more (see Modrinth)</li>' : '') + '</ul></div>';
      }
    }
    var notes = '<div class="dl-note"><h4>Before you play</h4><p>Give Minecraft about <b>' + cfg.memoryGB + ' GB</b> of memory.'
      + (cmp(state.mc, cfg.optifineUpTo) > 0 ? ' Don\'t use OptiFine on this version.' : ' On this version you\'ll probably need to add OptiFine yourself for connected textures.')
      + '</p></div>';
    root.querySelector('.dl-panel-body').innerHTML = '<ul class="dl-sum">' + rows + '</ul>' + file + '<div class="dl-btns">' + btns + '</div>'
      + '<a class="dl-log" href="' + page(key, v) + '" target="_blank" rel="noopener">Changelog for ' + esc(pack ? v.version : ver(v)) + ' →</a>' + deps + notes;

    // install steps
    var vars = { memory: cfg.memoryGB, mc: state.mc, loaderName: LOADER[state.loader], packPage: page(key), packTitle: esc(data.projects[key] ? data.projects[key].title : ''), ctm: '' };
    // connected textures: Continuity when it's among the required mods already, OptiFine on old versions
    var hasCtm = v.deps.some(function (d) { var l = data.libs[d.id]; return d.type === 'required' && l && l.slug === 'continuity'; });
    vars.ctm = hasCtm ? '' : cmp(state.mc, cfg.optifineUpTo) <= 0 ? ' and <b>OptiFine</b>' : state.loader === 'fabric' ? ' and <b>Continuity</b>' : '';
    var steps = pack ? launcher.steps : cfg.modSteps;
    root.querySelector('.dl-how h3').textContent = pack ? 'Installing with ' + launcher.name : 'Installing the mod by hand';
    root.querySelector('.dl-how ol').innerHTML = steps.map(function (s) { return '<li>' + fill(s, vars) + '</li>'; }).join('');
    root.querySelector('.dl-how .dl-how-foot').innerHTML = pack ? '' : 'Not sure? The modpack does all of this for you, and is the easiest way to play.';
  }

  function render() { renderSteps(); renderPanel(); writeHash(); }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('.dl-opt');
    if (!b || b.classList.contains('off') || !root.contains(b)) return;
    var want = Object.assign({}, state);
    want[b.getAttribute('data-group')] = b.getAttribute('data-value');
    settle(want);
    render();
  });
  window.addEventListener('hashchange', function () { settle(readHash()); render(); });

  settle(readHash());
  render();

  // ---------- live refresh from Modrinth ----------
  function slim(v) {
    return { id: v.id, name: v.name, version: v.version_number, type: v.version_type, date: v.date_published, mc: v.game_versions, loaders: v.loaders,
      files: v.files.map(function (f) { return { name: f.filename, size: f.size, url: f.url, primary: f.primary }; }),
      deps: v.dependencies.filter(function (d) { return d.project_id; }).map(function (d) { return { id: d.project_id, type: d.dependency_type }; }) };
  }
  if (window.fetch) {
    var keys = Object.keys(data.projects);
    var ctl = window.AbortController ? new AbortController() : null;
    if (ctl) setTimeout(function () { ctl.abort(); }, 8000);
    Promise.all(keys.map(function (k) {
      return fetch(API + '/project/' + data.projects[k].id + '/version', ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    })).then(function (all) {
      var changed = false;
      all.forEach(function (list, i) {
        var k = keys[i], fresh = list.map(slim);
        if (fresh.length && (!data.versions[k].length || fresh[0].id !== data.versions[k][0].id || fresh.length !== data.versions[k].length)) { data.versions[k] = fresh; changed = true; }
      });
      root.setAttribute('data-live', '1');
      if (changed) render();
    }).catch(function () { /* keep the built-in snapshot */ });
  }
})();
