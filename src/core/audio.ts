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

/** Taps any node in an audio graph, e.g. the gain node your agent's playback runs through. */
export function fromNode(node: AudioNode): AudioSampler {
  const analyser = node.context.createAnalyser()
  node.connect(analyser)
  const sampler: AudioSampler = fromAnalyser(analyser)
  sampler.dispose = () => node.disconnect(analyser)
  return sampler
}

let sharedContext: AudioContext | null = null

/** Analyses a MediaStream, e.g. the microphone or a remote WebRTC track. */
export function fromStream(stream: MediaStream, context?: AudioContext): AudioSampler {
  const ctx = context ?? (sharedContext ??= new AudioContext())
  if (ctx.state === 'suspended') void ctx.resume()
  const source = ctx.createMediaStreamSource(stream)
  const sampler = fromNode(source)
  sampler.dispose = () => source.disconnect()
  return sampler
}
