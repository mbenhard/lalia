export interface SpringConfig {
  stiffness: number
  damping: number
}

/** Slightly underdamped: settles in about a second with a barely visible overshoot. */
export const DEFAULT_TRANSITION: SpringConfig = { stiffness: 28, damping: 9 }

const MAX_STEP = 1 / 120

export class Spring {
  value: number
  target: number
  velocity = 0

  constructor(value: number) {
    this.value = this.target = value
  }

  step(dt: number, { stiffness, damping }: SpringConfig): number {
    // Fixed substeps keep stiff springs stable on slow or uneven frames.
    for (let left = dt; left > 0; left -= MAX_STEP) {
      const h = Math.min(left, MAX_STEP)
      this.velocity += (stiffness * (this.target - this.value) - damping * this.velocity) * h
      this.value += this.velocity * h
    }
    return this.value
  }

  snap() {
    this.value = this.target
    this.velocity = 0
  }
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/** Clamps to 0–1; NaN (a broken sampler, say) becomes 0 instead of poisoning every spring. */
export const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0)
