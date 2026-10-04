import { detectLightness, type Appearance } from './appearance.js'
import type { AudioFrame, AudioSampler } from './audio.js'
import { PALETTE_SIZE, writePalette } from './color.js'
import { clamp01, damp, DEFAULT_TRANSITION, Spring, type SpringConfig } from './spring.js'
import { MOTION_KEYS, resolveMotion, type Motion, type MotionKey, type MotionOverrides, type OrbState } from './states.js'
import type { OrbFrame, Variant, VariantRenderer } from './variant.js'

export interface OrbOptions {
  variant: Variant
  state?: OrbState
  /** Up to four CSS colors. Defaults to the variant's palette. */
  colors?: readonly string[]
  /** Microphone audio. Drives the orb while listening. */
  input?: AudioSampler | null
  /** Agent audio. Drives the orb while speaking. */
  output?: AudioSampler | null
  /** Per-state motion tweaks, layered over the variant's own. */
  motion?: MotionOverrides
  /** Spring used for every state transition. */
  transition?: Partial<SpringConfig>
  /** Default `auto`: adapts to the background behind the canvas. */
  appearance?: Appearance
  /** Upper bound for devicePixelRatio. Default 2. */
  maxPixelRatio?: number
}

const owners = new WeakMap<HTMLCanvasElement, OrbEngine>()

const ATTACK = 0.03
const RELEASE = 0.2
const COLOR_RATE = 3
const APPEARANCE_RATE = 4
const APPEARANCE_PROBE = 0.5

export class OrbEngine {
  readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext | null
  private variant: Variant
  private renderer: VariantRenderer | null = null
  private current: OrbState
  private overrides: MotionOverrides | undefined
  private transition: SpringConfig
  private input: AudioSampler | null
  private output: AudioSampler | null
  private customColors: readonly string[] | undefined
  private appearance: Appearance
  private lightTarget = 0
  private probeIn = 0
  private readonly maxPixelRatio: number

  private readonly springs = Object.fromEntries(MOTION_KEYS.map((k) => [k, new Spring(0)])) as Record<MotionKey, Spring>
  private readonly motion = {} as Motion
  private readonly sample = new Float32Array(4)
  private readonly inputEnv = new Float32Array(4)
  private readonly outputEnv = new Float32Array(4)
  private readonly audio: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
  private readonly colorTarget = new Float32Array(PALETTE_SIZE * 3)
  private readonly frame: OrbFrame

  private cssWidth = 0
  private cssHeight = 0
  private last = 0
  private raf = 0
  private onScreen = true
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  private readonly resizeObserver: ResizeObserver
  private readonly intersectionObserver: IntersectionObserver

  constructor(canvas: HTMLCanvasElement, options: OrbOptions) {
    this.canvas = canvas
    this.variant = options.variant
    this.current = options.state ?? 'idle'
    this.overrides = options.motion
    this.transition = { ...DEFAULT_TRANSITION, ...options.transition }
    this.input = options.input ?? null
    this.output = options.output ?? null
    this.customColors = options.colors
    this.appearance = options.appearance ?? 'auto'
    this.maxPixelRatio = options.maxPixelRatio ?? 2

    this.frame = {
      width: 1, height: 1, time: 0, delta: 0, phase: 0, spin: 0, light: 0,
      motion: this.motion,
      audio: this.audio,
      colors: new Float32Array(PALETTE_SIZE * 3),
    }
    this.applyMotion(true)
    this.applyColors(true)
    this.probeAppearance()
    this.frame.light = this.lightTarget

    const rect = canvas.getBoundingClientRect()
    this.cssWidth = rect.width
    this.cssHeight = rect.height
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      this.cssWidth = entry.contentRect.width
      this.cssHeight = entry.contentRect.height
    })
    this.resizeObserver.observe(canvas)
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.onScreen = entry?.isIntersecting ?? true
    })
    this.intersectionObserver.observe(canvas)

    this.gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (this.gl) {
      owners.set(canvas, this)
      canvas.addEventListener('webglcontextlost', this.onContextLost)
      canvas.addEventListener('webglcontextrestored', this.onContextRestored)
      // A canvas whose previous orb released its context gets it back here.
      if (this.gl.isContextLost()) this.gl.getExtension('WEBGL_lose_context')?.restoreContext()
      else this.renderer = this.variant.setup(this.gl)
    } else {
      console.warn('[speaking-orb] WebGL2 is not available; the orb will not render.')
    }

    this.raf = requestAnimationFrame(this.tick)
  }

  get state(): OrbState {
    return this.current
  }

  setState(state: OrbState) {
    if (state === this.current) return
    this.current = state
    this.applyMotion()
  }

  setVariant(variant: Variant) {
    if (variant === this.variant) return
    this.variant = variant
    this.renderer?.dispose()
    this.renderer = this.gl && !this.gl.isContextLost() ? variant.setup(this.gl) : null
    this.applyMotion()
    if (!this.customColors) this.applyColors()
  }

  /** Pass `undefined` to return to the variant's palette. Colors always ease, never cut. */
  setColors(colors: readonly string[] | undefined) {
    this.customColors = colors?.length ? colors : undefined
    this.applyColors()
  }

  setInput(sampler: AudioSampler | null | undefined) {
    this.input = sampler ?? null
  }

  setOutput(sampler: AudioSampler | null | undefined) {
    this.output = sampler ?? null
  }

  setMotion(overrides: MotionOverrides | undefined) {
    this.overrides = overrides
    this.applyMotion()
  }

  setAppearance(appearance: Appearance | undefined) {
    this.appearance = appearance ?? 'auto'
    this.probeAppearance()
  }

  setTransition(transition: Partial<SpringConfig> | undefined) {
    this.transition = { ...DEFAULT_TRANSITION, ...transition }
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.intersectionObserver.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.renderer?.dispose()
    this.renderer = null
    if (owners.get(this.canvas) === this) owners.delete(this.canvas)
    // Browsers cap live WebGL contexts (~16 per page) and only free them on GC, so release
    // it explicitly once the canvas is gone. Deferred because a remount on the same canvas
    // (React StrictMode) may claim it in the meantime.
    const { canvas, gl } = this
    setTimeout(() => {
      if (gl && !owners.has(canvas) && !canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext()
    })
  }

  private applyMotion(snap = false) {
    const target = resolveMotion(this.current, this.variant.motion, this.overrides)
    for (const key of MOTION_KEYS) {
      const spring = this.springs[key]
      spring.target = target[key]
      if (snap) spring.snap()
      this.motion[key] = spring.value
    }
  }

  private applyColors(snap = false) {
    writePalette(this.customColors ?? this.variant.colors, this.colorTarget)
    if (snap) this.frame.colors.set(this.colorTarget)
  }

  private probeAppearance() {
    this.probeIn = APPEARANCE_PROBE
    this.lightTarget =
      this.appearance === 'auto' ? detectLightness(this.canvas) : this.appearance === 'light' ? 1 : 0
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 20) : 1 / 60
    this.last = now
    if (!this.onScreen) return
    this.update(dt)
    this.draw()
  }

  private update(dt: number) {
    const { motion: m, audio: a, frame } = this
    for (const key of MOTION_KEYS) m[key] = this.springs[key].step(dt, this.transition)

    this.follow(this.input, this.inputEnv, dt)
    this.follow(this.output, this.outputEnv, dt)
    const wi = Math.max(m.input, 0)
    const wo = Math.max(m.output, 0)
    const mixed = (i: number) => clamp01(this.inputEnv[i] * wi + this.outputEnv[i] * wo)
    a.level = mixed(0)
    a.low = mixed(1)
    a.mid = mixed(2)
    a.high = mixed(3)

    const calm = this.reducedMotion.matches ? 0.35 : 1
    frame.delta = dt
    frame.time += dt
    frame.phase += m.speed * (1 + 0.6 * a.level) * dt * calm
    frame.spin += m.swirl * dt * calm
    // Polled because a theme switch (a class change on <html>) fires no event we can observe cheaply.
    if (this.appearance === 'auto' && (this.probeIn -= dt) <= 0) this.probeAppearance()
    frame.light = damp(frame.light, this.lightTarget, APPEARANCE_RATE, dt)
    for (let i = 0; i < frame.colors.length; i++) {
      frame.colors[i] = damp(frame.colors[i], this.colorTarget[i], COLOR_RATE, dt)
    }
  }

  /** Envelope follower: fast attack so speech lands immediately, slow release so it breathes out. */
  private follow(sampler: AudioSampler | null, env: Float32Array, dt: number) {
    const s = this.sample
    const value = sampler ? sampler() : 0
    if (typeof value === 'number') s.fill(clamp01(value))
    else s.set([value.level, value.low, value.mid, value.high])
    for (let i = 0; i < 4; i++) {
      const tau = s[i] > env[i] ? ATTACK : RELEASE
      env[i] += (s[i] - env[i]) * (1 - Math.exp(-dt / tau))
    }
  }

  private draw() {
    const { gl, canvas, frame } = this
    if (!gl || !this.renderer) return
    const ratio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio)
    const width = Math.max(1, Math.round(this.cssWidth * ratio))
    const height = Math.max(1, Math.round(this.cssHeight * ratio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    frame.width = width
    frame.height = height
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.renderer.render(frame)
  }

  private onContextLost = (event: Event) => {
    event.preventDefault()
    this.renderer = null
  }

  private onContextRestored = () => {
    if (this.gl) this.renderer = this.variant.setup(this.gl)
  }
}
