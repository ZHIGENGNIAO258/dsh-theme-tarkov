// dsh-theme-tarkov — browser client half: Beta warning banner, background
// music dock + leader election, settings panel, Web Audio chimes. Polls
// /dsh-tarkov/sfx-poll and plays chimes; BGM streams via /dsh-tarkov/audio
// into an HTMLAudioElement; the Settings → Plugins card reads/writes
// /dsh-tarkov/prefs (host prefs.json is the source of truth).
window.__ModuleLoader__.load({
  id: 'dsh-theme-tarkov',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var React = require('react');

    // ---- prefs (host /dsh-tarkov/prefs is the source of truth) -----------
    var DEFAULTS = {
      banner: { enabled: true, text1: '注意！这是“Deepseek Harness”的Beta测试版本。', text2: 'Beta测试版本不代表本产品的最终质量。感谢您的理解和支持，祝你好运！', opacity: 0.55 },
      sfx: { enabled: true, volume: 70, sounds: { done: null, approval: null, error: null } },
      music: { enabled: false, volume: 40, trackId: null, disabled: [], removed: [] },
      pet: { enabled: true, size: 160, volume: 70 },
    };
    var cfg = JSON.parse(JSON.stringify(DEFAULTS));
    var LEGACY_KEY = 'dsh.tarkov.prefs.v1';
    var MAX_CUSTOM_BYTES = 1500000;

    var rerender = new Set();
    function notify() {
      for (var f of Array.from(rerender)) { try { f(); } catch (e) { /* component gone */ } }
      syncBgmFromPrefs();
      syncBannerFromPrefs();
      syncPetFromPrefs();
    }

    function fetchPrefs() {
      return fetch('/dsh-tarkov/prefs')
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.prefs && typeof res.prefs === 'object') { cfg = res.prefs; notify(); }
        })
        .catch(function () { /* host routes not up yet */ });
    }
    // Partial PUT: the host merges field-wise (mergePrefs), so a track change
    // never resends the custom-sound dataUrls. Echo responses are sequence
    // guarded: a slow response for an earlier click must never overwrite the
    // newer local state (cfg is updated synchronously on click), otherwise the
    // checkbox visually bounces back and looks unresponsive.
    var patchSeq = 0;
    function patchPrefs(partial) {
      var seq = ++patchSeq;
      return fetch('/dsh-tarkov/prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(partial),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (seq === patchSeq && res && res.prefs && typeof res.prefs === 'object') { cfg = res.prefs; notify(); }
        })
        .catch(function () { /* host unavailable */ });
    }
    var patchTimer = null;
    function patchPrefsDebounced(partial) {
      clearTimeout(patchTimer);
      patchTimer = setTimeout(function () { patchPrefs(partial); }, 400);
    }
    // Legacy client stored {sfx, sfxVolume} in localStorage; migrate once to the host store.
    function migrateLegacy() {
      var legacy = null;
      try {
        var raw = localStorage.getItem(LEGACY_KEY);
        if (raw) legacy = JSON.parse(raw);
      } catch (e) { /* ignore */ }
      if (!legacy || typeof legacy !== 'object') return Promise.resolve();
      var patch = {};
      if (typeof legacy.sfx === 'boolean') patch.sfx = { enabled: legacy.sfx };
      if (typeof legacy.sfxVolume === 'number' && legacy.sfxVolume >= 0 && legacy.sfxVolume <= 100) {
        patch.sfx = Object.assign(patch.sfx || {}, { volume: legacy.sfxVolume });
      }
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
      return patchPrefs(patch);
    }

    // ---- Web Audio player (chimes) ---------------------------------------
    var audioCtx = null;
    var bufferCache = new Map();
    var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;

    function ensureCtx() {
      if (!AC) return null;
      if (audioCtx === null) {
        try { audioCtx = new AC(); } catch (e) { return null; }
      }
      return audioCtx;
    }
    function resumeIfNeeded(actx) {
      if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) { /* autoplay policy */ } }
    }
    function decodeBuffer(arrayBuffer) {
      var actx = ensureCtx();
      if (!actx || !arrayBuffer) return Promise.resolve(null);
      return actx.decodeAudioData(arrayBuffer).catch(function () { return null; });
    }
    function playBuffer(buffer, vol) {
      var actx = ensureCtx();
      if (!actx || !buffer) return;
      try {
        resumeIfNeeded(actx);
        var src = actx.createBufferSource();
        src.buffer = buffer;
        var gain = actx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, vol));
        src.connect(gain);
        gain.connect(actx.destination);
        src.start();
      } catch (err) { console.error('dsh-theme-tarkov: play failed', err); }
    }
    function dataUrlToBuffer(dataUrl) {
      if (typeof atob !== 'function') return null;
      var comma = dataUrl.indexOf(',');
      if (comma < 0) return null;
      try {
        var bin = atob(dataUrl.slice(comma + 1));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
      } catch (e) { console.error('dsh-theme-tarkov: atob failed', e); return null; }
    }
    function fetchSfx(type) {
      return fetch('/dsh-tarkov/sfx?id=' + encodeURIComponent(type))
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .catch(function () { return null; });
    }
    function playType(type) {
      if (!cfg.sfx.enabled) return;
      var vol = Math.max(0, Math.min(1, (cfg.sfx.volume || 0) / 100));
      if (vol <= 0.001) return;
      var custom = cfg.sfx.sounds && cfg.sfx.sounds[type];
      if (custom && custom.dataUrl) {
        var ckey = 'custom:' + type;
        if (bufferCache.has(ckey)) { playBuffer(bufferCache.get(ckey), vol); return; }
        var raw = dataUrlToBuffer(custom.dataUrl);
        if (!raw) return;
        decodeBuffer(raw).then(function (buf) {
          if (buf) { bufferCache.set(ckey, buf); playBuffer(buf, vol); }
        });
        return;
      }
      if (bufferCache.has(type)) { playBuffer(bufferCache.get(type), vol); return; }
      fetchSfx(type).then(function (ab) {
        if (!ab) return;
        return decodeBuffer(ab).then(function (buf) {
          if (buf) { bufferCache.set(type, buf); playBuffer(buf, vol); }
        });
      });
    }

    function startPolling() {
      window.setInterval(function () {
        if (!cfg.sfx.enabled) return;
        fetch('/dsh-tarkov/sfx-poll')
          .then(function (r) { return r.json(); })
          .then(function (res) {
            var items = (res && Array.isArray(res.items)) ? res.items : [];
            for (var i = 0; i < items.length; i++) {
              var t = items[i] && items[i].type;
              if (t === 'done' || t === 'approval' || t === 'error') playType(t);
            }
          })
          .catch(function () { /* host routes unavailable yet */ });
      }, 2000);
    }

    // ---- background music --------------------------------------------------
    var MUSIC_DIR_HINT = null;
    var bgmAllTracks = []; // full library from the host (includes builtin flag)
    var bgmTracks = [];    // playable subset (library minus disabled tracks)
    var bgm = {
      el: null,
      playing: false,
      wantPlay: false,
      autoplayBlocked: false,
      loadError: null,
    };
    var bgmUi = { root: null, nameEl: null, dotEl: null, playBtn: null, status: null, volSlider: null, select: null };

    function trackUrl(id) { return '/dsh-tarkov/audio?id=' + encodeURIComponent(id); }
    function ensureAudioEl() {
      if (bgm.el) return bgm.el;
      if (typeof Audio === 'undefined') return null;
      var a = new Audio();
      a.addEventListener('ended', function () { if (isBgmLeader()) playNext(); });
      a.addEventListener('error', function () {
        bgm.loadError = '音频加载失败';
        paintBgm();
      });
      bgm.el = a;
      return a;
    }
    function setBgmVolume(v) {
      var a = bgm.el;
      if (a) a.volume = Math.max(0, Math.min(1, (v || 0) / 100));
    }
    function isTrackDisabled(id) {
      var list = Array.isArray(cfg.music.disabled) ? cfg.music.disabled : [];
      return list.indexOf(id) !== -1;
    }
    function applyDisabledFilter() {
      bgmTracks = bgmAllTracks.filter(function (t) { return !isTrackDisabled(t.id); });
    }
    function loadTracks() {
      return fetch('/dsh-tarkov/music')
        .then(function (r) { return r.json(); })
        .then(function (res) {
          bgmAllTracks = (res && Array.isArray(res.tracks)) ? res.tracks : [];
          MUSIC_DIR_HINT = (res && typeof res.dir === 'string') ? res.dir : null;
          applyDisabledFilter();
          // A persisted trackId that no longer exists in the library (renamed
          // or removed file) is cleared so the dock never sits on a missing
          // track; the preference self-heals on the next track change.
          if (cfg.music.trackId && !bgmTracks.some(function (t) { return t.id === cfg.music.trackId; })) {
            cfg.music.trackId = null;
          }
          notify();
        })
        .catch(function () { bgmAllTracks = []; bgmTracks = []; });
    }
    function findTrack(id) {
      for (var i = 0; i < bgmTracks.length; i++) if (bgmTracks[i].id === id) return bgmTracks[i];
      return null;
    }
    function trackName(id) {
      var t = findTrack(id);
      return t ? t.name : (id || '');
    }
    function pickNext() {
      if (bgmTracks.length === 0) return null;
      if (bgmTracks.length === 1) return bgmTracks[0].id;
      var current = cfg.music.trackId;
      var pool = bgmTracks.filter(function (t) { return t.id !== current; });
      var list = pool.length > 0 ? pool : bgmTracks;
      return list[Math.floor(Math.random() * list.length)].id;
    }
    function playTrack(id) {
      var a = ensureAudioEl();
      if (!a || !id) return;
      if (isTrackDisabled(id)) return;
      if (!findTrack(id)) {
        bgm.loadError = '未找到曲目：' + id;
        paintBgm();
        return;
      }
      bgm.loadError = null;
      cfg.music.trackId = id;
      a.src = trackUrl(id);
      setBgmVolume(cfg.music.volume);
      bgm.wantPlay = true;
      var p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          bgm.playing = true;
          bgm.autoplayBlocked = false;
          broadcastState();
          paintBgm();
        }).catch(function () {
          bgm.playing = false;
          bgm.autoplayBlocked = true; // needs a user gesture
          paintBgm();
        });
      } else {
        bgm.playing = true;
        paintBgm();
      }
      patchPrefsDebounced({ music: { trackId: id } });
    }
    function playNext() {
      if (!isBgmLeader() || bgmTracks.length === 0) return;
      var next = pickNext();
      if (next) playTrack(next);
    }
    function togglePlay() {
      var a = bgm.el;
      // A muted track behaves like "no selection": start a playable one.
      if (!a || !cfg.music.trackId || isTrackDisabled(cfg.music.trackId)) {
        if (bgmTracks.length > 0) playTrack(pickNext() || bgmTracks[0].id);
        return;
      }
      if (a.paused) {
        bgm.wantPlay = true;
        var p = a.play();
        if (p && typeof p.then === 'function') {
          p.then(function () { bgm.playing = true; bgm.autoplayBlocked = false; broadcastState(); paintBgm(); })
            .catch(function () { bgm.autoplayBlocked = true; paintBgm(); });
        } else { bgm.playing = true; paintBgm(); }
      } else {
        a.pause();
        bgm.playing = false;
        bgm.wantPlay = false;
        paintBgm();
      }
    }

    // ---- multi-tab leader election (BGM plays in exactly one tab) ---------
    var LEAD_KEY = 'dsh.tarkov.bgm.leader';
    var HB_KEY = 'dsh.tarkov.bgm.heartbeat';
    var STALE_MS = 12000;
    var instId = null;
    var bgmBC = null;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* full */ } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* full */ } }
    function isBgmLeader() { return lsGet(LEAD_KEY) === instId; }
    function heartbeat() { lsSet(HB_KEY, String(Date.now())); }
    function broadcast(msg) { if (bgmBC) { try { bgmBC.postMessage(msg); } catch (e) { /* closed */ } } }
    function broadcastState() {
      broadcast({ type: 'state', playing: bgm.playing, trackId: cfg.music.trackId, name: trackName(cfg.music.trackId), blocked: bgm.autoplayBlocked });
    }
    function adoptLeader() {
      lsSet(LEAD_KEY, instId);
      heartbeat();
      broadcast({ type: 'leader', id: instId });
      onLeaderChanged(true);
    }
    function onLeaderChanged(leader) {
      if (!leader) {
        if (bgm.el && !bgm.el.paused) { try { bgm.el.pause(); } catch (e) { /* ignore */ } }
        bgm.playing = false;
        bgm.wantPlay = false;
        paintBgm();
        return;
      }
      if (!cfg.music.enabled) { paintBgm(); return; }
      if (bgmTracks.length > 0) {
        if (cfg.music.trackId) playTrack(cfg.music.trackId);
        else playTrack(pickNext() || bgmTracks[0].id);
      }
      paintBgm();
    }
    function leaderTick() {
      if (isBgmLeader()) {
        heartbeat();
        return;
      }
      var hb = Number(lsGet(HB_KEY) || 0);
      var lead = lsGet(LEAD_KEY);
      if (!lead || !hb || Date.now() - hb > STALE_MS) adoptLeader();
    }
    function onBgmMessage(ev) {
      var msg = ev && ev.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'leader' && msg.id !== instId) {
        if (isBgmLeader()) lsDel(LEAD_KEY);
        onLeaderChanged(false);
      } else if (msg.cmd && isBgmLeader()) {
        if (msg.cmd === 'toggle') togglePlay();
        else if (msg.cmd === 'next') playNext();
        else if (msg.cmd === 'volume') {
          if (typeof msg.value === 'number') {
            cfg.music.volume = Math.max(0, Math.min(100, msg.value));
            setBgmVolume(cfg.music.volume);
            patchPrefsDebounced({ music: { volume: cfg.music.volume } });
            paintBgm();
          }
        }
      }
    }

    // ---- BGM dock UI (corner floating widget, DOM-injected) ----------------
    var BGM_CSS = null;
    function ensureBgmCss() {
      if (BGM_CSS !== null) return;
      BGM_CSS = document.createElement('style');
      BGM_CSS.textContent = [
        '#tarkov-bgm { position: fixed; right: 14px; bottom: 16px; z-index: 10050; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }',
        '#tarkov-bgm * { box-sizing: border-box; }',
        '#tarkov-bgm-btn { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; font: 600 12px system-ui, "Microsoft YaHei", sans-serif; color: #ffd7ae; background: rgba(30, 20, 10, 0.92); border: 1px solid rgba(224, 121, 48, 0.55); border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.35); opacity: 0.85; }',
        '#tarkov-bgm-btn:hover { opacity: 1; }',
        '#tarkov-bgm-btn .dot { width: 7px; height: 7px; border-radius: 50%; background: #8a8a8a; }',
        '#tarkov-bgm-btn .dot.on { background: #3ddc84; box-shadow: 0 0 6px rgba(61,220,132,0.9); }',
        '#tarkov-bgm-btn .name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        '#tarkov-bgm-panel { display: none; flex-direction: column; gap: 8px; min-width: 220px; padding: 10px 12px; font: 12px system-ui, "Microsoft YaHei", sans-serif; color: #e8d9c8; background: rgba(26, 18, 10, 0.96); border: 1px solid rgba(224, 121, 48, 0.45); border-radius: 10px; box-shadow: 0 6px 22px rgba(0,0,0,0.45); }',
        '#tarkov-bgm.open #tarkov-bgm-panel, #tarkov-bgm:hover #tarkov-bgm-panel { display: flex; }',
        '#tarkov-bgm-panel select { font-size: 12px; max-width: 100%; background: rgba(0,0,0,0.35); color: inherit; border: 1px solid rgba(224,121,48,0.4); border-radius: 6px; padding: 2px 4px; }',
        '#tarkov-bgm-panel .row { display: flex; align-items: center; gap: 8px; }',
        '#tarkov-bgm-panel button { cursor: pointer; font-size: 12px; padding: 2px 10px; color: inherit; background: rgba(224,121,48,0.16); border: 1px solid rgba(224,121,48,0.5); border-radius: 6px; }',
        '#tarkov-bgm-panel input[type=range] { width: 110px; }',
        '#tarkov-bgm-panel .status { font-size: 11px; opacity: 0.75; }',
        '#tarkov-bgm-panel .status.warn { color: #ffb27a; opacity: 1; }',
        '@media (max-width: 768px) { #tarkov-bgm { bottom: 8px; right: 8px; } }',
      ].join('\n');
      (document.head || document.documentElement).appendChild(BGM_CSS);
    }
    function ensureBgmUi() {
      if (bgmUi.root !== null && document.body.contains(bgmUi.root)) return;
      ensureBgmCss();
      var root = document.createElement('div');
      root.id = 'tarkov-bgm';
      var btn = document.createElement('button');
      btn.id = 'tarkov-bgm-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', '塔科夫背景音乐');
      var dot = document.createElement('span');
      dot.className = 'dot';
      var label = document.createElement('span');
      label.textContent = '音乐';
      var name = document.createElement('span');
      name.className = 'name';
      btn.append(dot, label, name);
      var panel = document.createElement('div');
      panel.id = 'tarkov-bgm-panel';
      var picker = document.createElement('select');
      picker.setAttribute('aria-label', '选择曲目');
      var row1 = document.createElement('div');
      row1.className = 'row';
      var playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.textContent = '播放/暂停';
      var nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.textContent = '随机下一首';
      row1.append(playBtn, nextBtn);
      var row2 = document.createElement('div');
      row2.className = 'row';
      var volLabel = document.createElement('span');
      volLabel.textContent = '音量';
      var vol = document.createElement('input');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '100';
      vol.step = '1';
      row2.append(volLabel, vol);
      var status = document.createElement('div');
      status.className = 'status';
      panel.append(picker, row1, row2, status);
      root.append(btn, panel);

      btn.addEventListener('click', function () { root.classList.toggle('open'); });
      picker.addEventListener('change', function () {
        if (!picker.value) return;
        if (!isBgmLeader()) { broadcast({ type: 'cmd', cmd: 'track', value: picker.value }); return; }
        playTrack(picker.value);
      });
      playBtn.addEventListener('click', function () {
        if (!isBgmLeader()) { broadcast({ type: 'cmd', cmd: 'toggle' }); return; }
        togglePlay();
      });
      nextBtn.addEventListener('click', function () {
        if (!isBgmLeader()) { broadcast({ type: 'cmd', cmd: 'next' }); return; }
        playNext();
      });
      vol.addEventListener('input', function () {
        cfg.music.volume = Number(vol.value) || 0;
        setBgmVolume(cfg.music.volume);
        if (!isBgmLeader()) { broadcast({ type: 'cmd', cmd: 'volume', value: cfg.music.volume }); return; }
        patchPrefsDebounced({ music: { volume: cfg.music.volume } });
        paintBgm();
      });

      (document.body || document.documentElement).appendChild(root);
      bgmUi = { root, nameEl: name, dotEl: dot, playBtn, status, volSlider: vol, select: picker };
      paintBgm();
    }
    function destroyBgmUi() {
      if (bgmUi.root !== null) {
        try { bgmUi.root.remove(); } catch (e) { /* ignore */ }
      }
      bgmUi = { root: null, nameEl: null, dotEl: null, playBtn: null, status: null, volSlider: null, select: null };
    }
    function paintBgm() {
      if (bgmUi.root === null) return;
      var isLeader = isBgmLeader();
      var trackNameStr = trackName(cfg.music.trackId) || '未选曲';
      if (bgmUi.nameEl) bgmUi.nameEl.textContent = trackNameStr;
      if (bgmUi.dotEl) bgmUi.dotEl.className = 'dot' + (bgm.playing ? ' on' : '');
      if (bgmUi.select) {
        var sel = bgmUi.select;
        if (sel.options.length !== bgmTracks.length) {
          sel.textContent = '';
          for (var i = 0; i < bgmTracks.length; i++) {
            var opt = document.createElement('option');
            opt.value = bgmTracks[i].id;
            opt.textContent = bgmTracks[i].name;
            sel.appendChild(opt);
          }
        }
        if (cfg.music.trackId) sel.value = cfg.music.trackId;
      }
      if (bgmUi.volSlider) bgmUi.volSlider.value = String(cfg.music.volume);
      if (bgmUi.playBtn) bgmUi.playBtn.textContent = bgm.playing ? '暂停' : '播放';
      if (bgmUi.status) {
        var msg;
        if (!isLeader) msg = '音乐正在另一个标签页播放';
        else if (bgm.autoplayBlocked) msg = '点击「播放」开始（浏览器自动播放限制）';
        else if (bgmTracks.length === 0) msg = '曲目库为空：请将音频放入 ' + (MUSIC_DIR_HINT || '~/.dsh/dsh-tarkov/music/') + '，或在插件设置中添加（mp3/wav/ogg/m4a/aac/flac）';
        else if (bgm.loadError) msg = bgm.loadError;
        else msg = bgm.playing ? '正在播放' : '已暂停';
        bgmUi.status.textContent = msg;
        bgmUi.status.className = 'status' + ((bgm.autoplayBlocked || bgmTracks.length === 0) ? ' warn' : '');
      }
    }
    function syncBgmFromPrefs() {
      applyDisabledFilter();
      // A track muted in the settings card stops here instead of skipping to
      // the next one; the leader clears its playback so all tabs agree.
      if (cfg.music.trackId && isTrackDisabled(cfg.music.trackId)) {
        if (bgm.el && !bgm.el.paused) { try { bgm.el.pause(); } catch (e) { /* ignore */ } }
        bgm.playing = false;
        bgm.wantPlay = false;
        if (isBgmLeader()) broadcastState();
      }
      if (!cfg.music.enabled) {
        if (bgmUi.root !== null) destroyBgmUi();
        if (bgm.el && !bgm.el.paused) { try { bgm.el.pause(); } catch (e) { /* ignore */ } }
        bgm.playing = false;
        return;
      }
      ensureBgmUi();
      setBgmVolume(cfg.music.volume);
      paintBgm();
    }
    function unlockBgmOnGesture() {
      if (bgm.autoplayBlocked && isBgmLeader() && bgm.wantPlay && bgm.el) {
        var p = bgm.el.play();
        if (p && typeof p.then === 'function') {
          p.then(function () {
            bgm.playing = true;
            bgm.autoplayBlocked = false;
            broadcastState();
            paintBgm();
          }).catch(function () { /* still blocked */ });
        }
      }
    }
    function startBgm() {
      instId = String(Math.random()).slice(2) + String(Date.now());
      bgmBC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('dsh-tarkov-bgm') : null;
      if (bgmBC) { bgmBC.onmessage = onBgmMessage; }
      loadTracks().then(function () { leaderTick(); });
      var leaderTimer = window.setInterval(leaderTick, 3000);
      var onUnload = function () {
        if (isBgmLeader()) { lsDel(LEAD_KEY); heartbeat(); }
        broadcast({ type: 'bye', id: instId });
      };
      window.addEventListener('pagehide', onUnload);
      return function () {
        clearInterval(leaderTimer);
        window.removeEventListener('pagehide', onUnload);
        if (bgmBC) { try { bgmBC.close(); } catch (e) { /* ignore */ } bgmBC = null; }
        destroyBgmUi();
        if (bgm.el) {
          try { bgm.el.pause(); } catch (e) { /* ignore */ }
          try { bgm.el.removeAttribute('src'); } catch (e) { /* ignore */ }
        }
        if (isBgmLeader()) { lsDel(LEAD_KEY); lsDel(HB_KEY); }
      };
    }

    // ---- Beta warning banner ----------------------------------------------
    // Replica of the reference art's core elements only: translucent orange
    // band + dark hexagonal "!" badge + two black lines. No background image.
    // Inserted before the hero options row (between title and workspace row).
    // Every step is defensive: the client apply() may run before the full DOM
    // exists, and a throw here would strand the whole "loading plugins" phase.
    var BANNER_CSS = null;
    var bannerRefs = null;
    function ensureBannerCss() {
      if (BANNER_CSS !== null) return;
      try {
        BANNER_CSS = document.createElement('style');
        BANNER_CSS.textContent = [
          '#tarkov-beta-banner{display:flex;align-items:center;gap:16px;width:min(94%,720px);margin:18px auto 10px;padding:15px 22px 15px 16px;background:rgba(224,121,48,var(--tarkov-banner-opacity,0.55));border-radius:6px;box-sizing:border-box;text-align:left}',
          '#tarkov-beta-banner .tarkov-banner-icon{width:42px;height:36px;background:#1c1207;color:#e07930;display:flex;align-items:center;justify-content:center;flex:none;font:800 24px/1 system-ui,"Microsoft YaHei",sans-serif;clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)}',
          '#tarkov-beta-banner .tarkov-banner-text{display:flex;flex-direction:column;gap:5px;min-width:0}',
          // Letter-spacing stretches the shorter first line so its right edge
          // lands near the second line's, avoiding a large blank area.
          '#tarkov-beta-banner .tarkov-banner-line1{color:#111111;font-weight:700;font-size:18px;line-height:1.5;letter-spacing:1.5px}',
          '#tarkov-beta-banner .tarkov-banner-line2{color:#111111;font-size:15px;line-height:1.5;letter-spacing:1.5px}',
        ].join('\n');
        (document.head || document.documentElement).appendChild(BANNER_CSS);
      } catch (e) {
        BANNER_CSS = null;
      }
    }
    function startBanner() {
      try {
        var doc = (typeof document !== 'undefined') ? document : null;
        if (doc === null) return { refresh: function () {}, dispose: function () {} };
        ensureBannerCss();
        var node = null;
        var line1El = null;
        var line2El = null;
        var currentAnchor = null;
        var lastOpacity = null;
        function detach() {
          if (node !== null) { try { node.remove(); } catch (e) { /* ignore */ } }
          node = null;
          line1El = null;
          line2El = null;
          currentAnchor = null;
          lastOpacity = null;
        }
        function refresh() {
          if (node === null) return;
          try {
            var opacity = String(cfg.banner.opacity);
            if (opacity !== lastOpacity) {
              node.style.setProperty('--tarkov-banner-opacity', opacity);
              lastOpacity = opacity;
            }
            // Write text only when it actually changes. Assigning textContent
            // unconditionally still emits childList mutation records for a
            // stable string (the text node is removed and re-inserted), which
            // re-triggers the MutationObserver → tick loop and wedges the boot
            // ("Loading plugins…" hang). Guarded writes break that feedback cycle.
            if (line1El && line1El.textContent !== cfg.banner.text1) line1El.textContent = cfg.banner.text1;
            if (line2El && line2El.textContent !== cfg.banner.text2) line2El.textContent = cfg.banner.text2;
          } catch (e) { /* ignore */ }
        }
        function tick() {
          try {
            if (!cfg.banner.enabled) { detach(); return; }
            if (doc.documentElement === null || doc.documentElement === undefined) return;
            var anchor = doc.querySelector('[class*="_heroWorkspaceRow"]');
            if (anchor === null || anchor.parentNode === null) { detach(); return; }
            if (currentAnchor === anchor && node !== null) { refresh(); return; }
            detach();
            var icon = doc.createElement('span');
            icon.className = 'tarkov-banner-icon';
            icon.textContent = '!';
            var text = doc.createElement('span');
            text.className = 'tarkov-banner-text';
            line1El = doc.createElement('span');
            line1El.className = 'tarkov-banner-line1';
            line2El = doc.createElement('span');
            line2El.className = 'tarkov-banner-line2';
            text.appendChild(line1El);
            text.appendChild(line2El);
            node = doc.createElement('div');
            node.id = 'tarkov-beta-banner';
            node.setAttribute('role', 'status');
            node.appendChild(icon);
            node.appendChild(text);
            anchor.parentNode.insertBefore(node, anchor);
            currentAnchor = anchor;
            refresh();
          } catch (e) {
            detach();
          }
        }
        var observer = null;
        var pollTimer = null;
        if (typeof MutationObserver === 'function') {
          try {
            observer = new MutationObserver(function () { tick(); });
            observer.observe(doc.documentElement, { childList: true, subtree: true });
          } catch (e) {
            observer = null;
          }
        }
        if (observer === null) {
          // Fallback: a short-lived poll in case the observer never attaches.
          var attempts = 0;
          pollTimer = window.setInterval(function () {
            tick();
            attempts += 1;
            if (attempts > 30 && window.clearInterval) { window.clearInterval(pollTimer); pollTimer = null; }
          }, 1000);
        }
        tick();
        return {
          refresh: refresh,
          dispose: function () {
            if (observer !== null) { try { observer.disconnect(); } catch (e) { /* ignore */ } }
            if (pollTimer !== null && window.clearInterval) { try { window.clearInterval(pollTimer); } catch (e) { /* ignore */ } pollTimer = null; }
            detach();
          },
        };
      } catch (e) {
        // Never let the banner break plugin activation.
        return { refresh: function () {}, dispose: function () {} };
      }
    }
    function syncBannerFromPrefs() {
      if (bannerRefs !== null && bannerRefs.refresh) bannerRefs.refresh();
    }

    function armGestureUnlock() {
      if (typeof window === 'undefined') return;
      var unlock = function () {
        resumeIfNeeded(ensureCtx());
        unlockBgmOnGesture();
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }

    // ---- Settings → Plugins card ------------------------------------------
    var KINDS = [
      ['done', '完成'],
      ['approval', '确认'],
      ['error', '失败'],
    ];
    // ---- desktop pet --------------------------------------------------------
    // An Altyn-helmet companion fixed to the page corner. Drag to move
    // (position remembered per device in localStorage); left-click plays a
    // random clip from the pet voice library (bundled placeholders +
    // ~/.dsh/dsh-tarkov/voice/). The right-click menu is currently disabled.
    // Size/volume lives in prefs.
    var PET_ASPECT_DEFAULT = 379 / 566; // altyn.png; corrected on load
    var PET_POS_KEY = 'dsh.tarkov.pet.pos';
    var petUi = { root: null, img: null, menu: null };
    var petDrag = null;        // { dx, dy, moved, sx, sy }
    var petPos = null;         // { x, y } in CSS px
    var petDownAt = 0;
    var petAspect = PET_ASPECT_DEFAULT;
    var petVoiceList = null;
    var petVoiceLoadedAt = 0;
    var petLastVoice = '';
    var petWatcher = null;
    var PET_CSS = null;

    function petSizePx() { return Math.round(cfg.pet.size); }
    function petWidthPx() { return Math.round(cfg.pet.size * petAspect); }
    function petClamp(px, py) {
      var w = petWidthPx(), h = petSizePx();
      var mx = 8, my = 8;
      return {
        x: Math.max(mx, Math.min(px, window.innerWidth - w - mx)),
        y: Math.max(my, Math.min(py, window.innerHeight - h - my)),
      };
    }
    function petDefaultPos() {
      return petClamp(window.innerWidth - petWidthPx() - 24, window.innerHeight - petSizePx() - 44);
    }
    function petLoadPos() {
      try {
        var raw = localStorage.getItem(PET_POS_KEY);
        if (raw) {
          var v = JSON.parse(raw);
          if (v && typeof v.x === 'number' && typeof v.y === 'number') return v;
        }
      } catch (e) { /* corrupted */ }
      return null;
    }
    function petSavePos() {
      if (petPos === null) return;
      try { localStorage.setItem(PET_POS_KEY, JSON.stringify(petPos)); } catch (e) { /* full */ }
    }
    function petApplyPos() {
      if (petUi.root === null || petPos === null) return;
      petUi.root.style.transform = 'translate(' + Math.round(petPos.x) + 'px,' + Math.round(petPos.y) + 'px)';
    }
    function petBounce() {
      if (!petUi.img) return;
      var img = petUi.img;
      img.classList.remove('tk-pet-poke');
      void img.offsetWidth; /* restart animation */
      img.classList.add('tk-pet-poke');
      window.setTimeout(function () { img.classList.remove('tk-pet-poke'); }, 520);
    }
    function petVoiceUrl(item) {
      return '/dsh-tarkov/pet/audio?id=' + encodeURIComponent(item.id) + '&kind=' + (item.builtin ? 'builtin' : 'user');
    }
    function petFetchVoiceList() {
      var now = Date.now();
      if (petVoiceList !== null && now - petVoiceLoadedAt < 300000) return Promise.resolve(petVoiceList);
      return fetch('/dsh-tarkov/pet/voice', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (res) {
          petVoiceList = (res && Array.isArray(res.items)) ? res.items : [];
          petVoiceLoadedAt = Date.now();
          return petVoiceList;
        })
        .catch(function () { return petVoiceList || []; });
    }
    function petPlayVoice() {
      if (!cfg.pet.enabled) return;
      var vol = Math.max(0, Math.min(1, (cfg.pet.volume || 0) / 100));
      if (vol <= 0.001) return;
      return petFetchVoiceList().then(function (list) {
        if (!list || list.length === 0) return;
        var pool = (list.length > 1 && petLastVoice) ? list.filter(function (i) { return i.id !== petLastVoice; }) : list;
        var item = pool[Math.floor(Math.random() * pool.length)];
        petLastVoice = item.id;
        var key = 'pet:' + (item.builtin ? 'b' : 'u') + ':' + item.id;
        if (bufferCache.has(key)) { playBuffer(bufferCache.get(key), vol); return; }
        fetch(petVoiceUrl(item)).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
          .then(function (ab) {
            if (!ab) return null;
            return decodeBuffer(ab).then(function (buf) {
              if (buf) {
                if (bufferCache.size > 12) bufferCache.delete(bufferCache.keys().next().value);
                bufferCache.set(key, buf);
                playBuffer(buf, vol);
              }
            });
          })
          .catch(function () { /* host not up yet */ });
      }).catch(function () { /* voice list unavailable */ });
    }
    function petPoke() {
      petPlayVoice();
      petBounce();
    }
    function setPetSize(px) {
      cfg.pet.size = px;
      patchPrefsDebounced({ pet: { size: px } });
      applyPetSize();
    }
    function applyPetSize() {
      if (petUi.root === null) return;
      var h = petSizePx(), w = petWidthPx();
      if (petUi.img) {
        petUi.img.style.width = w + 'px';
        petUi.img.style.height = h + 'px';
      }
      if (petPos !== null) { petPos = petClamp(petPos.x, petPos.y); petApplyPos(); }
    }
    function petResetPos() {
      petPos = petDefaultPos();
      petApplyPos();
      try { localStorage.removeItem(PET_POS_KEY); } catch (e) { /* blocked */ }
    }
    function ensurePetCss() {
      if (PET_CSS !== null) return;
      try {
        PET_CSS = document.createElement('style');
        PET_CSS.textContent = [
          '#tarkov-pet-root{position:fixed;left:0;top:0;z-index:9995;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;line-height:0}',
          '#tarkov-pet-root.dragging{cursor:grabbing}',
          '#tarkov-pet-root img{display:block;pointer-events:none;animation:tk-pet-bob 2.8s ease-in-out infinite;filter:drop-shadow(0 6px 12px rgba(0,0,0,.38))}',
          '#tarkov-pet-root img.tk-pet-poke{animation:tk-pet-poke .45s ease}',
          '@keyframes tk-pet-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
          '@keyframes tk-pet-poke{0%{transform:translateY(0) scale(1)}30%{transform:translateY(-8px) scale(1.04,.96)}60%{transform:translateY(0) scale(.97,1.03)}100%{transform:translateY(0) scale(1)}}',
          '.tk-pet-menu{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(20,24,22,.97);border:1px solid rgba(224,121,48,.4);border-radius:10px;padding:6px;min-width:170px;z-index:6;box-shadow:0 6px 20px rgba(0,0,0,.5)}',
          '.tk-pet-menu-title{font-size:11px;color:#8b877c;padding:2px 10px 4px}',
          '.tk-pet-menu-row{display:block;width:100%;text-align:left;background:none;border:none;padding:6px 10px;border-radius:6px;font-size:12px;font-family:inherit;color:#d9d5cb;cursor:pointer;white-space:nowrap}',
          '.tk-pet-menu-row:hover{background:rgba(224,121,48,.18);color:#fff}',
          '.tk-pet-menu-sep{height:1px;background:rgba(255,255,255,.08);margin:4px 2px}',
        ].join('\n');
        (document.head || document.documentElement).appendChild(PET_CSS);
      } catch (e) {
        PET_CSS = null;
      }
    }
    // ★ 右键菜单已停用（2026-09-06）：触发链路整体注释，恢复时取消相应 /* ... */ 与监听行即可。
    /*
    function buildPetMenu() {
      if (petUi.menu) return petUi.menu;
      var menu = document.createElement('div');
      menu.className = 'tk-pet-menu';
      var title = document.createElement('div');
      title.className = 'tk-pet-menu-title';
      title.textContent = 'Altyn · 桌宠';
      menu.appendChild(title);
      function addRow(label, fn) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'tk-pet-menu-row';
        row.textContent = label;
        row.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
        menu.appendChild(row);
        return row;
      }
      addRow('🎙 随机说一句', function () { petPoke(); });
      addRow('大小：小（120px）', function () { setPetSize(120); });
      addRow('大小：中（160px）', function () { setPetSize(160); });
      addRow('大小：大（220px）', function () { setPetSize(220); });
      var sep = document.createElement('div');
      sep.className = 'tk-pet-menu-sep';
      menu.appendChild(sep);
      addRow('↺ 重置位置', function () { petResetPos(); });
      menu.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      petUi.menu = menu;
      return menu;
    }
    function petShowMenu() {
      var menu = buildPetMenu();
      if (!petUi.root) return;
      if (petUi.menu.parentNode !== petUi.root) petUi.root.appendChild(petUi.menu);
      menu.style.display = 'block';
    }
    function petHideMenu() {
      if (petUi.menu) petUi.menu.style.display = 'none';
    }
    */
    function onPetPointerDown(e) {
      if (e.button !== 0) return;
      // 右键菜单停用：菜单点击拦截与隐藏调用一并注释
      // if (petUi.menu && petUi.menu.style.display !== 'none' && (petUi.menu === e.target || petUi.menu.contains(e.target))) return;
      // petHideMenu();
      var host = e.currentTarget;
      var rect = host.getBoundingClientRect();
      petDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false, sx: e.clientX, sy: e.clientY };
      petDownAt = performance.now();
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
    }
    function onPetPointerMove(e) {
      if (!petDrag) return;
      if ((e.buttons & 1) === 0) { petDrag = null; if (petUi.root) petUi.root.classList.remove('dragging'); return; }
      if (Math.abs(e.clientX - petDrag.sx) + Math.abs(e.clientY - petDrag.sy) > 6) petDrag.moved = true;
      if (!petDrag.moved) return;
      if (petUi.root) petUi.root.classList.add('dragging');
      petPos = petClamp(e.clientX - petDrag.dx, e.clientY - petDrag.dy);
      petApplyPos();
    }
    function onPetPointerUp(e) {
      var wasDrag = petDrag !== null && petDrag.moved;
      var quick = petDrag !== null && (performance.now() - petDownAt) < 350;
      petDrag = null;
      if (petUi.root) petUi.root.classList.remove('dragging');
      if (wasDrag) {
        petSavePos();
      } else if (quick) {
        petPoke();
      }
      if (e.pointerId !== undefined) {
        try { if (e.currentTarget && e.currentTarget.hasPointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      }
    }
    function onPetPointerCancel() { petDrag = null; if (petUi.root) petUi.root.classList.remove('dragging'); }
    // ★ 右键菜单停用：onPetContextMenu 不再触发（恢复时取消注释并恢复监听行）
    // function onPetContextMenu(e) {
    //   e.preventDefault();
    //   petShowMenu();
    // }
    function onPetImageLoad(img) {
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        petAspect = img.naturalWidth / img.naturalHeight;
      }
      applyPetSize();
    }
    function ensurePetUi() {
      if (petUi.root !== null) return;
      if (typeof document === 'undefined') return;
      ensurePetCss();
      var root = document.createElement('div');
      root.id = 'tarkov-pet-root';
      var img = document.createElement('img');
      img.alt = '塔科夫桌宠';
      img.draggable = false;
      img.addEventListener('load', function () { onPetImageLoad(img); });
      img.src = '/dsh-tarkov/pet/image?v=' + Date.now();
      root.appendChild(img);
      root.addEventListener('pointerdown', onPetPointerDown);
      root.addEventListener('pointermove', onPetPointerMove);
      root.addEventListener('pointerup', onPetPointerUp);
      root.addEventListener('pointercancel', onPetPointerCancel);
      root.addEventListener('lostpointercapture', onPetPointerCancel);
      // root.addEventListener('contextmenu', onPetContextMenu); // ★ 右键菜单停用
      (document.body || document.documentElement).appendChild(root);
      petUi = { root: root, img: img, menu: null };
      var saved = petLoadPos();
      petPos = saved ? petClamp(saved.x, saved.y) : petDefaultPos();
      petApplyPos();
      applyPetSize();
      // dsh's first paint can replace direct body children: re-append on drop.
      if (typeof MutationObserver !== 'undefined' && petWatcher === null) {
        petWatcher = new MutationObserver(function () {
          if (petUi.root && petUi.root.isConnected === false && cfg.pet.enabled) {
            try { (document.body || document.documentElement).appendChild(petUi.root); petApplyPos(); } catch (e) { /* ignore */ }
          }
        });
        petWatcher.observe(document.body || document.documentElement, { childList: true });
      }
    }
    function destroyPetUi() {
      if (petWatcher !== null) {
        try { petWatcher.disconnect(); } catch (e) { /* ignore */ }
        petWatcher = null;
      }
      if (petUi.root !== null) {
        try { petUi.root.remove(); } catch (e) { /* ignore */ }
      }
      petUi = { root: null, img: null, menu: null };
      petPos = null;
    }
    function syncPetFromPrefs() {
      if (!cfg.pet.enabled) { destroyPetUi(); return; }
      ensurePetUi();
      applyPetSize();
    }
    function startPet() {
      syncPetFromPrefs();
      var onResize = function () {
        if (petPos !== null) { petPos = petClamp(petPos.x, petPos.y); petApplyPos(); }
      };
      var onBlur = function () { /* ★ 右键菜单停用：原 petHideMenu(); */ };
      window.addEventListener('resize', onResize);
      window.addEventListener('blur', onBlur);
      return function () {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('blur', onBlur);
        destroyPetUi();
      };
    }

    var KLS_NAMES = { done: '完成音效', approval: '确认音效', error: '中断失败音效' };
    var panelFileInput = null;
    var panelPendingKind = null;

    function onFilePicked(kind, file) {
      if (!file || typeof FileReader === 'undefined') return;
      if (file.size > MAX_CUSTOM_BYTES) { console.warn('dsh-theme-tarkov: audio too large'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        cfg.sfx.sounds[kind] = { dataUrl: String(reader.result), name: file.name };
        var o = {};
        o[kind] = cfg.sfx.sounds[kind];
        patchPrefs({ sfx: { sounds: o } });
        playType(kind);
      };
      reader.onerror = function () { console.error('dsh-theme-tarkov: file read failed'); };
      reader.readAsDataURL(file);
    }
    function resetSound(kind) {
      cfg.sfx.sounds[kind] = null;
      bufferCache.delete('custom:' + kind);
      var o = {};
      o[kind] = null;
      patchPrefs({ sfx: { sounds: o } });
    }

    // ---- music library management (settings card) --------------------------
    var musicFileInput = null;
    var musicStatus = null;
    var musicStatusTimer = null;
    function setMusicStatus(text, isError) {
      musicStatus = text ? { text: text, error: !!isError } : null;
      if (musicStatusTimer !== null) { clearTimeout(musicStatusTimer); musicStatusTimer = null; }
      if (text && !isError) {
        musicStatusTimer = setTimeout(function () {
          musicStatus = null;
          for (var f of Array.from(rerender)) { try { f(); } catch (e) { /* component gone */ } }
        }, 4000);
      }
      for (var f of Array.from(rerender)) { try { f(); } catch (e) { /* component gone */ } }
    }
    // Upload raw audio bytes to the host music dir (no multipart: the file body
    // is streamed straight to disk by the /dsh-tarkov/music/add route).
    function uploadMusic(file) {
      if (!file) return Promise.resolve();
      if (file.size > 200 * 1024 * 1024) { setMusicStatus('文件过大（最大 200MB）', true); return Promise.resolve(); }
      setMusicStatus('正在上传 ' + file.name + '…', false);
      return fetch('/dsh-tarkov/music/add?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok) { setMusicStatus('已添加 ' + file.name, false); return loadTracks(); }
          setMusicStatus('添加失败：' + ((res && res.error) || '未知错误'), true);
        })
        .catch(function () { setMusicStatus('添加失败：插件路由不可用（改动需重启 dsh web 后生效）', true); });
    }
    function deleteMusic(id) {
      setMusicStatus('正在删除 ' + id + '…', false);
      return fetch('/dsh-tarkov/music/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok) { setMusicStatus('已删除 ' + id, false); return loadTracks(); }
          setMusicStatus('删除失败：' + ((res && res.error) || '未知错误'), true);
        })
        .catch(function () { setMusicStatus('删除失败：插件路由不可用（改动需重启 dsh web 后生效）', true); });
    }
    function setMusicDisabled(id, enabled) {
      var cur = Array.isArray(cfg.music.disabled) ? cfg.music.disabled.slice() : [];
      var idx = cur.indexOf(id);
      if (enabled && idx >= 0) cur.splice(idx, 1);
      else if (!enabled && idx < 0) cur.push(id);
      cfg.music.disabled = cur;
      patchPrefs({ music: { disabled: cur } });
      // Re-render immediately so controlled checkboxes reflect the new state
      // right away (never waiting on the host echo round-trip).
      notify();
    }
    // Deleted builtin tracks are recorded in prefs; this clears the record so
    // the bundled tracks rejoin the library without touching the package.
    function restoreRemovedTracks() {
      cfg.music.removed = [];
      patchPrefs({ music: { removed: [] } });
      loadTracks();
    }

    // Card shell mirrors the shipped PluginCard (structure + theme tokens from
    // ui-settings-plugins PluginCard.module.css); the body follows the native
    // field pattern (.field / .field-head / .label / .hint) so this hybrid card
    // reads like a first-party settings card.
    var TARKOV_SETTINGS_CSS = null;
    function ensureSettingsCss() {
      if (TARKOV_SETTINGS_CSS !== null) return;
      TARKOV_SETTINGS_CSS = document.createElement('style');
      TARKOV_SETTINGS_CSS.textContent = [
        '.tk-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s, background .16s}',
        '.tk-card:hover{border-color:var(--dsw-alias-label-dimmed)}',
        '.tk-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
        '.tk-card-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
        '.tk-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
        '.tk-card-head-text{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
        '.tk-card-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
        '.tk-card-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
        '.tk-card-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
        '.tk-card-chevron-open{transform:rotate(180deg)}',
        '.tk-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:8px 0}',
        '.tk-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}',
        '.tk-field+.tk-field{border-top:1px solid var(--dsw-alias-border-l2)}',
        '.tk-field-head{display:flex;align-items:center;gap:8px;min-width:0}',
        '.tk-field-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
        '.tk-field-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}',
        '.tk-field-hint.error{color:var(--dsw-alias-label-error)}',
        '.tk-value{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.tk-range{width:100%;margin:0}',
        '.tk-sub{display:flex;align-items:center;gap:8px;min-width:0}',
        '.tk-sub-name{min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;flex:none}',
        '.tk-sub-state{min-width:0;color:var(--dsw-alias-label-secondary);flex:1;font-size:12px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.tk-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:3px 10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);background:transparent}',
        '.tk-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
        '.tk-btn:active:not(:disabled){background:var(--dsw-alias-bg-module-platform)}',
        '.tk-btn:disabled{opacity:.55;cursor:default}',
        '.tk-btn-danger:hover:not(:disabled){color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-label-error)}',
        '.tk-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;flex:none}',
        '.tk-track{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 0}',
        '.tk-track+.tk-track{border-top:1px solid var(--dsw-alias-border-l2)}',
        '.tk-track-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}',
        '.tk-track-disabled .tk-track-name{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
        '.tk-track-toggle{display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;flex:none}',
        '.tk-track-empty{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5;padding:4px 0}',
      ].join('\n');
      document.head.appendChild(TARKOV_SETTINGS_CSS);
    }
    function TarkovCard(props) {
      var state = React.useState(false);
      var open = state[0], setOpen = state[1];
      ensureSettingsCss();
      return React.createElement('li', { className: 'tk-card' + (open ? ' tk-card-open' : '') },
        React.createElement('button', {
          type: 'button', className: 'tk-card-header',
          'aria-expanded': open,
          'aria-label': (open ? '收起' : '展开') + '：塔科夫主题',
          onClick: function () { setOpen(!open); },
        },
          React.createElement('span', { className: 'tk-card-head-text' },
            React.createElement('span', { className: 'tk-card-name' }, '塔科夫主题'),
            React.createElement('span', { className: 'tk-card-description' }, '提示音 / 背景音乐 / Beta 警告横幅 / 桌宠')),
          React.createElement('svg', {
            className: 'tk-card-chevron' + (open ? ' tk-card-chevron-open' : ''),
            width: '14', height: '14', viewBox: '0 0 24 24', 'aria-hidden': 'true',
          },
            React.createElement('path', { d: 'M6 9l6 6 6-6', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        open ? React.createElement('div', { className: 'tk-card-body' }, React.createElement(props.panel, null)) : null);
    }

    // Native-style field: label + value on the head row, full-width range below.
    // Local display state: the value prop follows the host echo, but every drag
    // updates the local state and debounced commit immediately, so consecutive
    // adjustments never bounce back (controlled-input trap).
    function SliderRow(props) {
      var state = React.useState(String(props.value()));
      var local = state[0], setLocal = state[1];
      React.useEffect(function () { setLocal(String(props.value())); });
      return React.createElement('div', { className: 'tk-field' },
        React.createElement('div', { className: 'tk-field-head' },
          React.createElement('span', { className: 'tk-field-label' }, props.label),
          React.createElement('span', { className: 'tk-value' },
            props.pct === true ? String(Math.round(Number(local) * 100)) + '%' : local + '%')),
        React.createElement('input', {
          type: 'range',
          className: 'tk-range',
          min: String(props.min), max: String(props.max), step: props.step || '1',
          value: local,
          onChange: function (e) { setLocal(e.target.value); props.onCommit(Number(e.target.value)); },
        }));
    }

    // On/off field matching the native pattern: label left, checkbox right,
    // helper text below. Fully controlled: the visual state is bound straight
    // to cfg. The click updates cfg synchronously and notify() bumps the panel
    // (function updater, never bailout), so the flip is instant and no
    // local-state + effect round-trip can bounce it back.
    // Size-style slider: same as SliderRow but shows a px suffix instead of %.
    function SliderRowNum(props) {
      var state = React.useState(String(props.value()));
      var local = state[0], setLocal = state[1];
      React.useEffect(function () { setLocal(String(props.value())); });
      return React.createElement('div', { className: 'tk-field' },
        React.createElement('div', { className: 'tk-field-head' },
          React.createElement('span', { className: 'tk-field-label' }, props.label),
          React.createElement('span', { className: 'tk-value' }, local + (props.unit || 'px'))),
        React.createElement('input', {
          type: 'range', className: 'tk-range',
          min: String(props.min), max: String(props.max), step: props.step || '1',
          value: local,
          onChange: function (e) { setLocal(e.target.value); props.onCommit(Number(e.target.value)); },
        }));
    }

    function SwitchField(props) {
      return React.createElement('div', { className: 'tk-field' },
        React.createElement('div', { className: 'tk-field-head' },
          React.createElement('span', { className: 'tk-field-label' }, props.label),
          React.createElement('input', {
            type: 'checkbox',
            checked: props.checked,
            onChange: function (e) { props.onToggle(e.target.checked); },
            'aria-label': props.label,
          })),
        props.hint ? React.createElement('p', { className: 'tk-field-hint' }, props.hint) : null);
    }

    // Per-track 启用 toggle with the same controlled pattern.
    function TrackToggle(props) {
      return React.createElement('label', { className: 'tk-track-toggle', title: props.enabled ? '点击禁用' : '点击启用' },
        React.createElement('input', {
          type: 'checkbox',
          checked: props.enabled,
          'aria-label': '启用 ' + props.name,
          onChange: function (e) { props.onToggle(e.target.checked); },
        }),
        React.createElement('span', null, '启用'));
    }

    function buildPanel() {
      return function () {
        var force = React.useState(0)[1];
        // Bump with a function updater: plain setState(undefined) would
        // bail out after the first notify (undefined === undefined) and the
        // panel would stop re-rendering, leaving controlled checkboxes frozen.
        React.useEffect(function () {
          var bump = function () { force(function (n) { return (typeof n === 'number' ? n : 0) + 1; }); };
          rerender.add(bump);
          return function () { rerender.delete(bump); };
        }, []);
        // Refresh the library whenever the card opens, so files dropped into
        // the user music dir (or builtin changes) show up without reloading
        // the whole page.
        React.useEffect(function () { loadTracks(); }, []);

        var setField = function (group, field, value) {
          // Update cfg synchronously + re-render immediately: controlled
          // checkboxes must reflect the click right away, otherwise the next
          // click is inert.
          if (cfg[group]) cfg[group][field] = value;
          var p = {};
          p[group] = {};
          p[group][field] = value;
          patchPrefs(p);
          notify();
        };

        // Sound rows: name + current clip state + 试听/替换/恢复内置.
        var sfxRows = [];
        for (var i = 0; i < KINDS.length; i++) {
          var kind = KINDS[i][0];
          var kindName = KINDS[i][1];
          var custom = cfg.sfx.sounds[kind];
          var currentName = custom && custom.dataUrl ? '自定义 · ' + (custom.name || '声音') : '内置 · ' + KLS_NAMES[kind];
          sfxRows.push(
            React.createElement('div', { key: kind, className: 'tk-sub' },
              React.createElement('span', { className: 'tk-sub-name' }, kindName),
              React.createElement('span', { className: 'tk-sub-state' }, currentName),
              React.createElement('button', { className: 'tk-btn', onClick: function (k) { return function () { playType(k); }; }(kind) }, '试听'),
              React.createElement('button', { className: 'tk-btn', onClick: function (k) { return function () { panelPendingKind = k; if (panelFileInput) panelFileInput.click(); }; }(kind) }, '替换'),
              custom && custom.dataUrl
                ? React.createElement('button', { className: 'tk-btn', onClick: function (k) { return function () { resetSound(k); }; }(kind) }, '恢复内置')
                : null,
            )
          );
        }

        var disabledList = Array.isArray(cfg.music.disabled) ? cfg.music.disabled : [];
        var removedList = Array.isArray(cfg.music.removed) ? cfg.music.removed : [];
        var trackRows = [];
        for (var j = 0; j < bgmAllTracks.length; j++) {
          var t = bgmAllTracks[j];
          var muted = disabledList.indexOf(t.id) !== -1;
          trackRows.push(
            React.createElement('div', { key: t.id, className: 'tk-track' + (muted ? ' tk-track-disabled' : '') },
              React.createElement('span', { className: 'tk-track-name' }, t.name),
              t.builtin ? React.createElement('span', { className: 'tk-badge' }, '内置') : null,
              React.createElement(TrackToggle, {
                id: t.id, name: t.name, enabled: !muted,
                onToggle: function (id) { return function (v) { setMusicDisabled(id, v); }; }(t.id),
              }),
              React.createElement('button', {
                className: 'tk-btn tk-btn-danger',
                title: t.builtin ? '从曲库移除（内置曲目可在下方恢复）' : '删除文件',
                onClick: function (id) { return function () { deleteMusic(id); }; }(t.id),
              }, '删除'),
            )
          );
        }

        // Body content only: the collapsible card shell is TarkovCard; the
        // header carries the identity, so no title row here.
        return React.createElement('div', null,
          React.createElement(SwitchField, {
            label: 'Beta 警告横幅',
            checked: cfg.banner.enabled,
            hint: '为新对话界面显示塔科夫风格的 Beta 测试横幅',
            onToggle: function (v) { setField('banner', 'enabled', v); },
          }),
          React.createElement(SliderRow, {
            label: '横幅透明度', min: 0, max: 1, step: '0.05', pct: true,
            value: function () { return cfg.banner.opacity; },
            onCommit: function (v) { cfg.banner.opacity = v; patchPrefsDebounced({ banner: { opacity: v } }); },
          }),
          React.createElement(SwitchField, {
            label: '提示音',
            checked: cfg.sfx.enabled,
            hint: '会话完成、请求确认、中断失败时播放；后台标签页同样生效',
            onToggle: function (v) { setField('sfx', 'enabled', v); },
          }),
          React.createElement(SliderRow, {
            label: '提示音音量', min: 0, max: 100, step: '1',
            value: function () { return cfg.sfx.volume; },
            onCommit: function (v) { cfg.sfx.volume = v; patchPrefsDebounced({ sfx: { volume: v } }); },
          }),
          React.createElement('div', { className: 'tk-field' },
            React.createElement('div', { className: 'tk-field-head' },
              React.createElement('span', { className: 'tk-field-label' }, '提示声音效')),
            sfxRows),
          React.createElement(SwitchField, {
            label: '桌宠',
            checked: cfg.pet.enabled,
            hint: '页面角落的 Altyn 桌宠：拖动换位置（自动记住），点击播放随机语音',
            onToggle: function (v) { setField('pet', 'enabled', v); },
          }),
          React.createElement(SliderRowNum, {
            label: '桌宠大小', min: 80, max: 240, step: '4',
            value: function () { return cfg.pet.size; },
            onCommit: function (v) { cfg.pet.size = v; applyPetSize(); patchPrefsDebounced({ pet: { size: v } }); },
          }),
          React.createElement(SliderRow, {
            label: '桌宠音量', min: 0, max: 100, step: '1',
            value: function () { return cfg.pet.volume; },
            onCommit: function (v) { cfg.pet.volume = v; patchPrefsDebounced({ pet: { volume: v } }); },
          }),
          React.createElement('div', { className: 'tk-field' },
            React.createElement('div', { className: 'tk-field-head' },
              React.createElement('span', { className: 'tk-field-label' }, '语音库与皮肤'),
              React.createElement('button', { className: 'tk-btn', onClick: petResetPos }, '重置桌宠位置')),
            React.createElement('p', { className: 'tk-field-hint' }, '随机语音：把音频放进 ~/.dsh/dsh-tarkov/voice/ 即入池；替换皮肤：放 pet.png 到 ~/.dsh/dsh-tarkov/pet/ 覆盖默认小人。')),
          React.createElement(SwitchField, {
            label: '背景音乐',
            checked: cfg.music.enabled,
            hint: '右下角浮窗播放器；内置曲目随插件提供，也可添加自己的音乐',
            onToggle: function (v) { setField('music', 'enabled', v); },
          }),
          React.createElement(SliderRow, {
            label: '音乐音量', min: 0, max: 100, step: '1',
            value: function () { return cfg.music.volume; },
            onCommit: function (v) { cfg.music.volume = v; setBgmVolume(v); patchPrefsDebounced({ music: { volume: v } }); },
          }),
          React.createElement('div', { className: 'tk-field' },
            React.createElement('div', { className: 'tk-field-head' },
              React.createElement('span', { className: 'tk-field-label' }, '曲目管理'),
              React.createElement('button', { className: 'tk-btn', onClick: function () { if (musicFileInput) musicFileInput.click(); } }, '添加音乐')),
            React.createElement('p', { className: 'tk-field-hint' }, '支持 mp3 / wav / ogg / m4a / aac / flac；也可直接把文件放进 ~/.dsh/dsh-tarkov/music/'),
            removedList.length > 0
              ? React.createElement('button', { className: 'tk-btn', onClick: restoreRemovedTracks }, '恢复已删除的内置曲目（' + removedList.length + '）')
              : null,
            musicStatus ? React.createElement('p', { className: 'tk-field-hint' + (musicStatus.error ? ' error' : '') }, musicStatus.text) : null,
            trackRows.length > 0
              ? React.createElement('div', null, trackRows)
              : React.createElement('p', { className: 'tk-track-empty' }, '暂无曲目')),
          React.createElement('input', {
            ref: function (el) { panelFileInput = el; },
            type: 'file', accept: 'audio/*', style: { display: 'none' },
            onChange: function (e) {
              var f = e.target.files && e.target.files[0];
              if (f && panelPendingKind) onFilePicked(panelPendingKind, f);
              e.target.value = '';
            },
          }),
          React.createElement('input', {
            ref: function (el) { musicFileInput = el; },
            type: 'file', accept: 'audio/*', style: { display: 'none' },
            onChange: function (e) {
              var f = e.target.files && e.target.files[0];
              if (f) uploadMusic(f);
              e.target.value = '';
            },
          }),
        );
      };
    }
    // One stable panel component per plugin load. buildPanel() returns a fresh
    // function each call; passing a per-render function as the component type
    // would make React unmount/remount the whole panel on every parent render,
    // dropping focus and mid-click DOM state (checkboxes become unclickable).
    var TarkovPanel = buildPanel();

    // ---- status line copy (chat.deepDiving) ------------------------------
    // dsh's running-turn status line ("深度求索中...") is a locale dictionary
    // entry owned by the built-in @deepseek-ai/dsh-client-ui-chat package, and
    // the public locale API refuses to touch it: ctx.locale.register() throws
    // `locale namespace "chat" already has locale "zh"` for a second
    // registration of the same namespace+language. Both the chat package's own
    // seat and the slot-injected `t` funnel through the locale service's
    // translate(), so wrapping that one method is the only way to swap the copy
    // without switching the whole UI language. Every other key passes straight
    // through to the original method.
    var STATUS_NS = 'chat';
    var STATUS_KEY = 'chat.deepDiving';

    // Pool for the active UI language: a zh-* locale reads the zh pool, anything
    // else the en pool, each falling back to the other when it is empty.
    function statusPoolFor(texts, active) {
      if (!texts) return null;
      var zh = texts.zh && texts.zh.length ? texts.zh : null;
      var en = texts.en && texts.en.length ? texts.en : null;
      if (typeof active === 'string' && active.toLowerCase().indexOf('zh') === 0) return zh || en;
      return en || zh;
    }

    // Random pick that avoids repeating the current entry (the pet voice picker
    // uses the same rule). A single-entry pool has no alternative to return.
    function pickStatusText(pool, current) {
      if (!pool || pool.length === 0) return null;
      if (pool.length === 1) return pool[0];
      for (var i = 0; i < 8; i++) {
        var next = pool[Math.floor(Math.random() * pool.length)];
        if (next !== current) return next;
      }
      var idx = pool.indexOf(current);
      return pool[(idx + 1 + pool.length) % pool.length];
    }

    // Wrap the locale service's translate() so the status key returns a pool
    // entry. Two read-only signals arm a fresh pick (`reshuffle`): a new
    // [role="status"] node in the DOM (TurnStatus mounts at the start of a turn)
    // and the host's completed-step counter moving (one pick per finished piece
    // of work — thinking, a tool call, …). The copy stays on the i18n path, so
    // the 15s elapsed-time clock next to it is untouched.
    function installStatusText(locale) {
      if (!locale || typeof locale.translate !== 'function' || typeof locale.getLocale !== 'function') return null;
      var raw = locale.translate;
      var orig = raw.bind(locale);
      var pool = null;
      var current = null;
      var reshuffle = true;
      var wrapper = function (ns, key, params) {
        try {
          if (ns === STATUS_NS && key === STATUS_KEY && pool !== null) {
            var list = statusPoolFor(pool, locale.getLocale().active);
            if (list !== null) {
              if (current === null || reshuffle || list.indexOf(current) === -1) {
                current = pickStatusText(list, current);
                reshuffle = false;
              }
              if (current !== null) return current;
            }
          }
        } catch (e) { /* never break the status line */ }
        return orig(ns, key, params);
      };
      locale.translate = wrapper;
      fetch('/dsh-tarkov/status-texts')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.enabled && data.texts) { pool = data.texts; reshuffle = true; }
        })
        .catch(function () { /* host routes not up yet: keep the stock copy */ });
      // Turn boundary: TurnStatus mounts as a fresh [role="status"][aria-live]
      // node at the start of every turn (the selector excludes the banner,
      // which carries role="status" without aria-live).
      var statusEl = null;
      var streamObserver = null;
      var observer = null;
      // Step boundary that needs no host support: the status line shares its
      // parent with the message flow, so a sibling node arriving means another
      // step just rendered. Read-only, and it feeds the same `reshuffle` flag as
      // the host counter.
      function observeStream(el) {
        if (streamObserver !== null) { try { streamObserver.disconnect(); } catch (e) { /* ignore */ } streamObserver = null; }
        var parent = el && el.parentElement;
        if (!parent || typeof MutationObserver === 'undefined') return;
        streamObserver = new MutationObserver(function (records) {
          for (var i = 0; i < records.length; i++) {
            var added = records[i].addedNodes || [];
            for (var j = 0; j < added.length; j++) {
              if (added[j] && added[j] !== statusEl) { reshuffle = true; return; }
            }
          }
        });
        try { streamObserver.observe(parent, { childList: true }); } catch (e) { streamObserver = null; }
      }
      if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
        observer = new MutationObserver(function (records) {
          for (var i = 0; i < records.length; i++) {
            var added = records[i].addedNodes || [];
            for (var j = 0; j < added.length; j++) {
              var node = added[j];
              if (!node || node.nodeType !== 1) continue;
              var sel = '[role="status"][aria-live]';
              var hit = (node.matches && node.matches(sel)) ? node : (node.querySelector && node.querySelector(sel));
              if (hit) { statusEl = hit; reshuffle = true; observeStream(hit); return; }
            }
          }
        });
        try {
          observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        } catch (e) { observer = null; }
      }
      // Step pacing: the host counts completed steps (step/end) and the client
      // polls that counter, so the copy rotates once per finished piece of work
      // instead of once per turn. The first response only records a baseline.
      var lastSeq = null;
      var pollTimer = null;
      if (typeof window !== 'undefined' && window.setInterval) {
        pollTimer = window.setInterval(function () {
          fetch('/dsh-tarkov/status-poll')
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (!data || typeof data.seq !== 'number') return;
              if (lastSeq !== null && data.seq !== lastSeq) reshuffle = true;
              lastSeq = data.seq;
            })
            .catch(function () { /* host routes not up yet */ });
        }, 1000);
      }
      return function () {
        if (observer !== null) { try { observer.disconnect(); } catch (e) { /* ignore */ } observer = null; }
        if (streamObserver !== null) { try { streamObserver.disconnect(); } catch (e) { /* ignore */ } streamObserver = null; }
        if (pollTimer !== null && window.clearInterval) { try { window.clearInterval(pollTimer); } catch (e) { /* ignore */ } pollTimer = null; }
        if (locale.translate === wrapper) locale.translate = raw;
      };
    }

    // ---- plugin entry ----
    function apply(ctx) {
      armGestureUnlock();
      // The locale service is an OPTIONAL dependency: ctx.inject() keeps
      // banner/music/pet alive when it is unavailable, where a hard
      // `exports.inject` entry would block the whole plugin. installStatusText()
      // feature-detects the service shape and stays inert otherwise.
      var installStatus = function (scope) {
        var locale = null;
        if (scope) {
          if (typeof scope.get === 'function') { try { locale = scope.get('locale'); } catch (e) { /* not provided */ } }
          if (!locale && scope.locale) locale = scope.locale;
        }
        if (!locale) return;
        ctx.effect(function () { return installStatusText(locale); }, 'dsh-theme-tarkov: status text');
      };
      if (typeof ctx.inject === 'function') ctx.inject(['locale'], installStatus);
      else installStatus(ctx);
      fetchPrefs().then(function () { return migrateLegacy(); });
      startPolling();
      ctx.effect(function () {
        var disposeBgm = startBgm();
        return function () { disposeBgm(); };
      }, 'dsh-theme-tarkov: bgm');
      ctx.effect(function () {
        return startPet();
      }, 'dsh-theme-tarkov: pet');
      ctx.effect(function () {
        bannerRefs = startBanner();
        return function () {
          if (bannerRefs) bannerRefs.dispose();
          bannerRefs = null;
        };
      }, 'dsh-theme-tarkov: banner');
      var slots = (typeof ctx.get === 'function') ? ctx.get('slots') : ctx.slots;
      if (!slots) return;
      // settings.plugin.item is keyed by the Host settings namespace and the
      // tab only dispatches registered namespaces: the host half registers
      // `dsh-theme-tarkov` (schemastery schema, bundled via esbuild), so this
      // card renders beside browser / dsh-context inside Plugins → 插件配置.
      slots.inject('settings.plugin.item', function () {
        return slots.register(
          { name: 'settings.plugin.item', key: 'dsh-theme-tarkov', label: '塔科夫主题', order: 100 },
          function () {
            return React.createElement(TarkovCard, { panel: TarkovPanel });
          }
        );
      });
    }

    exports.apply = apply;
    exports.inject = ['slots'];

    return module.exports;
  }
});
