import { shaderVariant } from '../core/variant.js'

/**
 * - `cloud`  billowing, cauliflower-like volume
 * - `core`   a thin veil around a hot, glowing heart
 * - `galaxy` a tilted spiral disk with a bright bulge
 * - `smoke`  slow, soft fog lit from above
 */
export type NebulaStyle = 'cloud' | 'core' | 'galaxy' | 'smoke'

const STYLES: Record<NebulaStyle, number> = { cloud: 0, core: 1, galaxy: 2, smoke: 3 }

const fragment = (style: NebulaStyle) => /* glsl */ `
const int STYLE = ${STYLES[style]};
const int CLOUD = 0, CORE = 1, GALAXY = 2, SMOKE = 3;
const int STEPS = ${style === 'galaxy' ? 26 : 20};

// Density (unscaled) and color at a point inside the unit sphere.
float medium(vec3 pos, out vec3 c) {
  float core = 1.0 - length(pos);
  float t = uPhase;

  if (STYLE == GALAXY) {
    vec3 g = pos;
    g.yz = rot(1.15) * g.yz;
    g.xz = rot(uSpin * 0.8 + t * 0.25) * g.xz;
    float rad = length(g.xz);
    float arms = 0.5 + 0.5 * cos(2.0 * atan(g.z, g.x) - log(rad + 0.05) * 5.0);
    float n = fbm2(g * 3.0 + t * 0.2);
    float disk = exp(-g.y * g.y * 45.0) * smoothstep(1.0, 0.15, rad);
    float bulge = exp(-dot(g, g) * (18.0 - 6.0 * uAudio.x));
    c = mix(palette(rad * 0.6 + 0.1 * n + t * 0.02), uColors[3], smoothstep(0.05, 0.6, bulge));
    c.x += 0.12 * bulge + 0.1 * uAudio.y * arms;
    return disk * (0.2 + 0.8 * arms * arms) * (0.7 + 0.6 * n) * (1.0 + 0.6 * uAudio.y) + 1.6 * bulge;
  }

  vec3 q = pos;
  q.xz = rot(uSpin * 0.6 + t * 0.15) * q.xz;
  q.xy = rot(0.3) * q.xy;

  if (STYLE == SMOKE) {
    q += 0.35 * vec3(
      snoise(q * 0.9 + vec3(0.0, t * 0.15, 0.0)),
      snoise(q * 0.9 + vec3(7.0, 0.0, t * 0.15)),
      snoise(q * 0.9 + vec3(t * 0.15, 13.0, 0.0)));
    float n = fbm2(q * (0.9 + 0.3 * uTurbulence) + vec3(0.0, t * 0.12, 0.0));
    c = palette(0.15 * n + 0.3 * (1.0 - core) + t * 0.015);
    c = vec3(c.x + 0.16 * pos.y + 0.12 * core * (0.5 + uAudio.x), c.yz * 0.85);
    return 0.7 * smoothstep(-0.2, 0.8, 0.5 * n + core * (1.3 + 0.5 * uAudio.y) - 0.15) * smoothstep(0.0, 0.4, core);
  }

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

void main() {
  vec2 p = orbUV();
  float r = length(p);
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  float R = 0.6 * uScale * (1.0 + 0.08 * uAudio.x + 0.05 * uAudio.y - 0.05 * pulse);
  vec2 s = p / R;
  float d2 = dot(s, s);

  vec3 acc = vec3(0.0);
  float trans = 1.0;
  if (d2 < 1.0) {
    float depth = sqrt(1.0 - d2);
    float stepLen = 2.0 * depth / float(STEPS);
    // A jittered start trades banding for fine, film-rate grain.
    float jitter = grain() + 0.5;
    float strength = (STYLE == SMOKE ? 1.8 : 2.2) + 1.5 * uEnergy;
    for (int i = 0; i < STEPS; i++) {
      vec3 c;
      float density = medium(vec3(s, depth - (float(i) + jitter) * stepLen), c);
      float a = clamp(density * stepLen * strength, 0.0, 1.0);
      acc += trans * a * c;
      trans *= 1.0 - a;
    }
  }

  float alpha = 1.0 - trans;
  vec3 col = acc / max(alpha, 1e-4);
  float haze = glowAlpha(0.16 * uGlow * exp(-max(r - 0.8 * R, 0.0) * 6.0));
  float total = alpha + haze * (1.0 - alpha);
  col = mix(glowTone(palette(0.4 + uPhase * 0.02)), col, alpha / max(total, 1e-4));
  fragColor = orbColor(col, total);
}
`

export function createNebula(style: NebulaStyle = 'cloud', colors?: readonly string[]) {
  const palettes: Record<NebulaStyle, readonly string[]> = {
    cloud: ['#ff9ad5', '#8a7dff', '#5fd4ff', '#ffe1c4'],
    core: ['#ff8fb8', '#7a6bff', '#4cc9ff', '#fff3e0'],
    galaxy: ['#8a7dff', '#ff8fd0', '#5fd4ff', '#fff4e6'],
    smoke: ['#c9b8ff', '#9fb6ff', '#ffc4dc', '#f6f0ff'],
  }
  return shaderVariant({
    name: style === 'cloud' ? 'nebula' : `nebula-${style}`,
    colors: colors ?? palettes[style],
    fragment: fragment(style),
  })
}

/** A volumetric cloud raymarched through a sphere: real depth, soft dissolving edge. */
export const nebula = createNebula()
export const nebulaCore = createNebula('core')
export const nebulaGalaxy = createNebula('galaxy')
export const nebulaSmoke = createNebula('smoke')
