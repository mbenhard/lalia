import type { RoleMap } from '../core/scheme.js'
import { shaderVariant } from '../core/variant.js'

// All four slots form one looping gradient, so they should be neighbors of similar weight.
const SILK_ROLES: RoleMap = ['primary', 'secondary', 'accent', 'tint']

interface SilkTuning {
  /** How far colors may stray from the palette average (1 = full palette). */
  spread: number
  /** Palette distance covered per fold. */
  travel: number
  /** Light and shade across each fold. */
  sheen: number
  /** Thin-film hue shift at the rim, in radians. */
  iridescence: number
  /** Scale and warp of the flow field; lower is simpler and broader. Default 1. */
  detail?: number
}

const fragment = ({ spread, travel, sheen, iridescence, detail = 1 }: SilkTuning) => /* glsl */ `
const float SPREAD = ${spread.toFixed(3)};
const float TRAVEL = ${travel.toFixed(3)};
const float SHEEN = ${sheen.toFixed(3)};
const float IRIDESCENCE = ${iridescence.toFixed(3)};
const float DETAIL = ${detail.toFixed(3)};

void main() {
  vec2 p = orbUV();
  float r = length(p);
  float px = 2.0 / min(uResolution.x, uResolution.y);
  float t = uPhase * 0.5;
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  vec2 dir = p / max(r, 1e-4);
  float wobble = snoise(vec3(dir * 1.2, uPhase * 0.6)) * (0.01 + 0.02 * uTurbulence + 0.05 * uAudio.y);
  float R = 0.58 * uScale * (1.0 + 0.07 * uAudio.x - 0.05 * pulse + wobble);

  vec2 s = p / R;
  float z = sqrt(max(1.0 - dot(s, s), 0.0));
  vec3 nrm = vec3(s, z);
  // Dividing by depth foreshortens the pattern toward the limb, which sells the sphere.
  vec2 uv = rot(uSpin * 0.4) * (s / (0.6 + 0.4 * z));

  vec3 sp = vec3(uv * 0.5 * DETAIL, t * 0.6);
  vec2 q = vec2(fbm2(sp), fbm2(sp + vec3(3.1, 7.4, 1.7)));
  float f = fbm2(sp + vec3(q * (0.8 + 0.7 * uTurbulence + 0.7 * uAudio.z) * DETAIL, 0.0));

  // Broad diagonal folds, bent by the flow field.
  float bands = 0.8 * uv.y + 0.35 * uv.x + f * (1.1 + 0.5 * uEnergy) * DETAIL + t * 0.15;
  vec3 mean = 0.25 * (uColors[0] + uColors[1] + uColors[2] + uColors[3]);
  vec3 col = mix(mean, palette(bands * TRAVEL), SPREAD);
  float crest = pow(0.5 + 0.5 * cos(bands * 6.28318), 3.0);
  float fresnel = pow(1.0 - z, 2.5);
  // Rotating OKLab chroma is a hue shift: thin-film color at grazing angles.
  col.yz = rot(fresnel * IRIDESCENCE + crest * 0.25 * IRIDESCENCE) * col.yz;
  col.x += (crest - 0.5) * (SHEEN + 0.1 * uAudio.x) * z + fresnel * 0.12 * uGlow * (1.0 - uLight);

  vec3 L = normalize(vec3(-0.45, 0.65, 0.75));
  float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
  col.x += 0.14 * spec;
  col.yz *= 1.0 - 0.4 * spec;

  float d = r - R;
  float body = smoothstep(px, -px, d);
  float glow = glowAlpha(0.35 * uGlow * exp(-max(d, 0.0) * 12.0));
  vec3 glowCol = glowTone(mix(mean, palette(t * 0.2 + atan(p.y, p.x) / 6.28318), SPREAD));
  float alpha = body + glow * (1.0 - body);
  fragColor = orbColor(mix(glowCol, col, body / max(alpha, 1e-4)), alpha);
}
`

/** Soft satin folds in close, harmonious tones. */
export const silk = shaderVariant({
  name: 'silk',
  colors: ['#8fb4ff', '#a99bff', '#c6b0ff', '#b8e0ff'],
  roles: SILK_ROLES,
  fragment: fragment({ spread: 0.7, travel: 0.3, sheen: 0.09, iridescence: 0.6 }),
})

/** Fewer, broader folds: one slow ripple of satin. */
export const silkSimple = shaderVariant({
  name: 'silk-simple',
  colors: ['#8fb4ff', '#a99bff', '#c6b0ff', '#b8e0ff'],
  roles: SILK_ROLES,
  fragment: fragment({ spread: 0.65, travel: 0.25, sheen: 0.08, iridescence: 0.5, detail: 0.55 }),
})
