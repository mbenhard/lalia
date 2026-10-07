'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { OrbEngine, type OrbOptions } from '../core/engine.js'

export interface OrbProps extends OrbOptions {
  /** CSS size of the square canvas. Default 240. */
  size?: number | string
  className?: string
  style?: CSSProperties
  /** Accessible label. Defaults to "Voice assistant, {state}". */
  label?: string
}

export function Orb({
  variant,
  state = 'idle',
  scheme,
  colors,
  input,
  output,
  motion,
  transition,
  appearance,
  maxPixelRatio,
  size = 240,
  className,
  style,
  label,
}: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<OrbEngine | null>(null)
  const colorKey = colors?.join()

  // Created once; the effects below forward prop changes so every change animates.
  useEffect(() => {
    const engine = new OrbEngine(canvasRef.current!, {
      variant, state, scheme, colors, input, output, motion, transition, appearance, maxPixelRatio,
    })
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPixelRatio])

  useEffect(() => {
    engineRef.current?.setVariant(variant)
  }, [variant])
  useEffect(() => {
    engineRef.current?.setState(state)
  }, [state])
  useEffect(() => {
    engineRef.current?.setScheme(scheme)
  }, [scheme])
  useEffect(() => {
    engineRef.current?.setColors(colors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey])
  useEffect(() => {
    engineRef.current?.setInput(input)
  }, [input])
  useEffect(() => {
    engineRef.current?.setOutput(output)
  }, [output])
  useEffect(() => {
    engineRef.current?.setMotion(motion)
  }, [motion])
  useEffect(() => {
    engineRef.current?.setTransition(transition)
  }, [transition])
  useEffect(() => {
    engineRef.current?.setAppearance(appearance)
  }, [appearance])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label ?? `Voice assistant, ${state}`}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
    />
  )
}

export type { OrbState, Variant, AudioSampler } from '../index.js'
export type { ColorScheme } from '../schemes.js'
