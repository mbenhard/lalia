export const ORB_STATES = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'muted'] as const
export type OrbState = (typeof ORB_STATES)[number]

export const MOTION_KEYS = [
  'energy',
  'scale',
  'speed',
  'turbulence',
  'swirl',
  'glow',
  'saturation',
  'pulse',
  'input',
  'output',
] as const
export type MotionKey = (typeof MOTION_KEYS)[number]

/**
 * The parameters a state steers. Each one springs toward its target, so any
 * state change is a continuous glide; `input` and `output` fade in ~40 ms
 * instead, so speech is never muted while the look catches up. Values are roughly 0–1.
 *
 * - `energy`      overall liveliness
 * - `scale`       size multiplier
 * - `speed`       flow speed (integrated into a phase, never multiplied by time)
 * - `turbulence`  shape distortion
 * - `swirl`       rotational flow, used for "thinking"
 * - `glow`        brightness of halos and rims
 * - `saturation`  chroma multiplier (0 = grey)
 * - `pulse`       rhythmic breathing, used for "connecting"
 * - `input`       how much microphone audio drives the orb
 * - `output`      how much agent audio drives the orb
 */
export type Motion = Record<MotionKey, number>
export type MotionOverrides = Partial<Record<OrbState, Partial<Motion>>>

export const DEFAULT_MOTION: Record<OrbState, Motion> = {
  idle: {
    energy: 0.3, scale: 1, speed: 0.25, turbulence: 0.3, swirl: 0.05,
    glow: 0.5, saturation: 1, pulse: 0, input: 0, output: 0,
  },
  connecting: {
    energy: 0.4, scale: 0.92, speed: 0.45, turbulence: 0.2, swirl: 0.45,
    glow: 0.4, saturation: 0.75, pulse: 1, input: 0, output: 0,
  },
  listening: {
    energy: 0.55, scale: 1.02, speed: 0.4, turbulence: 0.4, swirl: 0.1,
    glow: 0.7, saturation: 1, pulse: 0, input: 1, output: 0,
  },
  thinking: {
    energy: 0.7, scale: 0.95, speed: 0.75, turbulence: 0.55, swirl: 1,
    glow: 0.6, saturation: 1, pulse: 0, input: 0, output: 0,
  },
  speaking: {
    energy: 0.9, scale: 1.04, speed: 0.6, turbulence: 0.5, swirl: 0.15,
    glow: 0.9, saturation: 1.05, pulse: 0, input: 0, output: 1,
  },
  muted: {
    energy: 0.1, scale: 0.92, speed: 0.1, turbulence: 0.15, swirl: 0,
    glow: 0.2, saturation: 0.15, pulse: 0, input: 0, output: 0,
  },
}

export function resolveMotion(state: OrbState, ...layers: (MotionOverrides | undefined)[]): Motion {
  const motion = { ...DEFAULT_MOTION[state] }
  for (const layer of layers) {
    // An override left undefined keeps the value below it rather than erasing it.
    for (const [key, value] of Object.entries(layer?.[state] ?? {})) if (value !== undefined) motion[key as keyof Motion] = value
  }
  return motion
}
