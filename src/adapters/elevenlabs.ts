import { autoRange, bandsFromBytes, type AudioFrame, type AudioSampler } from '../core/audio.js'
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
}

const cache = new WeakMap<ElevenLabsConversation, { input: AudioSampler; output: AudioSampler }>()

/**
 * The same conversation always gives the same samplers, so their auto-range carries over when
 * this is called again.
 *
 * ```tsx
 * const conversation = useConversation()
 * const audio = useMemo(() => elevenLabsAudio(conversation), [conversation])
 * <Orb {...audio} state={elevenLabsState(conversation.status, conversation.isSpeaking)} />
 * ```
 */
export function elevenLabsAudio(
  conversation: ElevenLabsConversation,
  { sampleRate = 16000 }: ElevenLabsAudioOptions = {},
): { input: AudioSampler; output: AudioSampler } {
  const cached = cache.get(conversation)
  if (cached) return cached
  const sampler = (volume: () => number, spectrum: () => Uint8Array | undefined): AudioSampler => {
    const frame: AudioFrame = { level: 0, low: 0, mid: 0, high: 0 }
    // The SDK's volume is its own scale, so it is auto-ranged like the built-in samplers. It
    // averages hundreds of bins, smooth enough that a narrower minimum span stays calm.
    return autoRange(() => {
      frame.level = volume()
      const data = spectrum()
      if (data?.length) {
        bandsFromBytes(data, sampleRate / 2 / data.length, frame)
      } else {
        frame.low = frame.mid = frame.high = frame.level
      }
      return frame
    }, 0.1)
  }
  const audio = {
    input: sampler(
      () => conversation.getInputVolume(),
      () => conversation.getInputByteFrequencyData?.(),
    ),
    output: sampler(
      () => conversation.getOutputVolume(),
      () => conversation.getOutputByteFrequencyData?.(),
    ),
  }
  cache.set(conversation, audio)
  return audio
}

export function elevenLabsState(status: string, isSpeaking: boolean): OrbState {
  if (status === 'connecting') return 'connecting'
  if (status !== 'connected') return 'idle'
  return isSpeaking ? 'speaking' : 'listening'
}
