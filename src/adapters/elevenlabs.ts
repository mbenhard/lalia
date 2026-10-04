import { bandsFromBytes, type AudioFrame, type AudioSampler } from '../core/audio.js'
import type { OrbState } from '../core/states.js'

/**
 * The part of an ElevenLabs conversation the orb reads. Matches both
 * `Conversation` from `@elevenlabs/client` and `useConversation()` from `@elevenlabs/react`.
 */
export interface ElevenLabsConversation {
  getInputVolume(): number
  getOutputVolume(): number
  getInputByteFrequencyData?(): Uint8Array | undefined
  getOutputByteFrequencyData?(): Uint8Array | undefined
}

export interface ElevenLabsAudioOptions {
  /** Sample rate behind the SDK's analysers, used to map bins to speech bands. Default 16000. */
  sampleRate?: number
  gain?: number
}

/**
 * ```tsx
 * const conversation = useConversation()
 * const audio = useMemo(() => elevenLabsAudio(conversation), [conversation])
 * <Orb {...audio} state={elevenLabsState(conversation.status, conversation.isSpeaking)} />
 * ```
 */
export function elevenLabsAudio(
  conversation: ElevenLabsConversation,
  { sampleRate = 16000, gain = 1 }: ElevenLabsAudioOptions = {},
): { input: AudioSampler; output: AudioSampler } {
  const sampler = (volume: () => number, spectrum: () => Uint8Array | undefined): AudioSampler => {
    const frame: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
    return () => {
      frame.level = Math.min(1, volume() * gain)
      const data = spectrum()
      if (data?.length) {
        bandsFromBytes(data, sampleRate / 2 / data.length, frame)
        frame.low = Math.min(1, frame.low * gain)
        frame.mid = Math.min(1, frame.mid * gain)
        frame.high = Math.min(1, frame.high * gain)
      } else {
        frame.low = frame.mid = frame.high = frame.level
      }
      return frame
    }
  }
  return {
    input: sampler(
      () => conversation.getInputVolume(),
      () => conversation.getInputByteFrequencyData?.(),
    ),
    output: sampler(
      () => conversation.getOutputVolume(),
      () => conversation.getOutputByteFrequencyData?.(),
    ),
  }
}

export function elevenLabsState(status: string, isSpeaking: boolean): OrbState {
  if (status === 'connecting') return 'connecting'
  if (status !== 'connected') return 'idle'
  return isSpeaking ? 'speaking' : 'listening'
}
