import { fromNode, fromStream, type AudioSampler } from '../core/audio.js'
import type { OrbState } from '../core/states.js'

export interface GeminiLiveAudioOptions {
  /** Local microphone stream sent to the session. */
  microphone?: MediaStream
  /** The node your PCM playback runs through (e.g. a GainNode before `destination`). */
  playback?: AudioNode
  context?: AudioContext
}

/** Audio samplers for a Gemini Live session. */
export function geminiLiveAudio({ microphone, playback, context }: GeminiLiveAudioOptions) {
  const input: AudioSampler | null = microphone ? fromStream(microphone, context) : null
  const output: AudioSampler | null = playback ? fromNode(playback) : null
  return {
    input,
    output,
    dispose() {
      input?.dispose?.()
      output?.dispose?.()
    },
  }
}

/** The fields of a Live API server message that affect the orb. */
export interface GeminiLiveMessage {
  setupComplete?: unknown
  toolCall?: unknown
  serverContent?: {
    modelTurn?: unknown
    turnComplete?: boolean
    interrupted?: boolean
  }
}

/**
 * Reducer from Live API server messages to an orb state.
 *
 * `turnComplete` arrives when generation ends, while buffered audio may still
 * be playing. For an exact hand-off, switch to `listening` when your playback
 * queue drains instead.
 */
export function geminiLiveState(message: GeminiLiveMessage, previous: OrbState): OrbState {
  if (message.setupComplete) return 'listening'
  if (message.toolCall) return 'thinking'
  const content = message.serverContent
  if (!content) return previous
  if (content.interrupted) return 'listening'
  if (content.modelTurn) return 'speaking'
  if (content.turnComplete) return 'listening'
  return previous
}
