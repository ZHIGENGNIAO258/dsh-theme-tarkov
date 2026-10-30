// Narrow-screen (phone portrait) behaviour of the client half:
//   1. the stylesheet written by ensureBannerCss()/ensurePetCss() carries the
//      breakpoints and the two-line clamp;
//   2. below the breakpoint the pet is not even built, so altyn.png is never
//      requested (the CSS alone would still download it).
// Run: node tests/narrow-screen.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

// The CSS arrays are plain JS array literals assigned to textContent, so they can
// be lifted out and evaluated without running any browser code.
function extractCss(name) {
  const re = new RegExp(name + "\\.textContent = (\\[[\\s\\S]*?\\])\\.join\\('\\\\n'\\);")
  const m = source.match(re)
  assert.ok(m, name + ' array literal must be locatable in lib/client.js')
  return new Function('return ' + m[1])().join('\n')
}

test('banner CSS: narrow breakpoints present and both lines hard-capped at 2 rows', () => {
  const css = extractCss('BANNER_CSS')

  assert.match(css, /@media \(max-width:768px\)/, 'phone landscape/portrait breakpoint missing')
  assert.match(css, /@media \(max-width:380px\)/, 'very-narrow breakpoint missing')

  const clamps = css.match(/-webkit-line-clamp:2/g) || []
  assert.equal(clamps.length, 2, 'line1 and line2 must each be clamped to two rows')
  // 每条线都要同时带上标准属性（前向兼容），故成对出现
  assert.equal(
    (css.match(/-webkit-line-clamp:2;line-clamp:2;/g) || []).length,
    2,
    'each clamp must also carry the standard line-clamp property',
  )

  // The narrow rules must come after the desktop rules, otherwise the cascade
  // would keep 18/15px and the clamp would do nothing useful.
  const baseLine2 = css.indexOf('.tarkov-banner-line2{color:#111111;font-size:15px')
  assert.ok(baseLine2 >= 0, 'desktop line2 rule not found')
  assert.ok(css.indexOf('@media (max-width:768px)') > baseLine2, 'narrow block must be last')

  assert.match(css, /\.tarkov-banner-line1\{font-size:14px/, 'narrow line1 size missing')
  assert.match(css, /\.tarkov-banner-line2\{font-size:12px/, 'narrow line2 size missing')
  assert.match(css, /\.tarkov-banner-line1\{font-size:13px\}/, 'very-narrow line1 size missing')
  assert.match(css, /\.tarkov-banner-line2\{font-size:11px\}/, 'very-narrow line2 size missing')
})

test('pet CSS: hidden below the same 768px breakpoint', () => {
  const css = extractCss('PET_CSS')
  assert.match(css, /@media \(max-width:768px\)\{#tarkov-pet-root\{display:none!important\}\}/)
})

function makeEl(tag) {
  return {
    tagName: tag,
    style: {
      props: {},
      setProperty(name, value) { this.props[name] = String(value) },
      removeProperty(name) { delete this.props[name] },
    },
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value) },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null },
    removeAttribute(name) { delete this.attrs[name] },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) },
    className: '',
    id: '',
    textContent: '',
    children: [],
    value: '',
    options: [],
    appendChild() {},
    append() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    insertBefore() {},
    querySelectorAll(selector) { return this._q && this._q[selector] ? this._q[selector] : [] },
    isConnected: true,
    naturalWidth: 566,
    naturalHeight: 379,
  }
}

// Behaviour tests that are not about the shipped defaults use this stable
// fixture: pet on, background off. The published defaults are covered by the
// host prefs tests instead.
const TEST_PREFS = {
  banner: { enabled: true, text1: 'x', text2: 'y', opacity: 0.55 },
  sfx: { enabled: true, volume: 70, sounds: { done: null, approval: null, error: null, tool_error: null } },
  music: { enabled: false, volume: 40, trackId: null, disabled: [], removed: [] },
  pet: { enabled: true, size: 160, volume: 70 },
  bg: { enabled: false, opacity: 72, tone: 0, feather: 6, clip: 'auto', crops: {}, perClip: {} },
}

function buildEnv(matchMediaResult, prefs, conversation) {
  const created = []
  const els = []
  const root = makeEl('html')
  const body = makeEl('body')
  body.prepend = () => {}
  body.contains = () => true
  body.remove = () => {}
  const env = {
    console,
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] ?? null },
      setItem(k, v) { this.store[k] = String(v) },
      removeItem(k) { delete this.store[k] },
    },
    document: {
      head: { appendChild() {} },
      body,
      documentElement: root,
      createElement: (tag) => { created.push(tag); const el = makeEl(tag); els.push(el); return el },
      querySelector: () => null,
      querySelectorAll: (selector) => (conversation && selector === '[data-conversation-content]' ? [conversation] : []),
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ prefs: prefs === undefined ? TEST_PREFS : prefs, items: [], tracks: [], dir: 'dir' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }),
    Audio: function () {
      return { play: () => Promise.resolve(), pause() {}, addEventListener() {}, removeAttribute() {}, src: '', volume: 1, paused: true }
    },
    AudioContext: function () {
      return {
        state: 'running',
        currentTime: 0,
        resume: () => Promise.resolve(),
        createGain: () => ({ gain: { value: 0 }, connect() {} }),
        createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
        createBuffer: () => ({ getChannelData: () => new Float32Array(0) }),
        decodeAudioData: () => Promise.resolve(null),
        destination: {},
      }
    },
    BroadcastChannel: function () { return { onmessage: null, postMessage() {}, close() {} } },
    MutationObserver: function () { return { observe() {}, disconnect() {} } },
    FileReader: function () { return {} },
    atob: (s) => s,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    URL,
  }
  env.window = {
    setInterval: env.setInterval,
    clearInterval: env.clearInterval,
    setTimeout: env.setTimeout,
    clearTimeout: env.clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    AudioContext: env.AudioContext,
    webkitAudioContext: undefined,
    innerWidth: matchMediaResult ? 408 : 1440,
    innerHeight: 900,
    matchMedia: (query) => ({ matches: matchMediaResult, media: query }),
    getComputedStyle: () => ({ getPropertyValue: (name) => (name === '--dsh-chat-content-width' ? '880px' : '') }),
    __ModuleLoader__: { load(d) { env.__moduleDefinition = d } },
  }
  return { env, created, els, root }
}

async function runApply(matchMediaResult, prefs, conversation, options) {
  const opts = options || {}
  const { env, created, els, root } = buildEnv(matchMediaResult, prefs, conversation)
  vm.runInNewContext(source, env, { filename: 'lib/client.js' })
  const ReactStub = { createElement: () => ({}), useState: (v) => [v, () => {}], useEffect: () => {} }
  const exports = env.__moduleDefinition.factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error('unexpected require: ' + id)
  })
  const slotsStub = { inject() {} }
  const themeCalls = []
  const themeListeners = []
  const themeRequests = []
  let themePreference = 'system'
  const themeStub = {
    overrideTokens(source, tokens) {
      themeCalls.push({ source, tokens })
      // Simulate the real service: overrideTokens publishes theme/change
      // synchronously. The client must not re-enter overrideTokens from its
      // own listener, or the plugin would recurse.
      for (const fn of themeListeners.slice()) fn()
      return () => {}
    },
    getTheme() { return { preference: themePreference } },
    setTheme(id) {
      themePreference = id
      themeRequests.push(id)
      // Real implementations may publish synchronously; the plugin must not
      // recurse into a second setTheme from its own listener.
      if (opts.emitOnSetTheme) for (const fn of themeListeners.slice()) fn()
    },
  }
  const effects = []
  const ctx = {
    get: (name) => (name === 'slots' ? slotsStub : (name === 'theme' ? themeStub : undefined)),
    effect: (fn) => { effects.push(fn); return () => {} },
    on: (name, fn) => { if (name === 'theme/change') themeListeners.push(fn); return () => {} },
  }
  await exports.apply(ctx)
  // fetchPrefs() is fire-and-forget: let its promise chain settle before the
  // effect callbacks run against the final cfg.
  for (let i = 0; i < 6; i++) await Promise.resolve()
  const snapshot = { attrs: { ...root.attrs }, props: { ...root.style.props } }
  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }
  return { created, themeCalls, themeRequests, els, root, snapshot }
}

test('narrow viewport: the pet is never built (altyn.png is not requested)', async () => {
  const { created } = await runApply(true)
  assert.ok(!created.includes('img'), 'no <img> may be created below the breakpoint, got: ' + created.join(','))
})

test('wide viewport: the pet is still built exactly as before', async () => {
  const { created } = await runApply(false)
  assert.ok(created.includes('img'), 'the pet must still load on desktop widths')
})

// ---- translucent video background -------------------------------------------

const BG_PREFS = {
  // The host always answers with the full prefs shape (sanitizePrefs); a partial
  // object here would make notify() read cfg.pet of undefined.
  banner: { enabled: true, text1: 'x', text2: 'y', opacity: 0.55 },
  sfx: { enabled: true, volume: 70, sounds: { done: null, approval: null, error: null, tool_error: null } },
  music: { enabled: false, volume: 40, trackId: null, disabled: [], removed: [] },
  pet: { enabled: true, size: 160, volume: 70 },
  bg: { enabled: true, opacity: 72, tone: 0, feather: 6, clip: 'auto', crops: {}, perClip: {} },
}

const withTone = (tone) => Object.assign({}, BG_PREFS, { bg: Object.assign({}, BG_PREFS.bg, { tone }) })

test('background CSS carries the tint profile, the width variable and the hero fade', () => {
  const css = extractCss('BG_CSS')
  assert.match(css, /@media \(max-width:768px\)\{#tarkov-bg-layer\{display:none\}\}/)
  assert.match(css, /#tarkov-bg-layer\{position:fixed;inset:0;z-index:-1;pointer-events:none/)
  assert.match(css, /#tarkov-bg-layer video,#tarkov-bg-layer \.tarkov-bg-still\{display:block;width:100%;height:100%;object-fit:cover;object-position:center\}/)
  assert.match(css, /#tarkov-bg-tint\{position:absolute;inset:0;pointer-events:none/)
  // The theme token lives on body, so the tint vars must be resolved there too.
  assert.match(css, /html\[data-tarkov-bg="on"\] body\{--tk-base:var\(--dsw-alias-bg-layer-1/)
  // The profile derives its plateau from the live conversation width.
  assert.match(css, /--tk-half:calc\(var\(--tarkov-chat-width,720px\) \/ 2 \+ 32px\)/)
  // Half the previous 96/12vw/240 feather: the plateau now falls off sooner.
  assert.ok(css.includes('--tk-feather:min(calc(var(--tk-feather-vw,6) * 1vw),240px)'))
  assert.ok(css.includes('--tk-center-x:var(--tarkov-chat-center,50%)'))
  // The composer dock gets a strip without moving its text.
  assert.ok(css.includes('[data-composer-dock]{background:'))
  assert.ok(css.includes('padding-left:10px;padding-right:10px;margin-left:-10px;margin-right:-10px'))
  assert.ok(css.includes('[data-composer-dock] [data-composer-stat="activity"] button'))
  assert.ok(!css.includes('conversation.chat.turnTail'), 'the per-turn cost note must not be restyled')
  // Edges are a non-zero alpha: the whole viewport stays covered.
  assert.match(css, /var\(--tk-edge/)
  // Hero fades the tint out; active fades it in.
  assert.match(css, /html\[data-tarkov-bg="on"\]\[data-tarkov-phase="active"\] #tarkov-bg-tint\{opacity:1\}/)
  assert.ok(!/tarkov-bg-scrim/.test(css), 'the old global scrim must be gone')
})

test('the tint carries the signed tone and the half-strength edge alpha', async () => {
  const dark = await runApply(false, withTone(-40))
  assert.equal(dark.snapshot.attrs['data-tarkov-bg'], 'on')
  assert.equal(dark.snapshot.props['--tk-center-alpha'], '72%')
  assert.equal(dark.snapshot.props['--tk-edge-alpha'], '36%')
  assert.equal(dark.snapshot.props['--tk-tone-mix'], '40%')
  assert.equal(dark.snapshot.props['--tk-tone-target'], '#000000')
  const bright = await runApply(false, withTone(25))
  assert.equal(bright.snapshot.props['--tk-tone-mix'], '25%')
  assert.equal(bright.snapshot.props['--tk-tone-target'], '#ffffff')
  const neutral = await runApply(false, withTone(0))
  assert.equal(neutral.snapshot.props['--tk-tone-mix'], '0%')
})

test('background off: no layer, no token override', async () => {
  const { created, themeCalls } = await runApply(false)
  assert.ok(!created.includes('video'), 'the clip must not be built while the feature is off')
  assert.equal(themeCalls.length, 0, 'surfaces must stay opaque while the feature is off')
})

test('wide viewport with the feature on: canvas transparent, sidebar low-alpha, tint built', async () => {
  const { created, themeCalls, els } = await runApply(false, BG_PREFS)
  assert.ok(created.includes('video'), 'the video layer must be built on desktop widths')
  assert.ok(els.some((el) => el.id === 'tarkov-bg-tint'), 'the full-screen tint must be built')
  assert.ok(themeCalls.length === 1, 'overrideTokens must be applied once; a theme/change echo must not recurse')
  const call = themeCalls[0]
  assert.equal(call.source, 'dsh-theme-tarkov/bg')
  // The canvas is fully transparent; the tint, not the token, carries readability.
  assert.equal(call.tokens['--dsw-alias-bg-base'].light, 'rgba(255,255,255,0)')
  assert.equal(call.tokens['--dsw-alias-bg-base'].dark, 'rgba(21,21,23,0)')
  // The sidebar keeps a 20% native tint but still lets the clip through.
  assert.equal(call.tokens['--dsw-specific-sidebar-fill'].light, 'rgba(249,250,251,0.20)')
  assert.equal(call.tokens['--dsw-specific-sidebar-fill'].dark, 'rgba(27,27,28,0.20)')
  assert.ok(!/--dsw-alias-bg-base[^;]*!important/.test(source), 'token must not be forced with !important')
})

test('narrow viewport with the feature on: no layer and no token override', async () => {
  const { created, themeCalls } = await runApply(true, BG_PREFS)
  assert.ok(!created.includes('video'), 'the clip must not be built on a phone')
  assert.equal(themeCalls.length, 0, 'a phone keeps opaque surfaces')
})

test('conversation width and hero phase are published on <html>', async () => {
  const body = makeEl('div')
  body.attrs['data-content-phase'] = 'hero'
  body.parentNode = null
  const hero = await runApply(false, BG_PREFS, body)
  assert.equal(hero.snapshot.attrs['data-tarkov-phase'], 'hero')
  assert.equal(hero.snapshot.props['--tarkov-chat-width'], '880px')
  assert.equal(hero.snapshot.props['--tarkov-chat-center'], '720px')
  const active = await runApply(false, BG_PREFS)
  assert.equal(active.snapshot.attrs['data-tarkov-phase'], 'active')
})

test('per-background tuning: the active clip restores its own mask and theme', async () => {
  const prefs = Object.assign({}, BG_PREFS, {
    bg: Object.assign({}, BG_PREFS.bg, {
      clip: 'for-humanity',
      perClip: { 'for-humanity': { opacity: 48, tone: -35, feather: 4, theme: 'dark' } },
    }),
  })
  const { snapshot, themeRequests } = await runApply(false, prefs)
  assert.equal(snapshot.attrs['data-tarkov-bg'], 'on')
  assert.equal(snapshot.props['--tk-center-alpha'], '48%')
  assert.equal(snapshot.props['--tk-edge-alpha'], '24%')
  assert.equal(snapshot.props['--tk-tone-mix'], '35%')
  assert.equal(snapshot.props['--tk-tone-target'], '#000000')
  assert.equal(snapshot.props['--tk-feather-vw'], '4')
  assert.deepEqual(themeRequests, ['dark'], 'switching to a stored background must apply its theme once')
})

test('per-background theme application survives a synchronous theme/change echo', async () => {
  const prefs = Object.assign({}, BG_PREFS, {
    bg: Object.assign({}, BG_PREFS.bg, {
      clip: 'for-humanity',
      perClip: { 'for-humanity': { opacity: 60, tone: 0, theme: 'dark' } },
    }),
  })
  const { themeRequests } = await runApply(false, prefs, undefined, { emitOnSetTheme: true })
  assert.deepEqual(themeRequests, ['dark'], 'one application, not a recursion')
})

test('per-background tuning: an unrecorded clip falls back to the global defaults', async () => {
  const prefs = Object.assign({}, BG_PREFS, {
    bg: Object.assign({}, BG_PREFS.bg, { clip: 'and-survived', perClip: {} }),
  })
  const { snapshot, themeRequests } = await runApply(false, prefs)
  assert.equal(snapshot.props['--tk-center-alpha'], '72%')
  assert.equal(snapshot.props['--tk-tone-mix'], '0%')
  assert.equal(snapshot.props['--tk-feather-vw'], '6')
  assert.deepEqual(themeRequests, [], 'an untouched background must not repaint the shell at startup')
})

test('the tint centre follows the chat column when a sidebar shifts it', async () => {
  const conversation = makeEl('div')
  conversation.attrs['data-content-phase'] = 'active'
  conversation._q = {
    '[data-conversation-scroll] [class*="_column"]': [{
      getBoundingClientRect: () => ({ width: 760, left: 470, height: 600 }),
    }],
  }
  const { snapshot } = await runApply(false, BG_PREFS, conversation)
  assert.equal(snapshot.props['--tarkov-chat-width'], '760px')
  assert.equal(snapshot.props['--tarkov-chat-center'], '850px', 'centre = left + width/2, not 50vw')
})

test('theme switch and framing use the official surfaces', () => {
  assert.ok(source.includes("TARKOV_REPO_URL = 'https://github.com/ZHIGENGNIAO258/dsh-theme-tarkov'"))
  assert.ok(source.includes('欢迎提需求：'))
  assert.ok(source.includes('以《逃离塔科夫》为灵感的 DSH Web 界面主题'))
  assert.match(source, /themeSvc\.setTheme\(id\)/, 'the card must write through ctx.theme.setTheme')
  assert.match(source, /ctx\.on\('theme\/change'/, 'external appearance changes must be mirrored')
  assert.match(source, /objectViewBox = cropToInset\(crop\)/, 'background framing must use object-view-box')
  assert.match(source, /style\.objectViewBox = cropToInset\(next\)/, 'the editor must preview the same crop')
})
