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
    style: { setProperty() {} },
    className: '',
    textContent: '',
    children: [],
    value: '',
    options: [],
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    append() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    insertBefore() {},
    isConnected: true,
    naturalWidth: 566,
    naturalHeight: 379,
  }
}

function buildEnv(matchMediaResult) {
  const created = []
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
      body: { appendChild() {}, contains: () => true, remove() {} },
      documentElement: {},
      createElement: (tag) => { created.push(tag); return makeEl(tag) },
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ prefs: null, items: [], tracks: [], dir: 'dir' }),
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
    __ModuleLoader__: { load(d) { env.__moduleDefinition = d } },
  }
  return { env, created }
}

async function runApply(matchMediaResult) {
  const { env, created } = buildEnv(matchMediaResult)
  vm.runInNewContext(source, env, { filename: 'lib/client.js' })
  const ReactStub = { createElement: () => ({}), useState: (v) => [v, () => {}], useEffect: () => {} }
  const exports = env.__moduleDefinition.factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error('unexpected require: ' + id)
  })
  const slotsStub = { inject() {} }
  const effects = []
  const ctx = {
    get: (name) => (name === 'slots' ? slotsStub : undefined),
    effect: (fn) => { effects.push(fn); return () => {} },
  }
  await exports.apply(ctx)
  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }
  return created
}

test('narrow viewport: the pet is never built (altyn.png is not requested)', async () => {
  const created = await runApply(true)
  assert.ok(!created.includes('img'), 'no <img> may be created below the breakpoint, got: ' + created.join(','))
})

test('wide viewport: the pet is still built exactly as before', async () => {
  const created = await runApply(false)
  assert.ok(created.includes('img'), 'the pet must still load on desktop widths')
})
