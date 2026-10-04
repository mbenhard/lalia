import type { AudioFrame } from './audio.js'
import { FRAGMENT_PRELUDE, FULLSCREEN_VERTEX, VERTEX_PRELUDE } from './glsl.js'
import { MOTION_KEYS, type Motion, type MotionKey, type MotionOverrides } from './states.js'

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
  /** Per-state tweaks layered over the default motion. */
  motion?: MotionOverrides
  setup(gl: WebGL2RenderingContext): VariantRenderer
}

export interface Program {
  program: WebGLProgram
  uniform(name: string): WebGLUniformLocation | null
}

export function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`[speaking-orb] shader error: ${gl.getShaderInfoLog(shader)}`)
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
    throw new Error(`[speaking-orb] link error: ${gl.getProgramInfoLog(program)}`)
  }
  const locations = new Map<string, WebGLUniformLocation | null>()
  return {
    program,
    uniform(name) {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
      return locations.get(name)!
    },
  }
}

const MOTION_UNIFORMS = MOTION_KEYS.map((key) => [key, `u${key[0]!.toUpperCase()}${key.slice(1)}`]) as [
  MotionKey,
  string,
][]

/** Uploads the standard uniforms declared in `UNIFORMS`. */
export function setOrbUniforms(gl: WebGL2RenderingContext, p: Program, frame: OrbFrame) {
  const { audio } = frame
  gl.uniform2f(p.uniform('uResolution'), frame.width, frame.height)
  gl.uniform1f(p.uniform('uTime'), frame.time)
  gl.uniform1f(p.uniform('uPhase'), frame.phase)
  gl.uniform1f(p.uniform('uSpin'), frame.spin)
  gl.uniform1f(p.uniform('uLight'), frame.light)
  for (const [key, name] of MOTION_UNIFORMS) gl.uniform1f(p.uniform(name), frame.motion[key])
  gl.uniform4f(p.uniform('uAudio'), audio.level, audio.low, audio.mid, audio.high)
  gl.uniform3fv(p.uniform('uColors'), frame.colors)
}

export interface ShaderVariantOptions {
  name: string
  colors: readonly string[]
  motion?: MotionOverrides
  /** Fragment body. `FRAGMENT_PRELUDE` (uniforms, noise, `orbUV`, `orbColor`, …) is prepended. */
  fragment: string
}

/** A variant drawn by a single fullscreen fragment shader. */
export function shaderVariant({ name, colors, motion, fragment }: ShaderVariantOptions): Variant {
  return {
    name,
    colors,
    motion,
    setup(gl) {
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT_PRELUDE + fragment)
      return {
        render(frame) {
          gl.useProgram(program.program)
          setOrbUniforms(gl, program, frame)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
        },
        dispose: () => gl.deleteProgram(program.program),
      }
    },
  }
}

export { FRAGMENT_PRELUDE, VERTEX_PRELUDE }
