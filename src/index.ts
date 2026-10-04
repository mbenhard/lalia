export { OrbEngine, type OrbOptions } from './core/engine.js'
export { detectLightness, type Appearance } from './core/appearance.js'
export {
  DEFAULT_MOTION,
  MOTION_KEYS,
  ORB_STATES,
  type Motion,
  type MotionKey,
  type MotionOverrides,
  type OrbState,
} from './core/states.js'
export {
  bandsFromBytes,
  fromAnalyser,
  fromNode,
  fromStream,
  levelFromRms,
  type AudioFrame,
  type AudioSampler,
} from './core/audio.js'
export { createVoiceSimulator } from './core/simulator.js'
export { DEFAULT_TRANSITION, type SpringConfig } from './core/spring.js'
export {
  createProgram,
  FRAGMENT_PRELUDE,
  setOrbUniforms,
  shaderVariant,
  VERTEX_PRELUDE,
  type OrbFrame,
  type Program,
  type ShaderVariantOptions,
  type Variant,
  type VariantRenderer,
} from './core/variant.js'
