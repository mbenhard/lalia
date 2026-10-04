import { shaderVariant } from '../core/variant.js'

const COLORS = ['#3ddbd9', '#2a7bff', '#9b8cff', '#e8fffb']

const fragment = (frosted: boolean) => /* glsl */ `
const bool FROSTED = ${frosted};

// Four soft color sources, mixed by normalized gaussian weights: a living mesh gradient.
vec3 interior(vec2 uv) {
  float warp = (FROSTED ? 0.1 : 0.18) * (0.5 + uTurbulence);
  uv += warp * vec2(snoise(vec3(uv * 1.3, uPhase * 0.3)), snoise(vec3(uv * 1.3 + 4.0, uPhase * 0.3)));
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = uPhase * (0.3 + 0.08 * fi) + uSpin * 0.6 + fi * 1.5708;
    vec2 c = vec2(cos(a), sin(a * 1.27 + fi)) * (0.42 + 0.12 * sin(uPhase * 0.4 + fi * 2.0));
    float size = (FROSTED ? 0.7 : 0.5) + 0.25 * uAudio[i];
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
  vec3 col = interior(s * mix(1.6, 0.9, z));
  col.x += 0.05 * uAudio.x + 0.04 * uEnergy;

  // Light gathers along the inside of the rim instead of a flat white edge.
  vec3 caustic = interior(dir * 0.55);
  caustic = vec3(caustic.x + 0.14, caustic.yz * 1.15);
  col = mix(col, caustic, smoothstep(0.45, 1.0, edge) * (0.45 + 0.35 * uGlow));
  col.yz = rot(pow(edge, 3.0) * 0.8) * col.yz;
  // Hairline shell: brighter on dark pages, a touch darker on light ones.
  col.x += mix(0.1, -0.1, uLight) * smoothstep(0.86, 1.0, edge);

  float window = reflection(s, vec2(-0.3, 0.45), 0.6, vec2(0.42, 0.16));
  float bounce = reflection(s, vec2(0.36, -0.58), 0.5, vec2(0.36, 0.12));
  col.x += (FROSTED ? 0.1 : 0.22) * window + 0.06 * bounce;
  col.yz *= 1.0 - 0.4 * window;
  if (FROSTED) col.x += 0.05 * grain();

  float d = r - R;
  float body = smoothstep(px, -px, d);
  // Clear glass lets a little of the page through its center.
  body *= FROSTED ? 1.0 : mix(0.86, 1.0, smoothstep(0.0, 0.6, edge));
  float glow = glowAlpha(0.3 * uGlow * exp(-max(d, 0.0) * 7.0));
  vec3 glowCol = glowTone(caustic);
  float alpha = body + glow * (1.0 - body);
  fragColor = orbColor(mix(glowCol, col, body / max(alpha, 1e-4)), alpha);
}
`

/** A glass sphere refracting a slow mesh gradient. */
export const glass = shaderVariant({ name: 'glass', colors: COLORS, fragment: fragment(false) })

/** Frosted glass: softer interior, diffused reflections, fine grain. */
export const glassFrosted = shaderVariant({ name: 'glass-frosted', colors: COLORS, fragment: fragment(true) })
