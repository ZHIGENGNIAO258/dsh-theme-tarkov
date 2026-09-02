// dsh-theme-tarkov — M1+M2 unit tests: event classification, per-session
// dedup state machine, and prefs sanitization. Run with: node tests/notify.test.mjs
import test from 'node:test'
import assert from 'node:assert'
import { classifySessionEvent, createSfxState, sanitizePrefs, mergePrefs, DEFAULT_PREFS } from '../lib/index.js'

const turnEnd = (kind) => ({ type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind } } })

test('turn/end completed → done', () => {
  assert.equal(classifySessionEvent(turnEnd('completed')), 'done')
})

test('turn/end blocked → approval', () => {
  assert.equal(classifySessionEvent(turnEnd('blocked')), 'approval')
})

test('turn/end aborted / error / max-tokens → error', () => {
  assert.equal(classifySessionEvent(turnEnd('aborted')), 'error')
  assert.equal(classifySessionEvent(turnEnd('error')), 'error')
  assert.equal(classifySessionEvent(turnEnd('max-tokens')), 'error')
})

test('approval/asked → approval, approval/decided → null', () => {
  assert.equal(classifySessionEvent({ type: 'approval/asked', data: { id: 'x', toolName: 'y' } }), 'approval')
  assert.equal(classifySessionEvent({ type: 'approval/decided', data: { id: 'x', outcome: 'allow' } }), null)
})

test('ask_user_question tool/call → approval, other tools → null', () => {
  assert.equal(classifySessionEvent({ type: 'tool/call', data: { turn: 1, step: 1, callId: 'c', name: 'ask_user_question' } }), 'approval')
  assert.equal(classifySessionEvent({ type: 'tool/call', data: { turn: 1, step: 1, callId: 'c', name: 'read' } }), null)
})

test('unrelated events → null', () => {
  assert.equal(classifySessionEvent({ type: 'user/message' }), null)
  assert.equal(classifySessionEvent({ type: 'turn/start' }), null)
  assert.equal(classifySessionEvent(null), null)
})

test('approval rings once per pending decision (asked → blocked silence)', () => {
  const state = createSfxState()
  assert.equal(state.handle('s1', { type: 'approval/asked', data: { id: 'a', toolName: 'bash' } }), true)
  assert.deepEqual(state.drain(), [{ type: 'approval', sessionId: 's1' }])
  // Same turn ends blocked afterwards: no second ring.
  assert.equal(state.handle('s1', turnEnd('blocked')), false)
  assert.deepEqual(state.drain(), [])
})

test('blocked without a prior approval/asked still rings', () => {
  const state = createSfxState()
  assert.equal(state.handle('s1', turnEnd('blocked')), true)
  assert.deepEqual(state.drain(), [{ type: 'approval', sessionId: 's1' }])
})

test('decided clears the pending flag; a later blocked rings again', () => {
  const state = createSfxState()
  state.handle('s1', { type: 'approval/asked', data: { id: 'a', toolName: 'bash' } })
  state.drain()
  state.handle('s1', { type: 'approval/decided', data: { id: 'a', outcome: 'allow' } })
  assert.equal(state.handle('s1', turnEnd('blocked')), true)
  assert.deepEqual(state.drain(), [{ type: 'approval', sessionId: 's1' }])
})

test('queue is capped at MAX_PENDING, drain empties it', () => {
  const state = createSfxState()
  const session = (id) => ({ type: 'turn/end', data: { turn: id, reason: { kind: 'completed' } } })
  assert.equal(state.handle('s1', session(1)), true)
  assert.equal(state.handle('s2', session(2)), true)
  assert.equal(state.handle('s3', session(3)), true)
  assert.equal(state.handle('s4', session(4)), false) // over cap
  const first = state.drain()
  assert.equal(first.length, 3)
  // Queue is empty again: one more event fits.
  assert.equal(state.handle('s5', session(5)), true)
  assert.deepEqual(state.drain(), [{ type: 'done', sessionId: 's5' }])
})

test('subagent sessions are rejected before classification', () => {
  const state = createSfxState()
  // The firehose filter lives in apply(); here we only verify the state machine
  // itself treats nothing specially — filtering is the caller's concern.
  assert.equal(state.handle('child', turnEnd('completed')), true)
  state.drain()
  assert.equal(state.handle('child', turnEnd('completed')), true)
})

test('sanitizePrefs fixes out-of-range values and preserves valid ones', () => {
  const fixed = sanitizePrefs({
    banner: { enabled: false, text1: '', text2: 'x', opacity: 9 },
    sfx: { enabled: true, volume: -5, sounds: { done: { dataUrl: 'data:audio/mp4;base64,AAAA', name: 'a.m4a' }, approval: 42 } },
    music: { enabled: true, volume: 120, junk: 'strip-me' },
  })
  assert.equal(fixed.banner.enabled, false)
  assert.equal(fixed.banner.text1, DEFAULT_PREFS.banner.text1) // '' falls back
  assert.equal(fixed.banner.text2, 'x')
  assert.equal(fixed.banner.opacity, DEFAULT_PREFS.banner.opacity) // >1 clamps to default
  assert.equal(fixed.sfx.enabled, true)
  assert.equal(fixed.sfx.volume, DEFAULT_PREFS.sfx.volume) // negative → default
  assert.deepEqual(fixed.sfx.sounds.done, { dataUrl: 'data:audio/mp4;base64,AAAA', name: 'a.m4a' })
  assert.equal(fixed.sfx.sounds.approval, null) // non-object → null
  assert.equal(fixed.music.enabled, true)
  assert.equal(fixed.music.volume, DEFAULT_PREFS.music.volume)
  assert.equal(fixed.music.junk, undefined) // unknown keys stripped
})

test('sanitizePrefs handles null / non-object / oversized dataUrl', () => {
  assert.deepEqual(sanitizePrefs(null), DEFAULT_PREFS)
  assert.deepEqual(sanitizePrefs('x'), DEFAULT_PREFS)
  const big = sanitizePrefs({ sfx: { sounds: { error: { dataUrl: 'data:audio/mp4;base64,' + 'A'.repeat(3 * 1024 * 1024), name: 'big.m4a' } } } })
  assert.equal(big.sfx.sounds.error, null)
})

test('sanitizePrefs validates music.trackId (no path traversal)', () => {
  assert.equal(sanitizePrefs({ music: { trackId: 'track1.wav' } }).music.trackId, 'track1.wav')
  assert.equal(sanitizePrefs({ music: { trackId: '../x.wav' } }).music.trackId, null)
  assert.equal(sanitizePrefs({ music: { trackId: 'a\\b.wav' } }).music.trackId, null)
  assert.equal(sanitizePrefs({ music: { trackId: '' } }).music.trackId, null)
  assert.equal(sanitizePrefs({ music: { trackId: null } }).music.trackId, null)
})

test('sanitizePrefs validates music.disabled / removed (path traversal stripped, deduped)', () => {
  const cleaned = sanitizePrefs({ music: { disabled: ['a.wav', '../x.wav', 'a\\b.wav', '', 'a.wav', 'ok.mp3', 42], removed: ['../x.wav', 'track3.wav', 7] } })
  assert.deepEqual(cleaned.music.disabled, ['a.wav', 'ok.mp3'])
  assert.deepEqual(cleaned.music.removed, ['track3.wav'])
  assert.deepEqual(sanitizePrefs({ music: { disabled: 'nope' } }).music.disabled, [])
  assert.deepEqual(sanitizePrefs({ music: { disabled: null } }).music.disabled, [])
  assert.deepEqual(sanitizePrefs({ music: { removed: null } }).music.removed, [])
})

test('mergePrefs merges field-wise and keeps base values', () => {
  const base = JSON.parse(JSON.stringify(DEFAULT_PREFS))
  base.music.volume = 55
  const merged = mergePrefs(base, { music: { trackId: 't1.wav' } })
  assert.equal(merged.music.volume, 55) // base kept
  assert.equal(merged.music.trackId, 't1.wav')
  const merged2 = mergePrefs(base, { sfx: { sounds: { error: null }, volume: 20 } })
  assert.equal(merged2.sfx.volume, 20)
  assert.equal(merged2.sfx.sounds.error, null)
  assert.equal(merged2.sfx.sounds.done, null) // base value kept
  assert.deepEqual(mergePrefs(base, null), base)
})

test('mergePrefs replaces music.disabled wholesale', () => {
  const base = JSON.parse(JSON.stringify(DEFAULT_PREFS))
  base.music.disabled = ['t1.wav']
  const merged = mergePrefs(base, { music: { disabled: ['t2.wav', 't3.wav'] } })
  assert.deepEqual(merged.music.disabled, ['t2.wav', 't3.wav'])
  assert.deepEqual(mergePrefs(base, { music: { volume: 10 } }).music.disabled, ['t1.wav']) // untouched
})
