import type { AudioFrame, AudioSampler } from './audio.js'
import { damp } from './spring.js'

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A speech-like envelope (syllables, word gaps, phrase pauses) for demos and
 * design work without a live agent.
 */
export function createVoiceSimulator(seed = 1): AudioSampler {
  const rand = random(seed)
  const frame: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
  let last = performance.now()
  let until = 0
  let target = 0
  let env = 0
  let syllables = 0
  let voiced = false

  return () => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now

    if (now >= until) {
      if (syllables <= 0) {
        target = 0
        until = now + 350 + rand() * 750
        syllables = 4 + Math.floor(rand() * 14)
      } else if (voiced) {
        target = rand() < 0.25 ? 0.02 : 0.18
        until = now + 40 + rand() * (target < 0.1 ? 160 : 60)
        voiced = false
      } else {
        target = 0.45 + rand() * 0.55
        until = now + 80 + rand() * 170
        voiced = true
        syllables--
      }
    }

    env = damp(env, target, target > env ? 38 : 13, dt)
    const t = now / 1000
    frame.level = env
    frame.low = env * (0.75 + 0.25 * Math.sin(t * 5.1))
    frame.mid = env * (0.55 + 0.45 * Math.sin(t * 8.3 + 1.7))
    frame.high = env * (0.25 + 0.75 * Math.max(0, Math.sin(t * 13.7 + 0.4)) ** 3)
    return frame
  }
}
