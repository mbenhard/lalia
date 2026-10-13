import { shaderVariant } from '../core/variant.js'

/**
 * How the cloud meets the page.
 * - `wisp`   tendrils peel off and drift outward like smoke
 * - `haze`   a dense heart with a long, breath-like tail
 * - `sphere` held inside a glass ball
 */
type MistEdge = 'wisp' | 'haze' | 'sphere'

const EDGES: Record<MistEdge, number> = { wisp: 1, haze: 2, sphere: 3 }

const fragment = (edge: MistEdge) => /* glsl */ `
const int EDGE = ${EDGES[edge]};
const int WISP = 1, HAZE = 2, SPHERE = 3;
// Where every tail has fully faded, in orb units, so a loud orb never runs into its canvas.
const float LIMIT = 0.92;

// 1 at u = 0 down to exactly 0 at u = 1, flat at both ends with a long, gentle toe, so a fade
// never shows where it starts or where it ends.
float falloff(float u) {
  u = clamp(u, 0.0, 1.0);
  float a = (1.0 - u) * (1.0 - u);
  return a * a * (1.0 + 4.0 * u);
}

vec3 cloud(vec2 q, vec2 s, float detail, out float f) {
  float t = uPhase;
  vec3 sp = vec3(q * 0.9, t * 0.3);
  vec2 w = vec2(fbm2(sp), fbm2(sp + vec3(5.2, 1.3, 2.7)));
  float warp = (0.6 + 0.8 * uTurbulence + 0.8 * uAudio.z) * detail;
  f = fbm(vec3(q + w * warp, t * 0.22 + 3.0));
  float g = fbm2(vec3(q * 1.5 - w * 0.6, t * 0.37 + 7.0));
  vec3 col = mix(uColors[0], uColors[1], smoothstep(-0.7, 0.8, f));
  col = mix(col, uColors[2], 0.8 * smoothstep(-0.45, 0.9, g));
  float lit = dot(s, normalize(vec2(-0.55, 0.8))) + 0.5 * f;
  // The key light falls on the cloud itself; past it, thin cloud lit pale reads as grey smoke.
  col = mix(col, uColors[3], 0.65 * smoothstep(0.25, 1.1, lit) * smoothstep(1.5, 0.9, length(s)));
  col.x += 0.06 * uEnergy * f + 0.08 * uAudio.x;
  return col;
}

void main() {
  vec2 p = orbUV();
  float r = length(p);
  if (r >= 1.0) { fragColor = vec4(0.0); return; }
  vec2 dir = p / max(r, 1e-4);
  float t = uPhase;
  float pulse = orbPulse();
  float R = (EDGE == SPHERE ? 0.56 : 0.48) * uScale
    * (1.0 + (EDGE == SPHERE ? 0.07 : 0.14) * uAudio.y + 0.09 * uAudio.x - 0.06 * pulse);

  vec2 s = p / R;
  float z = sqrt(max(1.0 - dot(s, s), 0.0));
  // Inside the ball, the cloud is wrapped onto a sphere so it reads as depth.
  vec2 base = EDGE == SPHERE ? s * R / (0.65 + 0.35 * z) : p;
  // Loose cloud: detail fades toward the rim, which reads like a blur.
  float detail = EDGE == SPHERE ? 1.0 : mix(1.0, 0.5, smoothstep(0.3 * R, 1.15 * R, r));
  mat2 swirl = rot(uSpin * 0.5 + uSwirl * 1.8 * (1.0 - smoothstep(0.0, R, r)));

  float f;
  vec3 col = cloud(swirl * base, s, detail, f);

  float n = grain();
  float rim = snoise(vec3(dir * 1.1, t * 0.45));
  float edge = R * (1.0 + (0.04 + 0.08 * uTurbulence + 0.12 * uAudio.y) * rim + 0.08 * f);
  float alpha;

  if (EDGE == SPHERE) {
    float fresnel = pow(1.0 - z, 2.0);
    // Fog gathers against the glass, so the rim reads misty and bright.
    col = mix(col, uColors[3], 0.45 * fresnel);
    vec2 h = rot(0.6) * (s - vec2(-0.32, 0.4));
    h *= vec2(2.4, 5.0);
    col.x += 0.12 * exp(-dot(h, h));
    col.x += mix(0.05, -0.08, uLight) * smoothstep(0.8, 1.0, 1.0 - z);
    float d = r - R;
    float body = smoothstep(orbPx(), -orbPx(), d);
    float glow = glowAlpha(0.3 * uGlow * exp(-max(d, 0.0) * 9.0));
    alpha = body + glow * (1.0 - body);
    col = mix(glowTone(col), col, body / max(alpha, 1e-4));
  } else if (EDGE == WISP) {
    // The boundary is a noise threshold scrolling outward, so tendrils peel away and fade.
    // Low-octave noise and a wide threshold keep tendrils soft rather than shredded.
    // Sampling by position (not angle) avoids starburst spikes; scrolling the third axis
    // against radius makes features drift outward.
    float wn = fbm2(vec3(rot(uSpin * 0.3) * p * 1.7, r * 1.6 - t * 0.4));
    // The noise only shifts the boundary, and pushes out further than it bites in, so the heart
    // stays solid while the rim frays.
    float fray = (0.5 + 0.3 * uTurbulence) * wn * (wn > 0.0 ? 1.0 : 0.4);
    float x = (r - edge) / R;
    float density = smoothstep(0.5, -0.3, x - fray);
    density *= density * (3.0 - 2.0 * density) * smoothstep(1.7 * R, 0.8 * R, r);
    // Thin smoke against a dark page reads grey unless it keeps its color, so there it grows
    // richer instead of fading to the pale highlight.
    col = mix(col, uColors[3], 0.35 * uLight * smoothstep(edge, edge + 0.4 * R, r));
    col.yz *= 1.0 + 0.6 * (1.0 - uLight) * (1.0 - density);
    col.x += 0.05 * n * density;
    alpha = density;
    col = mix(glowTone(col), col, smoothstep(0.0, 0.6, density));
  } else {
    // Haze.
    float inner = 0.55 * edge;
    alpha = falloff((r - inner) / (LIMIT - inner)) * (1.0 + 0.08 * n);
    col.x += 0.03 * n * alpha;
    col = mix(glowTone(col), col, smoothstep(0.0, 0.6, alpha));
  }

  fragColor = orbColor(col, alpha);
}
`

const mist = (name: string, edge: MistEdge, colors: readonly string[]) =>
  shaderVariant({ name, colors, fragment: fragment(edge) })

/** Tendrils peel off the cloud and drift outward like smoke. */
export const wisp = mist('wisp', 'wisp', ['#ffb38a', '#ff7a9c', '#b9a3ff', '#fff1e6'])
/** A dense heart with a long, breath-like tail. */
export const haze = mist('haze', 'haze', ['#e665cf', '#8755e6', '#37d2f2', '#ffeee2'])
/** The cloud, held inside a glass ball. */
export const cloud = mist('cloud', 'sphere', ['#84dce0', '#c0abe9', '#f7c790', '#fcfbef'])
