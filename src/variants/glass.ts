import { shaderVariant } from '../core/variant.js'

type GlassMode = 'clear' | 'prism'

const MODES: Record<GlassMode, number> = { clear: 0, prism: 2 }

const fragment = (mode: GlassMode) => /* glsl */ `
const int MODE = ${MODES[mode]};
const int CLEAR = 0, PRISM = 2;

// Four soft color sources, mixed by normalized gaussian weights: a living mesh gradient.
// Where they sit depends only on time, so they are placed once per pixel, not once per sample.
vec2 sources[4];
float spread[4];

void placeSources() {
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = uPhase * (0.3 + 0.08 * fi) + uSpin * 0.6 + fi * 1.5708;
    sources[i] = vec2(cos(a), sin(a * 1.27 + fi)) * (0.42 + 0.12 * sin(uPhase * 0.4 + fi * 2.0));
    float size = 0.5 + 0.25 * uAudio[i];
    spread[i] = 1.0 / (size * size);
  }
}

// The slow drift that keeps the gradient from looking like four plain blobs.
vec2 warp(vec2 uv) {
  float amount = 0.18 * (0.5 + uTurbulence);
  return amount * vec2(snoise(vec3(uv * 1.3, uPhase * 0.3)), snoise(vec3(uv * 1.3 + 4.0, uPhase * 0.3)));
}

vec3 mesh(vec2 uv) {
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = uv - sources[i];
    float w = exp(-dot(d, d) * spread[i]);
    acc += uColors[i] * w;
    total += w;
  }
  return acc / (total + 1e-20);
}

vec3 interior(vec2 uv) {
  return mesh(uv + warp(uv));
}

// Soft elongated highlight, like a window reflected in a curved surface.
float reflection(vec2 s, vec2 at, float angle, vec2 size) {
  vec2 h = rot(angle) * (s - at) / size;
  return exp(-dot(h, h));
}

// A soft arc of focused light at a given radius, facing one direction.
float arc(vec2 s, vec2 facing, float radius, float width) {
  float d = (length(s) - radius) / width;
  return exp(-d * d) * smoothstep(0.3, 1.0, dot(normalize(s + 1e-4), facing));
}

// The sphere itself: refracted interior, rim light, fringes and reflections.
vec3 surface(vec2 s, float edge, vec3 caustic) {
  // Lens: sampling further out near the rim compresses the interior like a glass ball.
  vec2 lens = s * mix(1.6, 0.9, 1.0 - edge);
  vec2 w = warp(lens);
  vec3 col;
  if (MODE == PRISM) {
    // Dispersion: each channel bends by a slightly different amount, most of all near the rim,
    // so the gradient splits into color fringes. Speech widens the split. The channels share
    // one warp, so they stay exact scaled copies of each other, as real dispersion would.
    float split = (0.12 + 0.2 * uAudio.x + 0.12 * uOnset) * (0.2 + 1.3 * edge);
    // Slightly dimmer than plain glass so the caustic and fringes carry the light.
    vec3 lin = 0.75 * vec3(
      oklabToLinear(mesh(lens * (1.0 + split) + w)).r,
      oklabToLinear(mesh(lens + w)).g,
      oklabToLinear(mesh(lens * (1.0 - split) + w)).b);
    // Caustic: light from the window focuses on the far side as a crescent, red landing
    // furthest out, so it fans into a small rainbow. Speech nudges it around the rim.
    float sway = 0.3 * snoise(vec3(uPhase * 0.3, 2.0, 0.0)) + 0.35 * uAudio.y + 0.25 * uOnset;
    vec2 facing = rot(sway) * vec2(0.6, -0.8);
    float width = 0.09 + 0.03 * uAudio.x;
    lin += (0.2 + 0.15 * uGlow + 0.25 * uAudio.x) * vec3(
      arc(s, facing, 0.74, width), arc(s, facing, 0.66, width), arc(s, facing, 0.58, width));
    col = linearToOklab(lin);
  } else {
    col = mesh(lens + w);
  }
  col.x += 0.05 * uAudio.x + 0.04 * uEnergy;

  // Light gathers along the inside of the rim instead of a flat white edge.
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
  col.x += 0.22 * window + 0.06 * bounce;
  col.yz *= 1.0 - 0.4 * window;
  return col;
}

void main() {
  vec2 p = orbUV();
  float r = length(p);
  if (r >= 1.0) { fragColor = vec4(0.0); return; }
  placeSources();
  vec2 dir = p / max(r, 1e-4);
  float wobble = snoise(vec3(dir, uPhase * 0.5)) * (0.006 + 0.01 * uTurbulence + 0.025 * uAudio.y);
  float R = 0.56 * uScale * (1.0 + 0.06 * uAudio.x - 0.05 * orbPulse() + wobble);

  vec2 s = p / R;
  float edge = 1.0 - sqrt(max(1.0 - dot(s, s), 0.0));
  float d = r - R;
  // Glass has a hard shell, so nothing spills past it: no outer glow.
  if (d >= orbPx()) { fragColor = vec4(0.0); return; }
  float body = smoothstep(orbPx(), -orbPx(), d);

  vec3 caustic = interior(dir * 0.55);
  caustic = vec3(caustic.x + 0.14, caustic.yz * 1.15);
  vec3 col = surface(s, edge, caustic);

  // Clear glass lets a little of the page through its center.
  body *= mix(0.86, 1.0, smoothstep(0.0, 0.6, edge));
  fragColor = orbColor(col, body);
}
`

/** A glass sphere refracting a slow mesh gradient. */
export const glass = shaderVariant({
  name: 'glass',
  colors: ['#5be9a2', '#01aac6', '#a97cf0', '#e2fff1'],
  fragment: fragment('clear'),
})

/** Prism glass: the interior splits into spectral fringes and light pools in a rainbow caustic. */
export const prism = shaderVariant({
  name: 'prism',
  colors: ['#c4b8ff', '#9fd0ff', '#ffb3d6', '#ffeccc'],
  roles: ['primary', 'accent', 'secondary', 'tint'],
  fragment: fragment('prism'),
})
