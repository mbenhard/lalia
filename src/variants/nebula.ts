import { shaderVariant } from '../core/variant.js'
import type { RoleMap } from '../core/scheme.js'
import { volume } from './volume.js'

/**
 * - `cloud` billowing, cauliflower-like volume
 * - `core`  a thin veil around a hot, glowing heart
 */
export type NebulaStyle = 'cloud' | 'core'

const STYLES: Record<NebulaStyle, number> = { cloud: 0, core: 1 }

const medium = (style: NebulaStyle) => /* glsl */ `
const int STYLE = ${STYLES[style]};
const int CLOUD = 0, CORE = 1;

float medium(vec3 pos, out vec3 c) {
  float core = 1.0 - length(pos);
  float t = uPhase;

  vec3 q = pos;
  q.xz = rot(uSpin * 0.6 + t * 0.15) * q.xz;
  q.xy = rot(0.3) * q.xy;
  float n = fbm2(q * (1.2 + 0.4 * uTurbulence) + vec3(0.0, t * 0.25, t * 0.2));

  if (STYLE == CORE) {
    float veil = 0.55 * smoothstep(0.1, 0.8, 0.8 * n + 0.6 * core) * smoothstep(0.0, 0.3, core);
    float heart = exp(-dot(pos, pos) * (16.0 - 7.0 * uAudio.x)) * (1.4 + 1.2 * uAudio.x);
    vec3 veilColor = palette(0.2 * n + 0.4 * (1.0 - core) + t * 0.02);
    vec3 heartColor = vec3(uColors[3].x + 0.1, uColors[3].yz);
    c = mix(veilColor, heartColor, heart / max(veil + heart, 1e-4));
    return veil + heart;
  }

  c = palette(0.18 * n + 0.45 * (1.0 - core) + t * 0.02);
  c.x += 0.18 * core * (0.6 + uAudio.x) + 0.08 * pos.z;
  return smoothstep(0.0, 0.7, 0.7 * n + core * (1.1 + 0.6 * uAudio.y) - 0.25) * smoothstep(0.0, 0.2, core);
}
`

const PALETTES: Record<NebulaStyle, readonly string[]> = {
  cloud: ['#ff9ad5', '#8a7dff', '#5fd4ff', '#ffe1c4'],
  core: ['#ff8fb8', '#7a6bff', '#4cc9ff', '#fff3e0'],
}

// The scheme role behind each color slot, matching how the shader reads it.
const ROLES: RoleMap = ['primary', 'secondary', 'accent', 'highlight']

export function createNebula(style: NebulaStyle = 'cloud', colors?: readonly string[]) {
  return shaderVariant({
    name: style === 'cloud' ? 'nebula' : `nebula-${style}`,
    colors: colors ?? PALETTES[style],
    roles: ROLES,
    fragment: volume(medium(style), 2.2),
  })
}

/** A volumetric cloud raymarched through a sphere: real depth, soft dissolving edge. */
export const nebula = createNebula()
export const nebulaCore = createNebula('core')
