import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVoiceSimulator, DEFAULT_MOTION, ORB_STATES } from '../dist/index.js'
import { createScheme, DEFAULT_ROLES, schemeColors, schemes } from '../dist/schemes.js'
import { variants } from '../dist/variants/index.js'
import { elevenLabsAudio, elevenLabsState } from '../dist/adapters/elevenlabs.js'
import { geminiLiveState } from '../dist/adapters/gemini.js'
import { openaiRealtimeState } from '../dist/adapters/openai.js'
import { autoRange, bandsFromBytes, levelFromRms } from '../dist/core/audio.js'
import { parseColor, toOklab, writePalette } from '../dist/core/color.js'
import { maxChroma, oklch, toOklch } from '../dist/core/scheme.js'
import { clamp01, Spring } from '../dist/core/spring.js'
import { resolveMotion } from '../dist/core/states.js'

const HEX = /^#[0-9a-f]{6}$/
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b}`)
const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

/** Runs `fn` with a clock that advances one 60 fps frame per `tick()`. */
function withClock(fn) {
  const real = performance.now
  let now = 1000
  performance.now = () => now
  try {
    return fn(() => (now += 1000 / 60))
  } finally {
    performance.now = real
  }
}
const frameOf = (v) => ({ level: v, low: v, mid: v, high: v })

test('parseColor reads hex and rgb() without a DOM', () => {
  assert.deepEqual(parseColor('#fff'), [1, 1, 1, 1])
  assert.deepEqual(parseColor('#00000080').map((v) => +v.toFixed(3)), [0, 0, 0, 0.502])
  assert.deepEqual(parseColor(' rgba(255, 0, 0, 0.5) '), [1, 0, 0, 0.5])
  assert.deepEqual(parseColor('rgb(0 255 0)'), [0, 1, 0, 1])
})

test('OKLab and OKLCH match reference values', () => {
  const [L, a, b] = toOklab('#ffffff')
  close(L, 1, 1e-4, 'white L')
  close(Math.hypot(a, b), 0, 1e-4, 'white chroma')
  const [Lr, Cr, Hr] = toOklch('#ff0000')
  close(Lr, 0.628, 1e-3, 'red L')
  close(Cr, 0.2577, 1e-3, 'red C')
  close(Hr, 29.23, 0.05, 'red H')
})

test('oklch() round-trips in gamut and reduces chroma (not hue) out of gamut', () => {
  const [L, C, H] = toOklch(oklch(0.7, 0.1, 250))
  close(L, 0.7, 0.005)
  close(C, 0.1, 0.005)
  close(H, 250, 1)
  const clipped = oklch(0.7, 0.4, 250)
  assert.match(clipped, HEX)
  close(toOklch(clipped)[2], 250, 2, 'hue kept')
  close(toOklch(clipped)[1], maxChroma(0.7, 250), 0.01, 'chroma at gamut edge')
})

test('every curated scheme fills all seven roles with hex colors', () => {
  const roles = ['highlight', 'tint', 'primary', 'secondary', 'accent', 'deep', 'ink']
  assert.equal(Object.keys(schemes).length, 22)
  for (const s of Object.values(schemes)) {
    assert.deepEqual(Object.keys(s.colors).sort(), [...roles].sort(), s.name)
    for (const c of [...Object.values(s.colors), ...Object.values(s.light ?? {})]) assert.match(c, HEX, s.name)
  }
})

test('schemeColors maps roles and applies light-page overrides', () => {
  const g = schemes.graphite
  assert.deepEqual(schemeColors(g), DEFAULT_ROLES.map((r) => g.colors[r]))
  assert.equal(schemeColors(g, DEFAULT_ROLES, 'light')[0], g.light.primary)
})

test('createScheme keeps the brand hue and orders lightness', () => {
  for (const brand of ['#ff5a1f', '#1f6bff', '#22c55e', '#a855f7', '#facc15']) {
    const s = createScheme(brand)
    assert.ok(hueGap(toOklch(s.colors.primary)[2], toOklch(brand)[2]) < 2, `${brand} hue`)
    const L = (r) => toOklch(s.colors[r])[0]
    assert.ok(L('highlight') > L('tint') && L('tint') > L('deep') && L('deep') > L('ink'), `${brand} ladder`)
  }
  assert.equal(createScheme('#808080').name, 'custom')
  for (const harmony of ['analogous', 'complementary', 'split', 'triadic']) {
    assert.match(createScheme('#ff5a1f', { harmony }).colors.accent, HEX)
  }
})

test('writePalette repeats colors to fill four slots', () => {
  const out = new Float32Array(12)
  writePalette(['#ff0000', '#0000ff'], out)
  assert.deepEqual([...out.slice(0, 3)], [...out.slice(6, 9)])
  assert.deepEqual([...out.slice(3, 6)], [...out.slice(9, 12)])
})

test('resolveMotion layers overrides and ignores undefined', () => {
  const m = resolveMotion('thinking', { thinking: { swirl: 2 } }, { thinking: { swirl: undefined, glow: 0 } })
  assert.equal(m.swirl, 2)
  assert.equal(m.glow, 0)
  assert.equal(m.speed, DEFAULT_MOTION.thinking.speed)
  for (const s of ORB_STATES) assert.ok(DEFAULT_MOTION[s])
})

test('clamp01 and Spring', () => {
  assert.equal(clamp01(NaN), 0)
  assert.equal(clamp01(2), 1)
  const spring = new Spring(0)
  spring.target = 1
  for (let i = 0; i < 180; i++) spring.step(1 / 60, { stiffness: 28, damping: 9 })
  close(spring.value, 1, 1e-3, 'settles in 3 s')
  // One long frame is substepped, so a stiff spring stays stable.
  const stiff = new Spring(0)
  stiff.target = 1
  stiff.step(0.5, { stiffness: 400, damping: 10 })
  assert.ok(Number.isFinite(stiff.value) && Math.abs(stiff.value) < 3)
})

test('audio helpers', () => {
  assert.equal(levelFromRms(0), 0)
  assert.equal(levelFromRms(1), 1)
  // A hot TTS syllable (-12 dBFS) is no longer pinned at the top.
  assert.ok(levelFromRms(10 ** (-12 / 20)) < 0.9)
  const frame = { level: 0, low: 0, mid: 0, high: 0 }
  bandsFromBytes(new Uint8Array(512).fill(255), 8000 / 512, frame)
  assert.deepEqual([frame.low, frame.mid, frame.high], [1, 1, 1])
})

test('autoRange stretches a narrow voice to the full range and keeps steady noise near 0', () => {
  withClock((tick) => {
    let x = 0
    const sample = autoRange(() => frameOf(x))
    // Steady room noise reads as silence from the very first frame.
    x = 0.3
    assert.equal(sample().level, 0, 'first read')
    for (let i = 0; i < 120; i++, tick()) assert.ok(sample().level < 0.02, 'steady noise')
    // Syllables 25 dB over their valleys, all near the top (a hot TTS voice), swing the full range.
    const seen = []
    for (let i = 0; i < 600; i++, tick()) {
      x = i % 12 < 6 ? 0.9 : 0.55
      seen.push(sample().level)
    }
    const late = seen.slice(300)
    assert.ok(Math.max(...late) > 0.9, `peaks ${Math.max(...late)}`)
    assert.ok(Math.min(...late) < 0.2, `valleys ${Math.min(...late)}`)
    for (const v of seen) assert.ok(v >= 0 && v <= 1)
  })
})

test('autoRange advances once per frame however many orbs read it', () => {
  withClock((tick) => {
    let reads = 0
    let x = 0
    const sample = autoRange(() => (reads++, frameOf(x)))
    for (let i = 0; i < 60; i++, tick()) sample()
    x = 1
    tick()
    const first = sample().level
    assert.equal(sample().level, first)
    assert.equal(sample().level, first)
    assert.equal(reads, 61)
  })
})

test('voice simulator stays within 0–1', () => {
  const sample = createVoiceSimulator(3)
  for (let i = 0; i < 500; i++) {
    const f = sample()
    for (const v of [f.level, f.low, f.mid, f.high]) assert.ok(v >= 0 && v <= 1)
  }
})

test('variants are complete', () => {
  const names = Object.keys(variants)
  assert.equal(names.length, 9)
  for (const name of names) {
    const v = variants[name]
    assert.equal(v.name, name)
    assert.ok(v.colors.length >= 1 && v.colors.length <= 4)
    assert.equal(typeof v.setup, 'function')
  }
})

test('ElevenLabs adapter', () => {
  assert.equal(elevenLabsState('connecting', false), 'connecting')
  assert.equal(elevenLabsState('connected', true), 'speaking')
  assert.equal(elevenLabsState('connected', false), 'listening')
  assert.equal(elevenLabsState('disconnected', true), 'idle')
  withClock((tick) => {
    let volume = 0
    const { input, output } = elevenLabsAudio({ getInputVolume: () => 0.4, getOutputVolume: () => volume })
    // Volume without a spectrum fills every band, auto-ranged: steady reads as silence...
    for (let i = 0; i < 120; i++, tick()) input()
    assert.ok(input().level < 0.02)
    // ...and the SDK's small volumes (0.1–0.25 here) still swing most of the range.
    let top = 0
    for (let i = 0; i < 300; i++, tick()) {
      volume = i % 12 < 6 ? 0.25 : 0.1
      top = Math.max(top, output().high)
    }
    assert.ok(top > 0.6, `top ${top}`)
  })
  // The same conversation keeps its samplers, and with them their auto-range.
  const conversation = { getInputVolume: () => 0, getOutputVolume: () => 0 }
  assert.equal(elevenLabsAudio(conversation), elevenLabsAudio(conversation))
})

test('OpenAI Realtime reducer', () => {
  const run = (...types) => types.reduce((s, type) => openaiRealtimeState({ type }, s), 'idle')
  assert.equal(run('session.created'), 'listening')
  assert.equal(run('session.created', 'input_audio_buffer.speech_stopped'), 'thinking')
  assert.equal(run('session.created', 'response.created', 'output_audio_buffer.started'), 'speaking')
  assert.equal(run('session.created', 'response.created', 'response.done'), 'listening')
  assert.equal(run('session.created', 'output_audio_buffer.started', 'response.done'), 'speaking')
  assert.equal(run('session.created', 'unknown.event'), 'listening')
})

test('Gemini Live reducer', () => {
  assert.equal(geminiLiveState({ setupComplete: {} }, 'idle'), 'listening')
  assert.equal(geminiLiveState({ toolCall: {} }, 'listening'), 'thinking')
  assert.equal(geminiLiveState({ serverContent: { modelTurn: {} } }, 'thinking'), 'speaking')
  assert.equal(geminiLiveState({ serverContent: { interrupted: true } }, 'speaking'), 'listening')
  assert.equal(geminiLiveState({ serverContent: { turnComplete: true } }, 'speaking'), 'listening')
  assert.equal(geminiLiveState({}, 'thinking'), 'thinking')
})
