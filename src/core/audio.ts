import { clamp01, damp } from './spring.js'

/** Loudness and three speech bands, each 0–1. */
export interface AudioFrame {
  level: number
  low: number
  mid: number
  high: number
}

/**
 * Called once per animation frame. Return a loudness (0–1) or a full frame.
 * Samplers that own audio resources expose `dispose`.
 */
export type AudioSampler = (() => AudioFrame | number) & { dispose?: () => void }

const BANDS = [
  ['low', 80, 400],
  ['mid', 400, 2000],
  ['high', 2000, 8000],
] as const

/** Averages byte frequency data (0–255 per bin) into speech bands. */
export function bandsFromBytes(data: Uint8Array, hzPerBin: number, out: AudioFrame) {
  for (const [band, from, to] of BANDS) {
    const start = Math.max(1, Math.floor(from / hzPerBin))
    const end = Math.min(data.length, Math.ceil(to / hzPerBin))
    let sum = 0
    for (let i = start; i < end; i++) sum += data[i]
    out[band] = end > start ? sum / ((end - start) * 255) : 0
  }
}

/**
 * Maps RMS amplitude to 0–1 on a decibel scale (-70 to 0 dBFS), which tracks perceived loudness.
 * Wide on purpose: TTS voices are mastered hot, and a narrower window pins their syllables at 1.
 */
export function levelFromRms(rms: number) {
  const db = 20 * Math.log10(rms + 1e-7)
  return clamp01((db + 70) / 70)
}

const KEYS = ['level', 'low', 'mid', 'high'] as const
// Several orbs and meters can read one sampler each frame; reads closer together than this are
// the same frame, so the auto-range advances once per frame however many read it.
const SAME_FRAME = 4
const FLOOR_FALL = 8
const FLOOR_RISE = 2.5
const PEAK_FALL = 0.3
const MIN_RANGE = 0.2
const GATE = 0.04
const CURVE = 1.4

/**
 * Auto-range: tracks each channel's recent floor (the dips between syllables, or room noise) and
 * peak, and stretches the span between them to 0–1, so a hot TTS voice and a quiet laptop mic
 * both swing the full range. The floor climbs fast enough to sit in the valleys of continuous
 * speech, the curve lets stressed syllables stand out, and `minRange` (the narrowest span ever
 * stretched to 0–1) keeps room noise from being blown up into motion. On a TTS clip the smoothed
 * level while voiced goes from mean 0.95 / sd 0.09 (a plain decibel mapping, mostly pinned) to
 * 0.66 / 0.26; the voice simulator sits at 0.62 / 0.22.
 */
export function autoRange(read: () => AudioFrame, minRange = MIN_RANGE): AudioSampler {
  const out: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
  const floor: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
  const peak: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
  let last = 0
  return () => {
    const now = performance.now()
    if (last && now - last < SAME_FRAME) return out
    const first = !last
    const dt = first ? 1 / 60 : Math.min((now - last) / 1000, 0.1)
    last = now
    const raw = read()
    for (const key of KEYS) {
      const x = clamp01(raw[key])
      // Seeded from the first reading: steady noise is silent at once, and speech already under
      // way registers at its next dip instead of after the floor has fallen from the top.
      if (first) floor[key] = peak[key] = x
      floor[key] = damp(floor[key], x, x < floor[key] ? FLOOR_FALL : FLOOR_RISE, dt)
      peak[key] = x > peak[key] ? x : damp(peak[key], floor[key], PEAK_FALL, dt)
      const bottom = floor[key] + GATE
      out[key] = clamp01((x - bottom) / Math.max(peak[key] - bottom, minRange)) ** CURVE
    }
    return out
  }
}

export function fromAnalyser(analyser: AnalyserNode): AudioSampler {
  analyser.fftSize = 1024
  analyser.minDecibels = -100
  analyser.maxDecibels = -10
  analyser.smoothingTimeConstant = 0.6
  const wave = new Float32Array(analyser.fftSize)
  const spectrum = new Uint8Array(analyser.frequencyBinCount)
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize
  const frame: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }

  return autoRange(() => {
    analyser.getFloatTimeDomainData(wave)
    let sum = 0
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i]
    frame.level = levelFromRms(Math.sqrt(sum / wave.length))
    analyser.getByteFrequencyData(spectrum)
    bandsFromBytes(spectrum, hzPerBin, frame)
    return frame
  })
}

const nodeSamplers = new WeakMap<AudioNode, AudioSampler>()

/**
 * Taps any node in an audio graph, e.g. the gain node your agent's playback runs through. The
 * same node always gives the same sampler, so `output={fromNode(gain)}` inline is fine. Connects
 * on first read; `dispose` is safe to call twice, and a disposed sampler that is read again
 * reconnects, so React StrictMode's dispose-then-remount keeps working.
 */
export function fromNode(node: AudioNode): AudioSampler {
  const cached = nodeSamplers.get(node)
  if (cached) return cached
  let analyser: AnalyserNode | null = null
  let read: AudioSampler | null = null
  const sampler: AudioSampler = () => {
    if (!read) {
      analyser = node.context.createAnalyser()
      node.connect(analyser)
      read = fromAnalyser(analyser)
    }
    return read()
  }
  sampler.dispose = () => {
    if (analyser) node.disconnect(analyser)
    analyser = read = null
  }
  nodeSamplers.set(node, sampler)
  return sampler
}

let sharedContext: AudioContext | null = null
const streamSamplers = new WeakMap<MediaStream, AudioSampler>()

/**
 * Analyses a MediaStream, e.g. the microphone or a remote WebRTC track. The same stream always
 * gives the same sampler, so `input={fromStream(mic)}` inline is fine. Reads silence until the
 * stream has an audio track (remote tracks arrive later), and keeps asking the browser to start
 * audio until it is allowed to (autoplay rules want a click first).
 */
export function fromStream(stream: MediaStream, context?: AudioContext): AudioSampler {
  const cached = context ? undefined : streamSamplers.get(stream)
  if (cached) return cached
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let read: AudioSampler | null = null
  let resuming = false
  const sampler: AudioSampler = () => {
    if (!read) {
      if (!stream.getAudioTracks().length) return 0
      ctx = context ?? (sharedContext ??= new AudioContext())
      source = ctx.createMediaStreamSource(stream)
      read = fromNode(source)
    }
    if (ctx!.state === 'suspended' && !resuming) {
      resuming = true
      void ctx!.resume().catch(() => {}).finally(() => (resuming = false))
    }
    return read()
  }
  sampler.dispose = () => {
    read?.dispose?.()
    source?.disconnect()
    source = read = null
  }
  if (!context) streamSamplers.set(stream, sampler)
  return sampler
}
