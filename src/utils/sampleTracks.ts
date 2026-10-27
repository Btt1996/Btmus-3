import { Track } from '../types/music';

// Pure in-browser WAV generator to create real offline audio tracks without network dependencies
export function createToneAudioBlob(options: {
  frequency: number;
  durationSeconds: number;
  type: 'synthwave' | 'chill' | 'ambient';
}): Blob {
  const sampleRate = 44100;
  const numChannels = 2;
  const duration = options.durationSeconds;
  const numSamples = Math.floor(sampleRate * duration);

  const buffer = new ArrayBuffer(44 + numSamples * numChannels * 2);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * numChannels * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * numChannels * 2, true);

  // Synthesis
  let offset = 44;
  const baseFreq = options.frequency;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Smooth envelope attack and release
    let env = 1.0;
    if (t < 0.2) env = t / 0.2;
    else if (t > duration - 0.5) env = Math.max(0, (duration - t) / 0.5);

    let left = 0;
    let right = 0;

    if (options.type === 'synthwave') {
      // Synthwave bass + lead chord
      const bass = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t) * 0.4;
      const lead1 = Math.sin(2 * Math.PI * baseFreq * t) * 0.25;
      const lead2 = Math.sin(2 * Math.PI * (baseFreq * 1.5) * t) * 0.15;
      const lfo = Math.sin(2 * Math.PI * 3 * t) * 0.1;
      left = (bass + lead1 + lfo) * env;
      right = (bass + lead2 - lfo) * env;
    } else if (options.type === 'chill') {
      // Lofi chill chords
      const chord1 = Math.sin(2 * Math.PI * baseFreq * t) * 0.3;
      const chord2 = Math.sin(2 * Math.PI * (baseFreq * 1.25) * t) * 0.25;
      const chord3 = Math.sin(2 * Math.PI * (baseFreq * 1.5) * t) * 0.2;
      const tremolo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 4 * t);
      left = (chord1 + chord2) * tremolo * env;
      right = (chord2 + chord3) * tremolo * env;
    } else {
      // Ambient warm drone
      const drone1 = Math.sin(2 * Math.PI * baseFreq * t) * 0.35;
      const drone2 = Math.sin(2 * Math.PI * (baseFreq * 1.005) * t) * 0.35; // detune chorus
      left = drone1 * env;
      right = drone2 * env;
    }

    // Clamp and convert to 16-bit PCM
    const sampleL = Math.max(-1, Math.min(1, left)) * 0.65;
    const sampleR = Math.max(-1, Math.min(1, right)) * 0.65;

    view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7fff, true);
    view.setInt16(offset + 2, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7fff, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const SAMPLE_AUDIO_PRESETS = [
  {
    title: 'Neon Skyline',
    artist: 'Nightrunner',
    album: 'Telegram Synthwave Vault',
    topic: 'Retro Electro',
    duration: 16,
    frequency: 146.83, // D3
    type: 'synthwave' as const,
    artworkGradient: 'from-fuchsia-600 to-indigo-800',
    iconBg: '#9333ea',
  },
  {
    title: 'Midnight Coffee Lofi',
    artist: 'Aura Bloom',
    album: 'Telegram Chill Beats',
    topic: 'Lofi & Study',
    duration: 20,
    frequency: 220.0, // A3
    type: 'chill' as const,
    artworkGradient: 'from-amber-500 to-rose-700',
    iconBg: '#f59e0b',
  },
  {
    title: 'Solar Wind Ambient',
    artist: 'Deep Resonance',
    album: 'Telegram Ambient Soundscape',
    topic: 'Meditation & Focus',
    duration: 22,
    frequency: 110.0, // A2
    type: 'ambient' as const,
    artworkGradient: 'from-cyan-500 to-blue-800',
    iconBg: '#06b6d4',
  },
];
