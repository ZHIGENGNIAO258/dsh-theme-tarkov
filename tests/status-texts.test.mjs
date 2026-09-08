// Status-line copy tests: the host-side pool parser, the host step counter that
// paces it, and the client-side translate() wrapper that swaps chat.deepDiving
// for a random pool entry. Run: node tests/status-texts.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'tarkov-status-'))
const host = await import('../lib/index.js')
const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

test('parseStatusTexts drops comments, blanks, duplicates and over-long lines', () => {
  const parsed = host.parseStatusTexts(
    ['# comment', '', '  第一句  ', '第一句', 'x'.repeat(201), '第二句', '   '].join('\n'),
  )
  assert.deepEqual(parsed, ['第一句', '第二句'])
})

test('parseStatusTexts caps the pool and tolerates non-string input', () => {
  const many = Array.from({ length: 260 }, (_, i) => 'line-' + i).join('\n')
  assert.equal(host.parseStatusTexts(many).length, 200)
  assert.deepEqual(host.parseStatusTexts(null), [])
  assert.deepEqual(host.parseStatusTexts(undefined), [])
})

// ---- client half -------------------------------------------------------
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

/** Same browser stub as tests/client-smoke.mjs, plus observable observers/timers. */
function buildEnv(statusPayload, statusPoll) {
  const observers = []
  const intervals = []
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
    fetch: (url) => {
      const target = String(url)
      if (target.indexOf('/dsh-tarkov/status-texts') >= 0) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(statusPayload) })
      }
      if (target.indexOf('/dsh-tarkov/status-poll') >= 0) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ seq: statusPoll.seq }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ prefs: null, items: [], tracks: [], dir: 'dir' }) })
    },
    Audio: function () { return { play: () => Promise.resolve(), pause() {}, addEventListener() {}, removeAttribute() {}, src: '', volume: 1, paused: true } },
    AudioContext: function () { return { state: 'running', currentTime: 0, resume: () => Promise.resolve(), createGain: () => ({ gain: { value: 0 }, connect() {} }), createBufferSource: () => ({ buffer: null, connect() {}, start() {} }), createBuffer: () => ({ getChannelData: () => new Float32Array(0) }), decodeAudioData: () => Promise.resolve(null), destination: {} } },
    BroadcastChannel: function () { return { onmessage: null, postMessage() {}, close() {} } },
    MutationObserver: function (cb) { const o = { cb, target: null, options: null, observe(t, opts) { o.target = t; o.options = opts || {} }, disconnect() {} }; observers.push(o); return o },
    FileReader: function () { return {} },
    atob: (s) => s,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length },
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
  env.__observers = observers
  env.__intervals = intervals
  return env
}

/** Load the client half, run apply(), and return the wrapped locale service. */
async function bootClient(statusPayload) {
  const statusPoll = { seq: 0 }
  const env = buildEnv(statusPayload, statusPoll)
  vm.runInNewContext(source, env, { filename: 'lib/client.js' })
  const ReactStub = { createElement: () => ({}), useState: (v) => [v, () => {}], useEffect: () => {} }
  const mod = env.__moduleDefinition.factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error('unexpected require: ' + id)
  })
  const state = { active: 'zh' }
  const locale = {
    translate(ns, key) { return 'ORIG:' + ns + ':' + key },
    getLocale() { return { active: state.active } },
  }
  const effects = []
  const ctx = {
    get: (name) => (name === 'slots' ? { inject() {} } : name === 'locale' ? locale : undefined),
    inject: (deps, fn) => { if (deps.includes('locale')) fn({ get: ctx.get, locale }) },
    effect: (fn) => { effects.push(fn); return () => {} },
  }
  await mod.apply(ctx)
  const disposers = effects.map((fn) => fn()).filter((d) => typeof d === 'function')
  // installStatusText() runs inside its effect and fetches the pool there; let
  // that promise land before the test drives translate().
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { locale, state, disposers, env, statusPoll }
}

/** Fire the client's status poll (the 1000ms interval) once and settle. */
async function pollOnce(env) {
  for (const item of env.__intervals) {
    if (item.ms === 1000) item.fn()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function announceNewTurn(env) {
  const statusNode = { nodeType: 1, matches: (sel) => sel === '[role="status"][aria-live]', querySelector: () => null, parentElement: null }
  for (const observer of env.__observers) {
    try { observer.cb([{ addedNodes: [statusNode] }]) } catch (error) { /* pet observer ignores args */ }
  }
}

test('client wrapper serves pool entries, stays stable within a turn, passes other keys through', async () => {
  const { locale, state, disposers, env } = await bootClient({
    enabled: true,
    texts: { zh: ['甲', '乙'], en: ['A', 'B'] },
  })

  const first = locale.translate('chat', 'chat.deepDiving')
  assert.ok(['甲', '乙'].includes(first), 'status copy must come from the zh pool, got ' + first)
  for (let i = 0; i < 5; i++) {
    assert.equal(locale.translate('chat', 'chat.deepDiving'), first, 'the copy must stay stable inside one turn')
  }
  assert.equal(locale.translate('common', 'cancel'), 'ORIG:common:cancel', 'other keys must pass through')

  announceNewTurn(env)
  const second = locale.translate('chat', 'chat.deepDiving')
  assert.notEqual(second, first, 'a new turn must pick a different entry when the pool has an alternative')

  state.active = 'en'
  const english = locale.translate('chat', 'chat.deepDiving')
  assert.ok(['A', 'B'].includes(english), 'an en locale must read the en pool, got ' + english)

  for (const dispose of disposers) dispose()
  assert.equal(locale.translate('chat', 'chat.deepDiving'), 'ORIG:chat:chat.deepDiving', 'dispose must restore translate()')
})

test('the status copy rotates once per completed step', async () => {
  const { locale, disposers, env, statusPoll } = await bootClient({ enabled: true, texts: { zh: ['甲', '乙'], en: [] } })
  const first = locale.translate('chat', 'chat.deepDiving')

  // The first poll only records a baseline; an idle host must not rotate.
  await pollOnce(env)
  assert.equal(locale.translate('chat', 'chat.deepDiving'), first, 'the baseline poll must not rotate the copy')

  // One finished step (thinking / a tool call) moves the host counter.
  statusPoll.seq += 1
  await pollOnce(env)
  const second = locale.translate('chat', 'chat.deepDiving')
  assert.notEqual(second, first, 'a finished step must rotate the copy')

  // Still inside the same step: further polls with an unchanged counter hold.
  await pollOnce(env)
  assert.equal(locale.translate('chat', 'chat.deepDiving'), second, 'an unchanged counter must hold the copy')

  statusPoll.seq += 1
  await pollOnce(env)
  assert.notEqual(locale.translate('chat', 'chat.deepDiving'), second, 'the next step must rotate again')

  for (const dispose of disposers) dispose()
})

test('a rendered step rotates the copy even without host support', async () => {
  const { locale, disposers, env } = await bootClient({ enabled: true, texts: { zh: ['甲', '乙'], en: [] } })
  const first = locale.translate('chat', 'chat.deepDiving')

  // Mount a status line whose parent is the message flow.
  const flow = { nodeType: 1 }
  const statusNode = { nodeType: 1, matches: (sel) => sel === '[role="status"][aria-live]', querySelector: () => null, parentElement: flow }
  for (const observer of env.__observers) {
    try { observer.cb([{ addedNodes: [statusNode] }]) } catch (error) { /* ignore */ }
  }
  const second = locale.translate('chat', 'chat.deepDiving')
  assert.notEqual(second, first, 'mounting a status line must rotate the copy')

  const stream = env.__observers.find((o) => o.target === flow)
  assert.ok(stream, 'the message flow must be observed for new siblings')
  stream.cb([{ addedNodes: [{ nodeType: 1 }] }])
  assert.notEqual(locale.translate('chat', 'chat.deepDiving'), second, 'a rendered step must rotate the copy')

  for (const dispose of disposers) dispose()
})

test('client wrapper stays inert without a usable pool or locale service', async () => {
  const empty = await bootClient({ enabled: false, texts: { zh: [], en: [] } })
  assert.equal(empty.locale.translate('chat', 'chat.deepDiving'), 'ORIG:chat:chat.deepDiving')
  for (const dispose of empty.disposers) dispose()

  const missing = await bootClient({ enabled: true, texts: { zh: ['甲'], en: [] } })
  // Only a zh pool: an en locale falls back to it rather than showing nothing.
  missing.state.active = 'en'
  assert.equal(missing.locale.translate('chat', 'chat.deepDiving'), '甲')
  for (const dispose of missing.disposers) dispose()
})

// ---- host half ---------------------------------------------------------
function bootHost() {
  const registered = []
  const listeners = {}
  const ctx = {
    inject: (deps, fn) => { if (deps.includes('settings')) fn({ settings: { register() {} } }) },
    on: (name, fn) => { listeners[name] = fn },
    effect: (fn) => { fn(); return () => {} },
    webServer: { register: (route) => { registered.push(route); return () => {} } },
    fs: { resolve: async (p) => p, listDir: async () => [], readBytes: async () => new Uint8Array(0) },
  }
  host.apply(ctx)
  return { registered, listeners }
}

function readRoute(route) {
  const res = { chunks: [], writeHead() {}, end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)) } }
  route.handler({ method: 'GET', url: route.path }, res)
  return JSON.parse(Buffer.concat(res.chunks).toString('utf8'))
}

test('host route serves the pools bundled in assets/status', () => {
  const { registered } = bootHost()
  const route = registered.find((r) => r.path === '/dsh-tarkov/status-texts')
  assert.ok(route, 'the status-texts route must be mounted')
  const body = readRoute(route)
  assert.equal(body.enabled, true)
  assert.ok(body.texts.zh.length >= 3, 'the bundled zh pool must ship entries')
  assert.ok(body.texts.en.length >= 3, 'the bundled en pool must ship entries')
  assert.ok(body.texts.zh.every((line) => !line.startsWith('#')), 'comments must never reach the client')
})

test('host status-poll counts completed steps and skips subagent sessions', () => {
  const { registered, listeners } = bootHost()
  const route = registered.find((r) => r.path === '/dsh-tarkov/status-poll')
  assert.ok(route, 'the status-poll route must be mounted')
  const listener = listeners['session/event']
  assert.equal(typeof listener, 'function', 'the host must subscribe to session events')

  const before = readRoute(route).seq
  const mainSession = { id: 's1', header: { origin: 'user' } }
  listener(mainSession, { type: 'assistant/chunk' })
  assert.equal(readRoute(route).seq, before, 'streaming chunks must not advance the counter')
  listener(mainSession, { type: 'step/end' })
  assert.equal(readRoute(route).seq, before + 1, 'a finished step must advance the counter')
  listener(mainSession, { type: 'step/end' })
  assert.equal(readRoute(route).seq, before + 2, 'every finished step advances the counter')
  listener({ id: 's2', header: { origin: 'subagent' } }, { type: 'step/end' })
  assert.equal(readRoute(route).seq, before + 2, 'subagent steps must not advance the counter')
})
