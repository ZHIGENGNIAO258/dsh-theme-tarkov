// dsh-theme-tarkov — status-line copy tests.
//
// The randomized status line works by wrapping the locale service's
// translate() and answering a small set of dictionary keys from the host's copy
// pool. DSH renames those keys with UI refactors (0.1.7 moved the VISIBLE
// sentence to `message.turnProcess.deepDivingFor`, 0.2.0 moved it to
// `chat.deepDivingFor`) and a rename is completely silent: the wrapper simply
// stops being asked, and the status line quietly shows the stock sentence
// again. These tests pin the wiring and, when a DSH install is present, check
// the intercept set against the keys the installed chat package actually uses.
//
// Run: node tests/status-keys.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

// The intercepted keys, read straight out of the client half (the table is a
// plain object literal, so a tiny regex is enough and no bundler is involved).
function readStatusKeys() {
  const match = /var STATUS_KEYS = \{([\s\S]*?)\};/.exec(clientSource)
  assert.ok(match, 'lib/client.js must declare a STATUS_KEYS table')
  const keys = new Set()
  const entry = /'([^']+)'\s*:\s*true/g
  let hit
  while ((hit = entry.exec(match[1])) !== null) keys.add(hit[1])
  return keys
}

const STATUS_KEYS = readStatusKeys()

test('the status key table intercepts every key the running sentence ever used', () => {
  // 0.2.0 line: chat.deepDiving (visually-hidden announcement) + the visible
  // `chat.deepDivingFor` the chat package's RunningStatus renders with a
  // duration. This is the regression the 0.2.0 upgrade produced.
  assert.ok(STATUS_KEYS.has('chat.deepDiving'), 'chat.deepDiving must stay intercepted')
  assert.ok(STATUS_KEYS.has('chat.deepDivingFor'), 'chat.deepDivingFor (0.2.0 visible copy) must be intercepted')
  // ≤0.1.7 line: the visible sentence used to live in the message namespace.
  assert.ok(STATUS_KEYS.has('message.turnProcess.deepDivingFor'), 'the 0.1.7 visible key must stay intercepted')
})

test('against the installed DSH chat package, every running-status key is intercepted (local only)', (t) => {
  const candidates = [
    process.env.DSH_CHAT_CLIENT,
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js'),
    path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js'),
  ].filter(Boolean)
  const found = candidates.find((file) => {
    try {
      return fs.statSync(file).isFile()
    } catch (error) {
      return false
    }
  })
  if (!found) {
    t.skip('no local DSH install found (CI) — nothing to compare against')
    return
  }
  const bundle = fs.readFileSync(found, 'utf8')
  // Every literal the chat package passes through its namespace-bound `t`
  // (its own call sites AND its dictionary headers).
  const literals = new Set()
  const re = /["'](chat\.deepDiving[A-Za-z]*)["']/g
  let hit
  while ((hit = re.exec(bundle)) !== null) literals.add(hit[1])
  assert.ok(literals.size > 0, 'expected the chat package to mention chat.deepDiving* keys')
  const missing = [...literals].filter((key) => !STATUS_KEYS.has(key))
  assert.deepEqual(missing, [], 'unintercepted running-status keys in ' + found)
})

// ---- functional wiring: apply() with a stubbed locale service ----------------

function makeEl() {
  return {
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
  }
}

function buildEnv(texts) {
  const env = {
    console,
    localStorage: { store: {}, getItem(k) { return this.store[k] ?? null }, setItem(k, v) { this.store[k] = String(v) }, removeItem(k) { delete this.store[k] } },
    document: {
      head: { appendChild() {} },
      body: { appendChild() {}, contains: () => true, remove() {} },
      documentElement: {},
      createElement: () => makeEl(),
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
    },
    fetch: (url) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(/status-texts/.test(String(url))
        ? { enabled: true, texts }
        : { prefs: null, items: [], tracks: [], dir: 'dir' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }),
    Audio: function () { return { play: () => Promise.resolve(), pause() {}, addEventListener() {}, removeAttribute() {}, src: '', volume: 1, paused: true } },
    AudioContext: function () { return { state: 'running', currentTime: 0, resume: () => Promise.resolve(), createGain: () => ({ gain: { value: 0 }, connect() {} }), createBufferSource: () => ({ buffer: null, connect() {}, start() {} }), createBuffer: () => ({ getChannelData: () => new Float32Array(0) }), decodeAudioData: () => Promise.resolve(null), destination: {} } },
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
    __ModuleLoader__: { load(d) { env.__moduleDefinition = d } },
  }
  return env
}

// Boot the client half with a stubbed locale service and return its wrapper.
async function installWithLocale(texts, active = 'zh') {
  const env = buildEnv(texts)
  vm.runInNewContext(clientSource, env, { filename: 'lib/client.js' })
  const ReactStub = { createElement: () => ({}), useState: (v) => [v, () => {}], useEffect: () => {} }
  const exports = env.__moduleDefinition.factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error('unexpected require: ' + id)
  })
  const translateCalls = []
  const locale = {
    translate(ns, key) {
      translateCalls.push(ns + '|' + key)
      return 'STOCK(' + key + ')'
    },
    getLocale: () => ({ active, locales: [], revision: 1 }),
  }
  const original = locale.translate
  const slotsStub = { inject() {} }
  const effects = []
  const ctx = {
    get: (name) => (name === 'slots' ? slotsStub : name === 'locale' ? locale : undefined),
    effect: (fn) => { effects.push(fn); return () => {} },
  }
  await exports.apply(ctx)
  const disposers = []
  for (const fn of effects) {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
  }
  // The pool arrives from /dsh-tarkov/status-texts: let the microtask queue drain.
  await new Promise((resolve) => setImmediate(resolve))
  return { locale, original, disposers, translateCalls, exports }
}

const TEXTS = { zh: ['准备就绪，开始行动', '检查装备，谨慎推进'], en: ['Ready', 'Moving out'] }

test('translate() answers the 0.2.0 visible key from the host pool and keeps the duration', async () => {
  const { locale } = await installWithLocale(TEXTS, 'zh')
  const out = locale.translate('chat', 'chat.deepDivingFor', { duration: '12秒' })
  // No {duration} placeholder in the pool entry → the elapsed time is appended.
  assert.ok(TEXTS.zh.some((entry) => out === entry + '（用时12秒）'), 'expected a pool entry plus the time, got: ' + out)
})

test('translate() answers the visually-hidden announcement key too', async () => {
  const { locale } = await installWithLocale(TEXTS, 'zh')
  const out = locale.translate('chat', 'chat.deepDiving')
  assert.ok(TEXTS.zh.includes(out), 'expected a pool entry, got: ' + out)
})

test('the ≤0.1.7 visible key still resolves, and a namespace-less key resolves too', async () => {
  const { locale } = await installWithLocale(TEXTS, 'zh')
  const suffix = '（用时3秒）'
  assert.ok(TEXTS.zh.some((entry) => locale.translate('chat', 'message.turnProcess.deepDivingFor', { duration: '3秒' }) === entry + suffix))
  assert.ok(TEXTS.zh.some((entry) => locale.translate('chat', 'deepDivingFor', { duration: '3秒' }) === entry + suffix))
})

test('a {duration} placeholder in the pool is substituted, not appended', async () => {
  const { locale } = await installWithLocale({ zh: ['行动中，用时{duration}'], en: ['Running {duration}'] }, 'zh')
  assert.equal(locale.translate('chat', 'chat.deepDivingFor', { duration: '7秒' }), '行动中，用时7秒')
})

test('every other key and namespace passes straight through to the stock lookup', async () => {
  const { locale } = await installWithLocale(TEXTS, 'zh')
  assert.equal(locale.translate('chat', 'chat.loadOlder'), 'STOCK(chat.loadOlder)')
  assert.equal(locale.translate('message', 'chat.deepDivingFor'), 'STOCK(chat.deepDivingFor)')
})

test('the en pool serves a non-zh locale', async () => {
  const { locale } = await installWithLocale(TEXTS, 'en')
  const out = locale.translate('chat', 'chat.deepDivingFor', { duration: '1s' })
  assert.ok(TEXTS.en.some((entry) => out === entry + ' (1s)'), 'got: ' + out)
})

test('disposing restores the original translate()', async () => {
  const { locale, original, disposers } = await installWithLocale(TEXTS, 'zh')
  assert.notEqual(locale.translate, original)
  for (const dispose of disposers) dispose()
  assert.equal(locale.translate, original)
})
