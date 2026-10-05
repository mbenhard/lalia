import { shaderVariant } from '../core/variant.js'

const COLORS = ['#3ddbd9', '#2a7bff', '#9b8cff', '#e8fffb']

type GlassMode = 'clear' | 'frosted' | 'prism'

const MODES: Record<GlassMode, number> = { clear: 0, frosted: 1, prism: 2 }

const fragment = (mode: GlassMode) => /* glsl */ `
const int MODE = ${MODES[mode]};
const int CLEAR = 0, FROSTED = 1, PRISM = 2;

// Four soft color sources, mixed by normalized gaussian weights: a living mesh gradient.
vec3 interior(vec2 uv) {
  float warp = (MODE == FROSTED ? 0.1 : 0.18) * (0.5 + uTurbulence);
  uv += warp * vec2(snoise(vec3(uv * 1.3, uPhase * 0.3)), snoise(vec3(uv * 1.3 + 4.0, uPhase * 0.3)));
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = uPhase * (0.3 + 0.08 * fi) + uSpin * 0.6 + fi * 1.5708;
    vec2 c = vec2(cos(a), sin(a * 1.27 + fi)) * (0.42 + 0.12 * sin(uPhase * 0.4 + fi * 2.0));
    float size = (MODE == FROSTED ? 0.7 : 0.5) + 0.25 * uAudio[i];
    vec2 d = uv - c;
    float w = exp(-dot(d, d) / (size * size));
    acc += uColors[i] * w;
    total += w;
  }
  return acc / (total + 1e-20);
}

// Soft elongated highlight, like a window reflected in a curved surface.
float reflection(vec2 s, vec2 at, float angle, vec2 size) {
  vec2 h = rot(angle) * (s - at) / size;
  return exp(-dot(h, h));
}

vec3 linearToOklab(vec3 c) {
  vec3 lms = pow(max(mat3(
    0.4122214708, 0.2119034982, 0.0883024619,
    0.5363325363, 0.6806995451, 0.2817188376,
    0.0514459929, 0.1073969566, 0.6299787005) * c, 0.0), vec3(1.0 / 3.0));
  return mat3(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}

// A soft arc of focused light at a given radius, facing one direction.
float arc(vec2 s, vec2 facing, float radius, float width) {
  float d = (length(s) - radius) / width;
  return exp(-d * d) * smoothstep(0.3, 1.0, dot(normalize(s + 1e-4), facing));
}

void main() {
  vec2 p = orbUV();
  float r = length(p);
  float px = 2.0 / min(uResolution.x, uResolution.y);
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  vec2 dir = p / max(r, 1e-4);
  float wobble = snoise(vec3(dir, uPhase * 0.5)) * (0.006 + 0.01 * uTurbulence + 0.025 * uAudio.y);
  float R = 0.56 * uScale * (1.0 + 0.06 * uAudio.x - 0.05 * pulse + wobble);

  vec2 s = p / R;
  float z = sqrt(max(1.0 - dot(s, s), 0.0));
  float edge = 1.0 - z;

  // Lens: sampling further out near the rim compresses the interior like a glass ball.
  vec2 lens = s * mix(1.6, 0.9, z);
  vec3 col;
  if (MODE == PRISM) {
    // Dispersion: each channel bends by a slightly different amount, most of all near the rim,
    // so the gradient splits into color fringes. Speech widens the split.
    float split = (0.12 + 0.2 * uAudio.x + 0.12 * uOnset) * (0.2 + 1.3 * edge);
    // Slightly dimmer than plain glass so the caustic and fringes carry the light.
    vec3 lin = 0.75 * vec3(
      oklabToLinear(interior(lens * (1.0 + split))).r,
      oklabToLinear(interior(lens)).g,
      oklabToLinear(interior(lens * (1.0 - split))).b);
    // Caustic: light from the window focuses on the far side as a crescent, red landing
    // furthest out, so it fans into a small rainbow. Speech nudges it around the rim.
    float sway = 0.3 * snoise(vec3(uPhase * 0.3, 2.0, 0.0)) + 0.35 * uAudio.y + 0.25 * uOnset;
    vec2 facing = rot(sway) * vec2(0.6, -0.8);
    float width = 0.09 + 0.03 * uAudio.x;
    lin += (0.2 + 0.15 * uGlow + 0.25 * uAudio.x) * vec3(
      arc(s, facing, 0.74, width), arc(s, facing, 0.66, width), arc(s, facing, 0.58, width));
    col = linearToOklab(lin);
  } else {
    col = interior(lens);
  }
  col.x += 0.05 * uAudio.x + 0.04 * uEnergy;

  // Light gathers along the inside of the rim instead of a flat white edge.
  vec3 caustic = interior(dir * 0.55);
  caustic = vec3(caustic.x + 0.14, caustic.yz * 1.15);
  col = mix(col, caustic, smoothstep(0.45, 1.0, edge) * (0.45 + 0.35 * uGlow));
  col.yz = rot(pow(edge, 3.0) * 0.8) * col.yz;
  if (MODE == PRISM) {
    // Spectral fringe: a rainbow band just inside the rim, its hue running with the angle.
    float band = smoothstep(0.55, 0.85, edge) * smoothstep(1.0, 0.9, edge);
    float hue = edge * 9.0 + atan(s.y, s.x) - uSpin * 0.5;
    col.yz += band * (0.07 + 0.05 * uAudio.x) * vec2(cos(hue), sin(hue));
  }
  // Hairline shell: brighter on dark pages, a touch darker on light ones.
  col.x += mix(0.1, -0.1, uLight) * smoothstep(0.86, 1.0, edge);

  float window = reflection(s, vec2(-0.3, 0.45), 0.6, vec2(0.42, 0.16));
  float bounce = reflection(s, vec2(0.36, -0.58), 0.5, vec2(0.36, 0.12));
  col.x += (MODE == FROSTED ? 0.1 : 0.22) * window + 0.06 * bounce;
  col.yz *= 1.0 - 0.4 * window;
  if (MODE == FROSTED) col.x += 0.05 * grain();

  float d = r - R;
  float body = smoothstep(px, -px, d);
  // Clear glass lets a little of the page through its center.
  body *= MODE == FROSTED ? 1.0 : mix(0.86, 1.0, smoothstep(0.0, 0.6, edge));
  float glow = glowAlpha(0.3 * uGlow * exp(-max(d, 0.0) * 7.0));
  vec3 glowCol = glowTone(caustic);
  float alpha = body + glow * (1.0 - body);
  fragColor = orbColor(mix(glowCol, col, body / max(alpha, 1e-4)), alpha);
}
`

/** A glass sphere refracting a slow mesh gradient. */
export const glass = shaderVariant({ name: 'glass', colors: COLORS, fragment: fragment('clear') })

/** Frosted glass: softer interior, diffused reflections, fine grain. */
export const glassFrosted = shaderVariant({ name: 'glass-frosted', colors: COLORS, fragment: fragment('frosted') })

/** Prism glass: the interior splits into spectral fringes and light pools in a rainbow caustic. */
export const glassPrism = shaderVariant({
  name: 'glass-prism',
  colors: ['#c4b8ff', '#9fd0ff', '#ffb3d6', '#ffeccc'],
  roles: ['primary', 'accent', 'secondary', 'tint'],
  fragment: fragment('prism'),
})
