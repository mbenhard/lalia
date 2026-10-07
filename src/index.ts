export { OrbEngine, type OrbOptions } from './core/engine.js'
export type { Appearance } from './core/appearance.js'
export {
  DEFAULT_MOTION,
  MOTION_KEYS,
  ORB_STATES,
  type Motion,
  type MotionKey,
  type MotionOverrides,
  type OrbState,
} from './core/states.js'
export { fromNode, fromStream, type AudioFrame, type AudioSampler } from './core/audio.js'
export { createVoiceSimulator } from './core/simulator.js'
export { DEFAULT_TRANSITION, type SpringConfig } from './core/spring.js'
export {
  shaderVariant,
  type OrbFrame,
  type ShaderVariantOptions,
  type Variant,
  type VariantRenderer,
} from './core/variant.js'
