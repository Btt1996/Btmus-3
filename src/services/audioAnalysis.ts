import { TrackAnalysis } from '../types/music';

// ---------------- CAMELOT / KEY DEFINITIONS ----------------
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles for Major and Minor
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const CAMELOT_MAP: Record<string, string> = {
  'Ab minor': '1A', 'B major': '1B',
  'Eb minor': '2A', 'F# major': '2B',
  'Bb minor': '3A', 'Db major': '3B',
  'F minor': '4A', 'Ab major': '4B',
  'C minor': '5A', 'Eb major': '5B',
  'G minor': '6A', 'Bb major': '6B',
  'D minor': '7A', 'F major': '7B',
  'A minor': '8A', 'C major': '8B',
  'E minor': '9A', 'G major': '9B',
  'B minor': '10A', 'D major': '10B',
  'F# minor': '11A', 'A major': '11B',
  'Db minor': '12A', 'E major': '12B',
};

// Aliases for enharmonics
const KEY_ALIASES: Record<string, string> = {
  'G# minor': 'Ab minor',
  'Gb major': 'F# major',
  'D# minor': 'Eb minor',
  'C# major': 'Db major',
  'A# minor': 'Bb minor',
  'G# major': 'Ab major',
  'D# major': 'Eb major',
  'A# major': 'Bb major',
  'C# minor': 'Db minor',
};

/**
 * Perform genuine Web Audio local analysis on an audio Blob.
 * Computes BPM, Musical Key, Camelot code, RMS Energy, Silence trims, and Loudness.
 */
export async function analyzeTrackAudio(blob: Blob, trackId: string): Promise<TrackAnalysis> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  // To keep mobile memory footprint low, read up to first 3MB
  const sliceSize = Math.min(blob.size, 3 * 1024 * 1024);
  const arrayBuffer = await blob.slice(0, sliceSize).arrayBuffer();

  const ctx = new AudioCtx();
  let audioBuffer: AudioBuffer;

  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close().catch(() => {});
  }

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // 1. RMS Energy & Loudness
  const { energy, loudnessDb, introSilence, outroSilence } = calculateEnergyAndSilence(channelData, sampleRate);

  // 2. BPM Estimation
  const bpm = estimateBPM(channelData, sampleRate);

  // 3. Musical Key Estimation
  const { key, camelot } = estimateMusicalKey(channelData, sampleRate);

  const suggestedFadeIn = Math.max(0.5, introSilence);
  const suggestedFadeOut = Math.max(0.5, outroSilence);

  return {
    trackId,
    bpm: Math.round(bpm),
    key,
    camelot,
    energy: parseFloat(energy.toFixed(2)),
    loudnessDb: parseFloat(loudnessDb.toFixed(1)),
    introSilenceDuration: parseFloat(introSilence.toFixed(2)),
    outroSilenceDuration: parseFloat(outroSilence.toFixed(2)),
    suggestedFadeInPoint: parseFloat(suggestedFadeIn.toFixed(2)),
    suggestedFadeOutPoint: parseFloat(suggestedFadeOut.toFixed(2)),
    analyzedAt: Date.now(),
    version: 1,
  };
}

// ---------------- ENERGY, LOUDNESS & SILENCE ----------------

function calculateEnergyAndSilence(data: Float32Array, sampleRate: number) {
  const totalSamples = data.length;
  let sumSquares = 0;
  const silenceThreshold = 0.008; // approx -42dB

  // Calculate overall RMS
  const step = 4;
  let count = 0;
  for (let i = 0; i < totalSamples; i += step) {
    sumSquares += data[i] * data[i];
    count++;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, count));
  const loudnessDb = 20 * Math.log10(rms + 1e-6);
  const energy = Math.min(1.0, Math.max(0.1, (loudnessDb + 45) / 45));

  // Detect intro silence (scanning first 10 seconds)
  let introSamples = 0;
  const maxIntroSamples = Math.min(totalSamples, sampleRate * 10);
  for (let i = 0; i < maxIntroSamples; i += 256) {
    let windowPeak = 0;
    for (let j = 0; j < 256 && i + j < maxIntroSamples; j++) {
      const val = Math.abs(data[i + j]);
      if (val > windowPeak) windowPeak = val;
    }
    if (windowPeak > silenceThreshold) {
      introSamples = i;
      break;
    }
  }
  const introSilence = introSamples / sampleRate;

  // Detect outro silence (scanning last 10 seconds)
  let outroSamples = 0;
  const maxOutroSamples = Math.min(totalSamples, sampleRate * 10);
  for (let i = totalSamples - 1; i > totalSamples - maxOutroSamples; i -= 256) {
    let windowPeak = 0;
    for (let j = 0; j < 256 && i - j >= 0; j++) {
      const val = Math.abs(data[i - j]);
      if (val > windowPeak) windowPeak = val;
    }
    if (windowPeak > silenceThreshold) {
      outroSamples = totalSamples - 1 - i;
      break;
    }
  }
  const outroSilence = outroSamples / sampleRate;

  return { energy, loudnessDb, introSilence, outroSilence };
}

// ---------------- BPM ESTIMATION VIA ONSET PEAK FLUX ----------------

function estimateBPM(data: Float32Array, sampleRate: number): number {
  // Downsample to ~11025 Hz for efficient tempo analysis
  const downsampleRatio = Math.max(1, Math.floor(sampleRate / 11025));
  const targetLen = Math.floor(data.length / downsampleRatio);
  const downsampled = new Float32Array(targetLen);

  for (let i = 0; i < targetLen; i++) {
    downsampled[i] = data[i * downsampleRatio];
  }
  const effectiveSampleRate = sampleRate / downsampleRatio;

  // Window energy envelope (1024 samples ~ 92ms)
  const windowSize = 512;
  const numWindows = Math.floor(downsampled.length / windowSize);
  const energyEnvelope = new Float32Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    let sum = 0;
    const start = w * windowSize;
    for (let i = 0; i < windowSize; i++) {
      const val = downsampled[start + i];
      sum += val * val;
    }
    energyEnvelope[w] = Math.sqrt(sum / windowSize);
  }

  // Energy flux (first derivative / onset detection)
  const flux = new Float32Array(numWindows);
  for (let i = 1; i < numWindows; i++) {
    const diff = energyEnvelope[i] - energyEnvelope[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  // Autocorrelation across BPM range 70 to 180
  const minBpm = 70;
  const maxBpm = 175;
  const envelopeRate = effectiveSampleRate / windowSize;

  const minLag = Math.floor((60 / maxBpm) * envelopeRate);
  const maxLag = Math.floor((60 / minBpm) * envelopeRate);

  let bestLag = 0;
  let maxCorrelation = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < numWindows - lag; i++) {
      corr += flux[i] * flux[i + lag];
    }
    if (corr > maxCorrelation) {
      maxCorrelation = corr;
      bestLag = lag;
    }
  }

  if (bestLag === 0) return 120; // sensible fallback

  let estimatedBpm = (60 * envelopeRate) / bestLag;

  // Normalization if detected double-time or half-time
  if (estimatedBpm < 70) estimatedBpm *= 2;
  if (estimatedBpm > 180) estimatedBpm /= 2;

  return Math.max(65, Math.min(180, estimatedBpm));
}

// ---------------- MUSICAL KEY ESTIMATION (CHROMAGRAM) ----------------

function estimateMusicalKey(data: Float32Array, sampleRate: number): { key: string; camelot: string } {
  // Compute 12-semitone pitch class energy profile
  const chroma = new Float64Array(12);
  const numSamples = Math.min(data.length, sampleRate * 30); // inspect 30 seconds

  // Reference frequencies for standard octaves (C3 to B5, 130Hz - 987Hz)
  const A4 = 440.0;
  for (let i = 0; i < 12; i++) {
    let classEnergy = 0;
    // Check across 3 musical octaves (3, 4, 5)
    for (let octave = 3; octave <= 5; octave++) {
      const midi = (octave + 1) * 12 + i;
      const freq = A4 * Math.pow(2, (midi - 69) / 12);
      const k = Math.round((freq * 2048) / sampleRate);
      if (k > 0 && k < 1024) {
        // Goertzel single-frequency energy extraction
        classEnergy += goertzelEnergy(data, freq, sampleRate, numSamples);
      }
    }
    chroma[i] = classEnergy;
  }

  // Normalize chroma vector
  const chromaMax = Math.max(...Array.from(chroma), 1e-6);
  for (let i = 0; i < 12; i++) {
    chroma[i] /= chromaMax;
  }

  // Correlate with 24 Major & Minor key profiles
  let bestScore = -999;
  let bestKey = 'A minor';

  for (let root = 0; root < 12; root++) {
    // Check Major
    const majorScore = correlation(chroma, MAJOR_PROFILE, root);
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = `${PITCH_CLASSES[root]} major`;
    }

    // Check Minor
    const minorScore = correlation(chroma, MINOR_PROFILE, root);
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = `${PITCH_CLASSES[root]} minor`;
    }
  }

  // Normalize key name to Camelot map
  const normalizedKey = KEY_ALIASES[bestKey] || bestKey;
  const camelot = CAMELOT_MAP[normalizedKey] || CAMELOT_MAP[bestKey] || '8A';

  return { key: bestKey, camelot };
}

function goertzelEnergy(data: Float32Array, targetFreq: number, sampleRate: number, maxSamples: number): number {
  const k = Math.floor(0.5 + (2048 * targetFreq) / sampleRate);
  const w = (2 * Math.PI * k) / 2048;
  const cosW = Math.cos(w);
  const coeff = 2 * cosW;

  let s0 = 0, s1 = 0, s2 = 0;
  const limit = Math.min(data.length, maxSamples, 8192);

  for (let i = 0; i < limit; i++) {
    s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }

  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function correlation(chroma: Float64Array, profile: number[], shift: number): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const profileIdx = (i - shift + 12) % 12;
    sum += chroma[i] * profile[profileIdx];
  }
  return sum;
}

// ---------------- HARMONIC & TEMPO TRANSITION COMPATIBILITY ----------------

export function calculateTransitionCompatibility(
  analysisA?: TrackAnalysis | null,
  analysisB?: TrackAnalysis | null
): { score: number; label: string; harmonicMatch: boolean; tempoDifference: number } {
  if (!analysisA || !analysisB) {
    return { score: 75, label: 'Natural Crossfade', harmonicMatch: false, tempoDifference: 0 };
  }

  const camelotA = analysisA.camelot || '8A';
  const camelotB = analysisB.camelot || '8A';

  const numA = parseInt(camelotA.slice(0, -1), 10);
  const letterA = camelotA.slice(-1);
  const numB = parseInt(camelotB.slice(0, -1), 10);
  const letterB = camelotB.slice(-1);

  let harmonicScore = 50;
  let harmonicMatch = false;

  if (camelotA === camelotB) {
    harmonicScore = 100; // Perfect match
    harmonicMatch = true;
  } else if (Math.abs(numA - numB) === 0 && letterA !== letterB) {
    harmonicScore = 90; // Relative major/minor
    harmonicMatch = true;
  } else if ((Math.abs(numA - numB) === 1 || Math.abs(numA - numB) === 11) && letterA === letterB) {
    harmonicScore = 88; // Adjacent Camelot key (harmonic neighbor)
    harmonicMatch = true;
  } else if ((Math.abs(numA - numB) === 2 || Math.abs(numA - numB) === 10) && letterA === letterB) {
    harmonicScore = 70; // Two steps away
  }

  // Tempo difference
  const bpmDiff = Math.abs(analysisA.bpm - analysisB.bpm);
  const bpmRatio = bpmDiff / Math.max(1, Math.min(analysisA.bpm, analysisB.bpm));
  const tempoScore = Math.max(20, Math.min(100, Math.round(100 - bpmRatio * 250)));

  // Energy step (bonus if smooth, penalty if huge abrupt jump)
  const energyDiff = Math.abs(analysisA.energy - analysisB.energy);
  const energyScore = energyDiff < 0.25 ? 95 : energyDiff < 0.5 ? 80 : 65;

  const totalScore = Math.round(harmonicScore * 0.5 + tempoScore * 0.35 + energyScore * 0.15);

  let label = 'Smooth Transition';
  if (totalScore >= 90) label = 'Harmonic Match ⭐';
  else if (totalScore >= 78) label = 'Compatible Transition';
  else if (totalScore < 60) label = 'Contrasting Transition';

  return {
    score: totalScore,
    label,
    harmonicMatch,
    tempoDifference: Math.round(bpmDiff),
  };
}

// ---------------- SMART ORDER PLAYLIST OPTIMIZER ----------------

export function optimizePlaylistOrder(
  trackIds: string[],
  analysisMap: Record<string, TrackAnalysis>
): { optimizedTrackIds: string[]; averageScore: number } {
  if (trackIds.length <= 2) {
    return { optimizedTrackIds: trackIds, averageScore: 85 };
  }

  // Greedy Nearest-Neighbor Harmonic & BPM Path
  const remaining = [...trackIds];
  const ordered: string[] = [remaining.shift()!];
  let totalScore = 0;

  while (remaining.length > 0) {
    const currentId = ordered[ordered.length - 1];
    const currentAnalysis = analysisMap[currentId];

    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < remaining.length; i++) {
      const candidateId = remaining[i];
      const candidateAnalysis = analysisMap[candidateId];
      const { score } = calculateTransitionCompatibility(currentAnalysis, candidateAnalysis);

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    totalScore += bestScore > 0 ? bestScore : 70;
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  const averageScore = Math.round(totalScore / (ordered.length - 1));
  return { optimizedTrackIds: ordered, averageScore };
}
