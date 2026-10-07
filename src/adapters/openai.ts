import type { OrbState } from '../core/states.js'

/**
 * Reducer from Realtime server events to an orb state.
 *
 * ```ts
 * dc.onmessage = (e) => setState((s) => openaiRealtimeState(JSON.parse(e.data), s))
 * ```
 *
 * Over WebSocket there are no `output_audio_buffer.*` events; switch to
 * `listening` yourself when your playback queue drains.
 */
export function openaiRealtimeState(event: { type: string }, previous: OrbState): OrbState {
  switch (event.type) {
    case 'session.created':
    case 'input_audio_buffer.speech_started':
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared':
      return 'listening'
    case 'input_audio_buffer.speech_stopped':
    case 'response.created':
      return 'thinking'
    case 'output_audio_buffer.started':
    case 'response.output_audio.delta':
    case 'response.audio.delta':
      return 'speaking'
    case 'response.done':
      // A response with no audio (e.g. a tool call) never reaches "speaking".
      return previous === 'thinking' ? 'listening' : previous
    default:
      return previous
  }
}
