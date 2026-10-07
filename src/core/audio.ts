import { clamp01 } from './spring.js'

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

/** Maps RMS amplitude to 0–1 on a decibel scale, which tracks perceived loudness. */
export function levelFromRms(rms: number) {
  const db = 20 * Math.log10(rms + 1e-7)
  return clamp01((db + 60) / 45)
}

export function fromAnalyser(analyser: AnalyserNode): AudioSampler {
  analyser.fftSize = 1024
  analyser.minDecibels = -90
  analyser.maxDecibels = -25
  analyser.smoothingTimeConstant = 0.6
  const wave = new Float32Array(analyser.fftSize)
  const spectrum = new Uint8Array(analyser.frequencyBinCount)
  const hzPerBin = analyser.context.sampleRate / analyser.fftSize
  const frame: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }

  return () => {
    analyser.getFloatTimeDomainData(wave)
    let sum = 0
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i]
    frame.level = levelFromRms(Math.sqrt(sum / wave.length))
    analyser.getByteFrequencyData(spectrum)
    bandsFromBytes(spectrum, hzPerBin, frame)
    return frame
  }
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
