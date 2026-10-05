/**
 * Fragment body that raymarches a medium through a sphere: real depth, soft dissolving edge.
 * `medium` must define `float medium(vec3 pos, out vec3 c)`, returning density and color at a
 * point inside the unit sphere. `strength` scales how quickly the medium turns opaque.
 */
export const volume = (medium: string, strength: number) => /* glsl */ `
const int STEPS = 20;

${medium}

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
    float strength = ${strength.toFixed(2)} + 1.5 * uEnergy;
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
