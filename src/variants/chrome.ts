import type { RoleMap } from '../core/scheme.js'
import { shaderVariant } from '../core/variant.js'

/**
 * Chrome: liquid metal in a soft, abstract room. Small, busy pools of light with thin dark lines,
 * every edge split into a rainbow as the metal disperses it, and the voice bends the reflection.
 */
const fragment = /* glsl */ `
// How far in from the edge the surface rounds over, as a share of the radius.
const float DEPTH = 0.75;
// How strongly the middle of the body bulges toward the rim.
const float TILT = 0.3;
// Size of the light pools: lower is broader.
const float SCALE = 0.75;
// Width of the dark line around each pool.
const float LINE = 0.6;
// How far the wavelengths fan apart at each edge.
const float SPREAD = 3.2;

// The normal of an outline inflated off the page. d is the signed distance (negative inside)
// and g its gradient; the surface rises like a sphere of radius depth from its edge, so a circle
// of that radius becomes exactly a sphere and a thin spike becomes a rounded ridge.
vec3 inflate(float d, vec2 g, float depth) {
  float u = clamp(-d / depth, 0.0, 1.0);
  return normalize(vec3((1.0 - u) * g, sqrt(u * (2.0 - u)) + 1e-4));
}

// Tilts a normal by a height field's gradient, fading it out toward the silhouette so
// ripples never shimmer along the edge.
vec3 perturb(vec3 n, vec2 slope) {
  return normalize(n - vec3(slope * n.z, 0.0));
}

// The view ray reflected off a surface facing n. The viewer looks down -z; y is up.
vec3 mirror(vec3 n) {
  return vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
}

float R0;
// A ringing drop's two lowest modes: it swings between an oval (2) and a rounded triangle (3).
float mode2, mode3, turn2, turn3;

float shape(vec2 p) {
  float a = atan(p.y, p.x);
  return length(p) - R0 * (1.0 + mode2 * cos(2.0 * (a - turn2)) + mode3 * cos(3.0 * (a - turn3)));
}

// Surface height, in units of the body's radius: two slow swells crossing, gently rocking it.
float height(vec2 s) {
  return 0.01 * sin(dot(s, vec2(2.6, 1.4)) + uPhase * 1.4) + 0.008 * sin(dot(s, vec2(-1.8, 2.5)) - uPhase * 1.1);
}

// Chrome stays mostly neutral: the scheme lends its hue to the shade and only a whisper of it
// to the lit metal, so any brand color sits on the surface without repainting it.
vec3 shade(vec3 c, float keep) {
  return mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, keep);
}

// The room's four tones, in linear light: ink, primary, tint, highlight.
vec3 tone[4];

vec3 ramp(float i) {
  vec3 c = mix(tone[0], tone[1], smoothstep(0.0, 0.45, i));
  c = mix(c, tone[2], smoothstep(0.45, 0.8, i));
  return mix(c, tone[3], smoothstep(0.8, 1.0, i));
}

// Directions laid out as a mirror ball sees them: the angle from the viewer, spread flat, so the
// whole sphere maps to one disk with no fold. atan rather than acos keeps it exact facing on.
vec2 ball(vec3 r) {
  float l = length(r.xy);
  return r.xy / max(l, 1e-6) * atan(l, r.z);
}

// How bright the metal is where the field reads f. Low ground is a soft navy-to-white gradient;
// above a level the light pools, hard-edged and rimmed with a thin dark line, and the highest
// ground has a dark core. The gradient reads f0 and the edges read f, so a channel can shift its
// edges (and only its edges) to fringe them.
float sheen(float f0, float f, float w, float lift, float line) {
  float i = 0.93 * smoothstep(-0.85, 0.05, f0);
  float l1 = 0.08 - lift, l2 = 0.58 - lift;
  i = mix(i, 1.0, smoothstep(l1 - w, l1 + w, f));
  i *= 1.0 - 0.96 * smoothstep(line + w, line - 0.015, abs(f - l1));
  return mix(i, 0.04, smoothstep(l2 - w, l2 + w, f));
}

// How much of each channel a wavelength carries, from red (0) to violet (1).
vec3 spectrum(float x) {
  return clamp(1.0 - abs(x - vec3(0.12, 0.5, 0.88)) / 0.38, 0.0, 1.0);
}

void main() {
  vec2 p = orbUV();
  if (length(p) >= 1.0) { fragColor = vec4(0.0); return; }
  float R = 0.5 * uScale * (1.0 + 0.06 * uAudio.x - 0.05 * orbPulse());

  // Every syllable strikes the body: it rings as an oval whose swing dies with the attack.
  mode2 = (0.012 + 0.02 * uTurbulence + 0.035 * uAudio.y + 0.05 * uOnset * cos(uTime * 15.0));
  mode3 = (0.006 + 0.025 * uAudio.z);
  turn2 = uPhase * 0.6 + uSpin;
  turn3 = -uPhase * 0.45;
  R0 = R;
  // Less than the radius leaves the top gently flattened, like a pillow, and flat ground
  // stretches reflections into wide bands.
  float depth = DEPTH * R;

  float d = shape(p);
  vec2 e = vec2(0.0015, 0.0);
  vec2 g = vec2(shape(p + e.xy) - shape(p - e.xy), shape(p + e.yx) - shape(p - e.yx)) / (2.0 * e.x);
  // The outline is only distance-like; dividing by the slope makes it a true distance near the
  // edge, which is where the rounding happens.
  // Only near it, though: deep inside a polar outline the slope is meaningless at the center.
  float slope = mix(max(length(g), 1e-4), 1.0, smoothstep(0.2 * R, 0.45 * R, abs(d)));
  d /= slope;
  vec3 n = inflate(d, g / max(length(g), 1e-4), depth);
  vec2 s = p / R0;
  n = normalize(vec3(n.xy + TILT * s * n.z, n.z));
  vec2 f = vec2(0.004, 0.0);
  float h = height(s);
  n = perturb(n, vec2(height(s + f.xy) - h, height(s + f.yx) - h) / f.x);

  for (int i = 0; i < 4; i++) tone[i] = max(oklabToLinear(uColors[3 - i]), 0.0);
  tone[1] = shade(tone[1], 0.3);
  tone[2] = shade(tone[2], 0.2);
  vec3 r = mirror(n);
  // The field lies across the body and bends with the surface: flat ground carries it smoothly,
  // and where the metal rounds over, its reflection squeezes the field into tight bands.
  vec2 b = ball(r);
  vec2 u = rot(0.3 * uSpin) * (0.5 * s + 0.32 * b);
  // The voice bends the reflection field itself, so speech liquefies the bands.
  float amp = (0.04 + 0.28 * uAudio.x + 0.12 * uOnset);
  u += amp * vec2(snoise(vec3(s * 1.7, uTime * 0.6)), snoise(vec3(s * 1.7 + 4.7, uTime * 0.6 + 2.0)));
  float t = uPhase * 0.06;
  // Plus a little light from above, so the rounded edges catch it and the form reads.
  float F = 0.85 * snoise(vec3(u * SCALE + vec2(0.0, -2.0 * t), t))
    + 0.12 * snoise(vec3(u * (SCALE * 2.36) + 3.1, 1.4 * t + 4.0)) + 0.14 * b.y;
  float w = min(fwidth(F), 0.08) + 0.006;
  // Louder speech pools more light and spreads its rainbow wider.
  float lift = 0.08 * uAudio.x + 0.06 * uOnset;
  // Where the field barely changes, a fixed width in the field would cover half the body, so the
  // line is also kept within a small share of the body's size on screen.
  float rate = fwidth(F) / orbPx();
  float line = LINE * min(0.06 + 0.02 * uAudio.x + 0.015 * uOnset, 0.035 * R0 * rate + 0.01);
  // Each wavelength meets the edges at a slightly different level, so a dark line fans out into
  // rainbow bands: wide where the field changes slowly, thin where it changes fast.
  float spread = SPREAD * line;
  vec3 lin = vec3(0.0), sum = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float x = float(i) * 0.25;
    vec3 k = spectrum(x);
    lin += k * ramp(sheen(F, F + (x - 0.5) * spread, w, lift, line));
    sum += k;
  }
  lin /= sum;
  // Toward the silhouette the metal mirrors the page behind it.
  vec3 page = mix(tone[0] * 0.6, vec3(0.86), uLight);
  lin = mix(lin, page, 0.85 * smoothstep(-0.4, -0.9, r.z));
  vec3 col = linearToOklab(lin);

  float body = smoothstep(orbPx(), -orbPx(), d);
  float glow = glowAlpha(0.18 * uGlow * exp(-max(d, 0.0) * 9.0));
  fragColor = orbComposite(col, body, glowTone(uColors[1]), glow);
}
`

// Slots: highlight, tint, primary, ink. The room ramps from ink through primary and tint to the
// highlight, so a brand color tints the metal's mid-tones.
const ROLES: RoleMap = ['highlight', 'tint', 'primary', 'ink']

export const chrome = shaderVariant({
  name: 'chrome',
  colors: ['#ffffff', '#d6d8e0', '#7a7f92', '#161a33'],
  roles: ROLES,
  fragment,
})
