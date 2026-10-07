import type { AudioFrame } from './audio.js'
import { FRAGMENT_PRELUDE, FULLSCREEN_VERTEX } from './glsl.js'
import type { RoleMap } from './scheme.js'
import { MOTION_KEYS, type Motion, type MotionOverrides, type OrbState } from './states.js'

/** Everything a variant needs to draw one frame. Reused across frames; do not keep references. */
export interface OrbFrame {
  /** Drawing buffer size in device pixels. */
  width: number
  height: number
  /** Seconds since start. */
  time: number
  delta: number
  /** Integrated flow speed. Use this, not `time`, for anything that should change pace. */
  phase: number
  /** Integrated swirl. */
  spin: number
  /** Background lightness: 0 on dark pages, 1 on light pages, eased in between. */
  light: number
  /** Syllable attack: jumps toward 1 when speech lands, then fades over ~0.25 s. */
  onset: number
  /** The state being entered. `motion` is already eased toward it; anything else keyed on it should ease too. */
  state: OrbState
  motion: Readonly<Motion>
  /** Smoothed audio, already weighted by state (mic while listening, agent while speaking). */
  audio: Readonly<AudioFrame>
  /** Four OKLab colors, flattened. */
  colors: Float32Array
}

export interface VariantRenderer {
  render(frame: OrbFrame): void
  dispose(): void
}

export interface Variant {
  name: string
  /** Default palette, up to four CSS colors. */
  colors: readonly string[]
  /** The scheme role each color slot plays. Default `['primary', 'secondary', 'accent', 'highlight']`. */
  roles?: RoleMap
  /** Per-state tweaks layered over the default motion. */
  motion?: MotionOverrides
  setup(gl: WebGL2RenderingContext): VariantRenderer
}

function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`[lalia] shader error: ${gl.getShaderInfoLog(shader)}`)
    }
    return shader
  }
  const program = gl.createProgram()
  const vs = compile(gl.VERTEX_SHADER, vertex)
  const fs = compile(gl.FRAGMENT_SHADER, fragment)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`[lalia] link error: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

const MOTION_UNIFORMS = MOTION_KEYS.map((key) => `u${key[0]!.toUpperCase()}${key.slice(1)}`)

/** Looks up the standard uniforms declared in `UNIFORMS` once, and returns a per-frame uploader. */
function orbUniforms(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const at = (name: string) => gl.getUniformLocation(program, name)
  const resolution = at('uResolution')
  const [time, phase, spin, light, onset] = ['uTime', 'uPhase', 'uSpin', 'uLight', 'uOnset'].map(at)
  const motion = MOTION_UNIFORMS.map(at)
  const audio = at('uAudio')
  const colors = at('uColors')
  return (frame: OrbFrame) => {
    gl.uniform2f(resolution, frame.width, frame.height)
    gl.uniform1f(time, frame.time)
    gl.uniform1f(phase, frame.phase)
    gl.uniform1f(spin, frame.spin)
    gl.uniform1f(light, frame.light)
    gl.uniform1f(onset, frame.onset)
    for (let i = 0; i < MOTION_KEYS.length; i++) gl.uniform1f(motion[i], frame.motion[MOTION_KEYS[i]])
    const a = frame.audio
    gl.uniform4f(audio, a.level, a.low, a.mid, a.high)
    gl.uniform3fv(colors, frame.colors)
  }
}

export interface ShaderVariantOptions {
  name: string
  colors: readonly string[]
  roles?: RoleMap
  motion?: MotionOverrides
  /** Fragment body. `FRAGMENT_PRELUDE` (uniforms, noise, `orbUV`, `orbColor`, …) is prepended. */
  fragment: string
}

/** A variant drawn by a single fullscreen fragment shader. */
export function shaderVariant({ name, colors, roles, motion, fragment }: ShaderVariantOptions): Variant {
  return {
    name,
    colors,
    roles,
    motion,
    setup(gl) {
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT_PRELUDE + fragment)
      const upload = orbUniforms(gl, program)
      return {
        render(frame) {
          gl.useProgram(program)
          upload(frame)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
        },
        dispose: () => gl.deleteProgram(program),
      }
    },
  }
}

