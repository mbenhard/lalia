import { shaderVariant } from '../core/variant.js'
import type { RoleMap } from '../core/scheme.js'

/**
 * A soft, living tone field printed only as dots.
 * - `hex`    classic hex halftone of a lit sphere: dot size carries the tone
 * - `grille` concentric rings of dots, like a speaker grille; voice ripples along the rings
 * - `matrix` a soft LED matrix with stepped brightness
 */
export type DotsStyle = 'hex' | 'grille' | 'matrix'

/**
 * How the print shows a voice. Every effect pulls in while listening and pushes out while speaking.
 * - `rings`   swells radiate from the center
 * - `eq`      equalizer columns: open from the middle line to speak, fill up from the bottom to listen
 * - `wave`    oscilloscope strands: waves run out from the middle to speak, in toward it to listen
 * - `sparkle` glittering patches: rise while speaking, settle downward while listening
 */
export type DotsVoice = 'rings' | 'eq' | 'wave' | 'sparkle'

const STYLES: Record<DotsStyle, number> = { hex: 0, grille: 1, matrix: 2 }
const VOICES: Record<DotsVoice, number> = { rings: 0, eq: 1, wave: 2, sparkle: 3 }

const fragment = (style: DotsStyle, voice: DotsVoice) => /* glsl */ `
const int STYLE = ${STYLES[style]};
const int HEX = 0, GRILLE = 1, MATRIX = 2;
const int VOICE = ${VOICES[voice]};
const int RINGS = 0, EQ = 1, WAVE = 2, SPARKLE = 3;
// Share of the radial swells kept underneath another voice effect.
const float RADIAL = ${voice !== 'rings' ? '0.3' : style === 'hex' ? '0.7' : '1.0'};
// How far the resting print steps back while the voice effect is up, so the effect reads clearly.
const float RECEDE = ${{ rings: '0.0', eq: '0.55', wave: '0.35', sparkle: '0.45' }[voice]};
// Dot pitch of the hex print, the grille and the matrix, in orb units. The hex print is the
// coarsest, so its dots have room to breathe.
const float HP = 1.12 / 19.0, SP = 1.12 / 22.0, MS = 1.12 / 20.0;
// Largest hex dot as a share of the pitch; below 0.5 neighbors never touch.
const float HEX_DOT = 0.42;

float R, px, breathe;

float sq(float x) { return x * x; }

// |x| with a rounded tip, so waves mirrored about the middle meet smoothly.
float sabs(float x) { return sqrt(x * x + 0.02); }

// Extra presence from the voice effect at a dot centered at c (orb units), s = c / R; h is the dot's random.
float speech(vec2 c, vec2 s, float h) {
  float lvl = uAudio.x;
  if (VOICE == EQ) {
    // Columns are laid on the dot pitch in orb units, so they hold still while the orb breathes.
    // Hex columns are three dots wide with a gap; matrix columns are two LEDs wide, back to back.
    float bw = 2.0 * (STYLE == MATRIX ? MS : STYLE == HEX ? HP : SP);
    float ax = abs(c.x) / bw + (STYLE == MATRIX ? 0.0 : 0.5);
    float k = floor(ax);
    float gap = STYLE == MATRIX ? 1.0 : smoothstep(0.5, 0.34, abs(ax - k - 0.5));
    float bx = (k + (STYLE == MATRIX ? 0.5 : 0.0)) * bw / R;
    // Lows sit in the middle columns, highs toward the sides; each side moves on its own.
    float amp = mix(mix(uAudio.y, uAudio.z, smoothstep(0.0, 0.5, bx)), uAudio.w, smoothstep(0.45, 0.9, bx));
    float life = 0.5 + 0.5 * snoise(vec3(k * 1.7 + sign(c.x) * 9.1, uTime * 3.4, 4.0));
    float H = clamp(amp * (0.25 + 0.95 * life), 0.0, 1.0);
    // Heights are measured against each column's own chord, so the bars fill the round silhouette.
    float chord = sqrt(max(1.0 - bx * bx, 0.05));
    float speak = smoothstep(H + 0.07, H - 0.03, abs(s.y) / chord);
    float listen = smoothstep(H + 0.07, H - 0.03, (s.y / chord + 1.0) * 0.6);
    return (uOutput * speak + uInput * listen) * gap * smoothstep(0.01, 0.06, H) * (0.45 + 0.45 * amp);
  }
  if (VOICE == WAVE) {
    float taper = pow(max(1.0 - s.x * s.x, 0.0), 1.5);
    float glow = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float band = k == 0 ? uAudio.y : k == 1 ? uAudio.z : uAudio.w;
      float A = (0.03 + 0.55 * band) * taper;
      float x = (3.0 + 2.4 * fk) * sabs(s.x) + fk * 2.1;
      float w = (5.0 + 1.7 * fk) * uTime;
      float th = 0.045 + 0.05 * band;
      glow += uOutput * exp(-sq((s.y - A * sin(x - w)) / th))
            + uInput * exp(-sq((s.y - A * sin(x + w)) / th));
    }
    // A calm line shows the orb is attending even before any sound.
    return min(glow, 1.3) * (0.22 + 0.5 * lvl);
  }
  if (VOICE == SPARKLE) {
    // Syllables open new patches; between them only the strongest survive.
    float thr = 0.74 - 0.35 * lvl - 0.3 * uOnset;
    float up = snoise(vec3(s * 2.8 - vec2(0.0, uTime * 0.5), uTime * 0.9));
    float down = snoise(vec3(s * 2.8 + vec2(0.0, uTime * 0.5), uTime * 0.9 + 17.0));
    float spot = uOutput * smoothstep(thr, thr + 0.2, up) + uInput * smoothstep(thr, thr + 0.2, down);
    // Inside a patch each dot flashes on its own beat and fades before the next.
    float beat = uTime * 7.0 + h * 7.0;
    float flash = step(hash12(vec2(h * 113.0, floor(beat))), 0.5) * exp(-2.5 * fract(beat));
    return spot * (0.15 + 0.85 * flash) * smoothstep(0.02, 0.15, lvl) * (0.6 + 0.6 * lvl);
  }
  return 0.0;
}

// The tone field at a dot's center (orb space): presence in ~0..1 and the dot's ink.
// h is a per-dot random for sparkle; extra lets a style add its own voice motion.
float tone(vec2 c, float h, float extra, out vec3 col, out float nz) {
  float t = uPhase;
  vec2 s = c / R;
  float r = length(s);
  float z = sqrt(max(1.0 - r * r, 0.0));
  mat2 spin = rot(uSpin * 0.5);
  nz = fbm2(vec3(spin * s * 1.1, t * 0.2));
  // A low, raking key light gives the print a full ramp from big dots to pinpricks.
  vec3 L = normalize(vec3(spin * vec2(-0.6, 0.65), 0.45));
  float lit = clamp(dot(vec3(s, z), L) * 0.85 + 0.3 + 0.15 * nz, 0.0, 1.0);

  // Resting tone stays below full so voice has headroom to swell into.
  float v = 0.04 + 0.74 * pow(lit, 1.3)
    + (0.06 + 0.08 * uTurbulence) * nz + 0.06 * breathe;
  // Listening: the side facing the viewer leans in and grows.
  v += RADIAL * uInput * (0.08 + 0.5 * uAudio.x) * z * z;
  // Speaking: swells radiate from the center, deeper with the lows.
  float wave = sq(0.5 + 0.5 * sin(r * 11.0 - t * 7.0));
  v += RADIAL * uOutput * uAudio.x * (0.2 + 0.6 * uAudio.y) * (wave - 0.25) + extra;
  // Highs make single dots twinkle, each at its own rate.
  v *= 1.0 + 0.5 * uAudio.w * sin(h * 6.283 + uTime * (4.0 + 6.0 * h));

  float sweep;
  if (STYLE == MATRIX) sweep = exp(-sq((s.y + 1.3 - fract(uTime * 0.4) * 2.6) / 0.12));
  else sweep = pow(0.5 + 0.5 * cos(atan(s.y, s.x) - uTime * 2.6), 6.0);
  v = v * (1.0 - 0.3 * uPulse) + 0.55 * uPulse * sweep;

  // Dots shrink to nothing toward the rim, so the silhouette is soft rather than cut.
  float env = smoothstep(1.1, 0.6, r + 0.1 * nz);
  // Each syllable sends one ring of enlarged dots outward; it rides past the rim as it fades.
  float ring = RADIAL * smoothstep(0.0, 0.3, uOnset) * exp(-sq((r - 1.1 * (1.0 - uOnset)) / 0.07));
  float fx = speech(c, s, h);
  float voiced = clamp(uInput + uOutput, 0.0, 1.0) * smoothstep(0.05, 0.4, uAudio.x);
  v = v * env * (1.0 - RECEDE * voiced) + 0.45 * ring * smoothstep(1.25, 0.9, r) + fx * smoothstep(1.08, 0.85, r);
  v *= mix(0.65, 1.0, smoothstep(0.1, 0.3, uEnergy));

  // On paper the pale palette entries would print as mud, so the inks lean on the deeper ones.
  vec3 hi = mix(uColors[0], uColors[1], 0.5 * uLight);
  vec3 accent = mix(uColors[3], uColors[2], 0.6 * uLight);
  col = mix(uColors[1], hi, smoothstep(0.2, 0.9, lit + 0.2 * nz));
  col = mix(col, uColors[2], 0.55 * smoothstep(0.2, 0.6, -nz - 0.2 * lit + 0.1));
  col = mix(col, accent, 0.5 * (1.0 - uLight) * smoothstep(0.85, 1.0, lit) + 0.6 * ring + 0.5 * clamp(fx, 0.0, 1.0));
  col.x += 0.05 * uAudio.x;
  return v;
}

// Light pages print dots in ink: deeper and richer, never washed-out pastel.
vec3 ink(vec3 col) {
  // Pale inks (white, pastel) sink furthest, so a mono palette prints as charcoal, not fog.
  return mix(col, vec3(col.x * 0.66 - 0.16 * smoothstep(0.7, 1.0, col.x), col.yz * 1.35), uLight);
}

// A round dot with area-correct anti-aliasing: sub-pixel dots fade instead of popping.
float disc(float d, float rad) {
  float rr = max(rad, 0.6 * px);
  return smoothstep(rr + 0.7 * px, rr - 0.7 * px, d) * min(sq(rad / rr), 1.0);
}

// Dark pages: emitted light bleeds a hairline halo; it ends well inside the cell.
float emit(float d, float rad, float sp) {
  float halo = (1.0 - uLight) * 0.2 * uGlow * exp(-max(d - rad, 0.0) / (0.04 * sp))
    * smoothstep(0.48 * sp, 0.4 * sp, d) * smoothstep(0.0, 0.2 * sp, rad);
  return max(disc(d, rad), halo);
}

// One dot at c in the (possibly rotated) grid space q; the field is sampled at fc, where the dot sits on the page.
vec4 halftone(vec2 q, vec2 c, vec2 fc, vec2 id, float sp, float size, float extra) {
  float h = hash12(id + 7.1);
  vec3 col;
  float nz;
  float v = tone(fc, h, extra, col, nz);
  vec2 j = vec2(sin(uTime * 7.0 + h * 40.0), cos(uTime * 6.0 + h * 30.0));
  float d = length(q - c - 0.1 * sp * uAudio.w * j);
  float rad = size * sp * sqrt(clamp(v, 0.0, 1.0));
  return vec4(ink(col), emit(d, rad, sp));
}

void main() {
  vec2 p = orbUV();
  float r = length(p);
  px = 2.0 / min(uResolution.x, uResolution.y);
  float t = uPhase;
  breathe = 0.5 * sin(t * 1.4) + 0.5 * sin(uTime * 0.7);
  R = 0.56 * uScale * (1.0 + 0.03 * breathe + 0.06 * uAudio.y);
  // Spacing is tied to orb space, not pixels, so the print reads the same at any size.
  float sp = STYLE == HEX ? HP : SP;
  vec4 o = vec4(0.0);

  if (STYLE == HEX) {
    mat2 g = rot(uSpin * 0.12);
    vec2 q = g * p;
    vec2 cell = vec2(sp, sp * 1.7320508);
    // A hex lattice is two offset rectangular lattices; the nearer dot of the two wins.
    vec2 ia = floor(q / cell + 0.5);
    vec2 ib = floor(q / cell) + 0.5;
    vec4 a = halftone(q, ia * cell, ia * cell * g, ia, sp, HEX_DOT, 0.0);
    vec4 b = halftone(q, ib * cell, ib * cell * g, ib + 31.7, sp, HEX_DOT, 0.0);
    o = a.a >= b.a ? a : b;
  } else if (STYLE == GRILLE) {
    float ri = floor(r / sp + 0.5);
    float n = max(1.0, floor(6.2831853 * ri + 0.5));
    float arc = 6.2831853 / n;
    // Rings turn at their own pace, alternating direction, so thinking reads as a slow shear.
    float dir = mod(ri, 2.0) * 2.0 - 1.0;
    float off = uSpin * (0.15 + 0.25 * hash12(vec2(ri, 3.0))) * dir + 0.5 * arc * mod(ri, 2.0);
    float j = floor((atan(p.y, p.x) - off) / arc + 0.5);
    float ca = off + j * arc;
    vec2 c = ri * sp * vec2(cos(ca), sin(ca));
    // Voice ripples travel along each ring, offset ring to ring into a slow spiral.
    float ripple = uOutput * uAudio.z * 0.35 * sq(0.5 + 0.5 * sin(ca * 3.0 + ri * 0.7 - t * 6.0));
    o = halftone(p, c, c, vec2(ri, j), sp, 0.5, ripple);
  } else {
    float ms = MS;
    vec2 id = floor(p / ms);
    vec2 c = (id + 0.5) * ms;
    vec3 col;
    float nz;
    float v = tone(c, hash12(id), 0.0, col, nz);
    // Stepped brightness with a soft hand-off between levels, like a dimmed LED.
    float q = clamp(v, 0.0, 1.0) * 4.0;
    float lvl = (floor(q) + smoothstep(0.35, 0.65, fract(q))) / 4.0;
    float hs = ms * (0.3 + 0.05 * lvl);
    float cr = ms * 0.22;
    vec2 e = abs(p - c) - hs + cr;
    float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - cr;
    float led = smoothstep(0.7 * px, -0.7 * px, d);
    // Unlit LEDs stay faintly visible inside the panel.
    float panel = 0.08 * smoothstep(1.15, 0.8, length(c) / R);
    // Each level steps along the palette, like a heat-mapped display.
    // On paper a cool low step reads as a pastel halo, so the ramp starts closer to the main ink.
    col = mix(uColors[2], uColors[1], min(smoothstep(0.15, 0.5, lvl) + 0.6 * uLight, 1.0));
    col = mix(col, mix(uColors[0], uColors[1], 0.5 * uLight), smoothstep(0.5, 0.9, lvl));
    col = mix(col, mix(uColors[3], uColors[2], 0.6 * uLight), 0.7 * smoothstep(1.0, 1.25, v));
    col = mix(vec3(col.x, col.yz * 0.4), col, smoothstep(0.0, 0.3, lvl));
    // On dark pages lit LEDs bloom softly into the gap around them.
    float bloom = (1.0 - uLight) * 0.35 * uGlow * lvl * exp(-max(d, 0.0) / (0.05 * ms));
    // Faint ink reads as pastel on paper, so lit LEDs print at a firmer minimum there.
    float a = mix(lvl, 0.3 + 0.7 * lvl, uLight * smoothstep(0.05, 0.2, lvl));
    o = vec4(ink(col), max(led * max(a, panel), bloom));
  }

  o.rgb.x += 0.03 * grain() * o.a;
  fragColor = orbColor(o.rgb, o.a);
}
`

// The scheme role behind each color slot, matching how the shader reads it.
const ROLES: Record<DotsStyle, RoleMap> = {
  hex: ['primary', 'secondary', 'deep', 'highlight'],
  grille: ['tint', 'primary', 'secondary', 'highlight'],
  matrix: ['tint', 'primary', 'secondary', 'highlight'],
}

export function createDots(style: DotsStyle = 'hex', colors?: readonly string[], voice: DotsVoice = 'rings') {
  const palettes: Record<DotsStyle, readonly string[]> = {
    hex: ['#ffb38a', '#ff6f91', '#7a6cff', '#fff1e6'],
    grille: ['#c9f0ff', '#5fb8ff', '#7c6cff', '#f2fbff'],
    matrix: ['#b9ffe0', '#33e0a1', '#3aa0ff', '#eafff6'],
  }
  const base = style === 'hex' ? 'dots' : `dots-${style}`
  return shaderVariant({
    name: voice === 'rings' ? base : `${base}-${voice}`,
    colors: colors ?? palettes[style],
    roles: ROLES[style],
    fragment: fragment(style, voice),
  })
}

/** Halftone print of a breathing, lit sphere. */
export const dots = createDots()
export const dotsGrille = createDots('grille')
export const dotsMatrix = createDots('matrix')
