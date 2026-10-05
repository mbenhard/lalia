import { Spring, type SpringConfig } from '../core/spring.js'
import type { OrbState } from '../core/states.js'
import { createProgram, FRAGMENT_PRELUDE, setOrbUniforms, VERTEX_PRELUDE, type Variant } from '../core/variant.js'

export type SwarmShape = 'cloud' | 'sphere' | 'rings'

/** One orbit of particles. Angles in radians. */
export interface RingSpec {
  /** Tilt away from edge-on: 0 is a flat line, π/2 a full circle facing you. */
  tilt: number
  /** Rotation of the ring's ellipse on screen. */
  turn: number
  /** Radius relative to the orb. Default 1. */
  radius?: number
  /** How far the ring's plane wanders over time. Default 0. */
  wander?: number
}

export interface SwarmOptions {
  shape?: SwarmShape
  count?: number
  colors?: readonly string[]
  /** Ring layout for `shape: 'rings'`. */
  rings?: readonly RingSpec[]
  /**
   * Ring layouts for particular states, each with as many rings as `rings`. On a state change
   * the rings glide to the new layout, inner rings leading. States left out use `rings`.
   */
  poses?: Partial<Record<OrbState, readonly RingSpec[]>>
  /** Radius of a particle planet inside the rings, relative to the orb. Default 0 (none). */
  core?: number
  name?: string
}

const SHAPES: Record<SwarmShape, number> = { cloud: 0, sphere: 1, rings: 2 }
const DEFAULT_RINGS: RingSpec[] = [
  { tilt: 0.45, turn: 0 },
  { tilt: 0.65, turn: 2.094 },
  { tilt: 0.85, turn: 4.189 },
]

/** Outer rings are heavier and follow a beat later, so a new layout unfolds from the inside out. */
const ringSpring = (k: number): SpringConfig => {
  const stiffness = 15 / (1 + 0.3 * k)
  return { stiffness, damping: 1.7 * Math.sqrt(stiffness) }
}

const vertex = (shape: SwarmShape, rings: number, core: number) => /* glsl */ `${VERTEX_PRELUDE}
const int SHAPE = ${SHAPES[shape]};
const int RINGS = ${rings};
const float CORE = ${core.toFixed(3)};

uniform vec4 uRings[RINGS]; // tilt, turn, radius, wander

in vec4 aSeed; // xyz: base position, w: ring index + per-particle random in the fraction
out vec3 vColor;
out float vAlpha;

void main() {
  vec3 dir = aSeed.xyz;
  float ring = floor(aSeed.w);
  float rnd = fract(aSeed.w);
  float t = uPhase;
  float pulse = uPulse * (0.5 + 0.5 * sin(uTime * 3.0 + rnd * 6.2831));
  float R = 0.56 * uScale * (1.0 + 0.12 * uAudio.x - 0.22 * pulse);

  bool planet = SHAPE == 2 && int(ring) >= RINGS;
  if (SHAPE == 2 && !planet) {
    // Each ring orbits at its own pace; speech ripples along its length.
    vec4 pose = uRings[int(ring)];
    dir.xz = rot(uSpin * (0.8 + 0.3 * ring) + t * (0.25 + 0.1 * ring)) * dir.xz;
    float along = atan(dir.z, dir.x);
    float ripple = sin(along * 5.0 - t * 6.0 + ring * 2.0) * (0.012 * uTurbulence + 0.05 * uAudio.z);
    float spread = (rnd - 0.5) * (0.035 + 0.05 * uTurbulence + 0.1 * uAudio.y);
    dir *= pose.z * (1.0 + ripple + spread + 0.015 * snoise(dir * 2.0 + t * 0.4));
    // Sway and wander are bounded so a ring always comes back to its pose.
    dir.yz = rot(pose.x + pose.w * 0.35 * sin(t * 0.21 + ring * 1.7)) * dir.yz;
    dir.xy = rot(pose.y + 0.1 * sin(t * 0.08) + pose.w * 0.5 * sin(t * 0.13 + ring * 2.4)) * dir.xy;
  } else {
    // The clean sphere turns rigidly so its lattice stays legible.
    float speed = SHAPE == 0 ? 0.5 + rnd : 1.0;
    dir.xz = rot(uSpin * speed + t * 0.12) * dir.xz;
    dir.yz = rot(0.4) * dir.yz;
    float n = snoise(dir * 1.7 + t * 0.3);
    float wave = sin(dir.y * 6.0 - t * 7.0) * uAudio.z;
    float organic = SHAPE == 0 ? 1.0 : 0.2;
    float shell = (rnd - 0.5) * (0.02 + 0.16 * uTurbulence) * organic;
    dir *= (planet ? CORE : 1.0) * (1.0 + n * (0.04 + 0.12 * uTurbulence + 0.22 * uAudio.y) * organic + 0.07 * wave + shell);
  }

  vec3 pos = dir * R;
  float persp = 2.4 / (2.4 - pos.z);
  float minRes = min(uResolution.x, uResolution.y);
  gl_Position = vec4(pos.xy * persp * minRes / uResolution, 0.0, 1.0);

  float front = clamp(normalize(dir).z * 0.5 + 0.5, 0.0, 1.0);
  float sparkle = 1.0 + 1.2 * uAudio.w * step(0.75, rnd);
  gl_PointSize = max(1.0, minRes * (0.0018 + 0.0032 * front) * persp * sparkle);

  vec3 lab = mix(uColors[1], uColors[0], front);
  lab = mix(lab, uColors[2], 0.6 * smoothstep(-0.2, 1.0, normalize(dir).y));
  lab = mix(lab, uColors[3], step(0.96, rnd));
  lab.x += 0.05 * front + 0.08 * uAudio.x - 0.28 * uLight;
  vColor = lab;
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + 3.0 * rnd) + rnd * 40.0);
  vAlpha = (0.25 + 0.75 * front) * (0.8 + 0.4 * uGlow) * twinkle * (1.0 + 0.6 * uLight);
}
`

const FRAGMENT = /* glsl */ `${FRAGMENT_PRELUDE}
in vec3 vColor;
in float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  fragColor = orbColor(vColor, vAlpha * exp(-d * 3.5) * (1.0 - smoothstep(0.6, 1.0, d)));
}
`

function seeds(shape: SwarmShape, count: number, rings: number, core: number) {
  const data = new Float32Array(count * 4)
  const golden = Math.PI * (3 - Math.sqrt(5))
  // A sphere needs far more points than a line to read as solid, so the planet gets a fixed large share.
  const planet = core > 0 ? Math.round(count * 0.4) : 0
  for (let i = 0; i < count; i++) {
    const rnd = Math.random() * 0.999
    if (i < planet) {
      const y = 1 - (2 * (i + 0.5)) / planet
      const ring = Math.sqrt(1 - y * y)
      data.set([Math.cos(golden * i) * ring, y, Math.sin(golden * i) * ring, rings + rnd], i * 4)
    } else if (shape === 'rings') {
      const angle = Math.random() * Math.PI * 2
      data.set([Math.cos(angle), 0, Math.sin(angle), (i % rings) + rnd], i * 4)
    } else {
      const y = 1 - (2 * (i + 0.5)) / count
      const ring = Math.sqrt(1 - y * y)
      data.set([Math.cos(golden * i) * ring, y, Math.sin(golden * i) * ring, rnd], i * 4)
    }
  }
  return data
}

/** Thousands of glowing points with real depth. */
export function createSwarm({
  shape = 'cloud',
  count = 6000,
  colors,
  rings = DEFAULT_RINGS,
  poses = {},
  core = 0,
  name,
}: SwarmOptions = {}): Variant {
  for (const [state, pose] of Object.entries(poses)) {
    if (pose.length !== rings.length) {
      throw new Error(`[speaking-orb] swarm pose "${state}" has ${pose.length} rings, expected ${rings.length}`)
    }
  }
  return {
    name: name ?? (shape === 'cloud' ? 'swarm' : `swarm-${shape}`),
    colors: colors ?? ['#a5b8ff', '#5b4bff', '#5ff0ff', '#ffffff'],
    // Slot 1 colors the far side, so it takes the shadow role.
    roles: ['primary', 'deep', 'accent', 'highlight'],
    motion: { thinking: { swirl: 1.4, turbulence: 0.7 } },
    setup(gl) {
      const program = createProgram(gl, vertex(shape, rings.length, core), FRAGMENT)
      const vao = gl.createVertexArray()
      const buffer = gl.createBuffer()
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, seeds(shape, count, rings.length, core), gl.STATIC_DRAW)
      const location = gl.getAttribLocation(program.program, 'aSeed')
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0)
      gl.bindVertexArray(null)

      const uRings = program.uniform('uRings')
      const layout = new Float32Array(rings.length * 4)
      const springs = Array.from(layout, () => new Spring(0))
      const configs = rings.map((_, k) => ringSpring(k))
      let first = true

      return {
        render(frame) {
          const pose = poses[frame.state] ?? rings
          pose.forEach(({ tilt, turn, radius = 1, wander = 0 }, k) => {
            const targets = [tilt, turn, radius, wander]
            for (let j = 0; j < 4; j++) {
              const spring = springs[k * 4 + j]!
              spring.target = targets[j]!
              if (first) spring.snap()
              else spring.step(frame.delta, configs[k]!)
              layout[k * 4 + j] = spring.value
            }
          })
          first = false

          gl.useProgram(program.program)
          setOrbUniforms(gl, program, frame)
          gl.uniform4fv(uRings, layout)
          gl.enable(gl.BLEND)
          // Additive glow on dark pages; on light pages added light vanishes, so points layer like ink.
          if (frame.light > 0.5) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
          else gl.blendFunc(gl.ONE, gl.ONE)
          gl.bindVertexArray(vao)
          gl.drawArrays(gl.POINTS, 0, count)
          gl.bindVertexArray(null)
          gl.disable(gl.BLEND)
        },
        dispose() {
          gl.deleteBuffer(buffer)
          gl.deleteVertexArray(vao)
          gl.deleteProgram(program.program)
        },
      }
    },
  }
}

export const swarm = createSwarm()
export const swarmSphere = createSwarm({ shape: 'sphere', count: 4000 })
export const swarmRings = createSwarm({ shape: 'rings', count: 4500 })

/** A particle planet inside concentric bands that share one shallow plane, rising to the right. */
export const swarmSaturn = createSwarm({
  shape: 'rings',
  name: 'swarm-saturn',
  count: 8000,
  core: 0.52,
  rings: [0.86, 1.0, 1.12, 1.24].map((radius) => ({ tilt: 0.32, turn: -0.22, radius })),
})

const orbit = (tilt: number[], turn: number[], radius: number[], wander: number): RingSpec[] =>
  tilt.map((_, k) => ({ tilt: tilt[k]!, turn: turn[k]!, radius: radius[k]!, wander }))

/**
 * Three orbits that rearrange for every state: wandering at rest, folding into one band while
 * connecting, opening into concentric circles to listen, locking into a gimbal to think,
 * fanning out like an atom to speak, and lying down flat when muted.
 */
export const swarmOrbit = createSwarm({
  shape: 'rings',
  name: 'swarm-orbit',
  count: 4500,
  rings: orbit([0.5, 0.95, 1.35], [0, -0.84, 0.96], [0.86, 1, 1.14], 1),
  poses: {
    connecting: orbit([0.5, 0.5, 0.5], [-0.3, -0.3, -0.3], [0.7, 0.95, 1.2], 0.1),
    listening: orbit([1.3, 1.3, 1.3], [0, 0, 0], [0.7, 0.95, 1.2], 0.15),
    thinking: orbit([0.3, 0.3, 1.45], [0, -1.571, 0], [1, 1, 1], 0.35),
    speaking: orbit([0.55, 0.55, 0.55], [0, -1.047, 1.047], [1.06, 1.06, 1.06], 0.2),
    muted: orbit([0.2, 0.2, 0.2], [0, 0, 0], [0.7, 0.88, 1.06], 0),
  },
})
