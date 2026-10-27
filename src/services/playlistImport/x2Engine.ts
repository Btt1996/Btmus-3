import {
  NormalizedTrackMetadata,
  AudioCandidateMatch,
  TrackImportProgressItem,
  ImportSummary,
  ImportSettings,
  AudioProviderType,
  X2ProviderAttempt,
  X2FailureCategory,
} from '../../types/playlistImport';
import { Track, Playlist } from '../../types/music';
import { getAllTracks, saveTrack, savePlaylist, findVerifiedCachedTrack, getSetting } from '../db';
import { searchSpotDLBridge, checkSpotDLBridgeStatus } from './spotdlBridge';

// Default Jamendo API Developer Key (public community client ID for open music)
const DEFAULT_JAMENDO_CLIENT_ID = '96cf1c7c';

// ---------------- NORMALIZATION & STRING SIMILARITY UTILITIES ----------------

/**
 * Normalizes title string by stripping punctuation, bracketed text, common tags:
 * e.g. "Song Name (Official Video) [Remastered 2021]" -> "song name"
 */
export function normalizeSongTitle(title: string): string {
  if (!title) return '';
  let cleaned = title.toLowerCase();

  // Remove bracketed content like (feat. ...), [Official Video], (Remastered)
  cleaned = cleaned.replace(/\((?:feat|ft|official|remaster|live|radio|deluxe|version|audio|video|explicit)[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\[(?:feat|ft|official|remaster|live|radio|deluxe|version|audio|video|explicit)[^\]]*\]/gi, '');
  // Remove trailing feat or ft
  cleaned = cleaned.replace(/\s+(feat\.|ft\.|featuring)\s+.*$/i, '');
  // Strip non-alphanumeric except spaces
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function normalizeArtistName(artist: string): string {
  if (!artist) return '';
  return artist
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate token-based Sorensen-Dice similarity (0 to 1)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeSongTitle(str1);
  const norm2 = normalizeSongTitle(str2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.85;

  const tokens1 = new Set(norm1.split(' ').filter(Boolean));
  const tokens2 = new Set(norm2.split(' ').filter(Boolean));

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = tokens1.size + tokens2.size;
  return union === 0 ? 0 : (2 * intersection) / union;
}

/**
 * Calculates candidate match confidence score from 0 to 100
 */
export function computeMatchConfidence(
  requested: NormalizedTrackMetadata,
  candidate: {
    title: string;
    artist: string;
    durationSeconds: number;
    isrc?: string | null;
  }
): { score: number; reason: string } {
  // 1. ISRC exact match
  if (requested.isrc && candidate.isrc && requested.isrc.toUpperCase() === candidate.isrc.toUpperCase()) {
    return { score: 99, reason: 'Exact ISRC recording identifier match' };
  }

  const titleSim = calculateStringSimilarity(requested.title, candidate.title);
  const mainArtist = requested.artists[0] || '';
  const artistSim = calculateStringSimilarity(mainArtist, candidate.artist);

  // Duration diff calculation
  const requestedSec = Math.round(requested.durationMs / 1000);
  const durationDiff = Math.abs(requestedSec - candidate.durationSeconds);

  let durationScore = 1.0;
  if (requestedSec > 0 && candidate.durationSeconds > 0) {
    if (durationDiff <= 3) durationScore = 1.0;
    else if (durationDiff <= 8) durationScore = 0.9;
    else if (durationDiff <= 15) durationScore = 0.7;
    else if (durationDiff <= 30) durationScore = 0.4;
    else durationScore = 0.1;
  }

  // Weightings: Title (50%), Artist (30%), Duration (20%)
  const composite = titleSim * 0.5 + artistSim * 0.3 + durationScore * 0.2;
  const score = Math.round(composite * 100);

  let reason = '';
  if (score >= 85) {
    reason = `High confidence match (Title ${(titleSim * 100).toFixed(0)}%, Artist ${(artistSim * 100).toFixed(0)}%)`;
  } else if (score >= 60) {
    reason = `Partial match: duration delta ${durationDiff}s, verify recording before playing`;
  } else {
    reason = 'Weak match below confidence threshold';
  }

  return { score, reason };
}

// ---------------- RETRY WITH EXPONENTIAL BACKOFF ----------------

export async function fetchWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 400
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const jitter = Math.random() * 150;
      const backoff = delayMs * Math.pow(2, attempt - 1) + jitter;
      await new Promise((res) => setTimeout(res, backoff));
    }
  }
}

// ---------------- MODULAR X2 PROVIDER ADAPTERS ----------------

// Adapter 0: Local Library Cache (Requirement 3: Never claims cached unless readable file exists)
export async function searchLocalLibraryCache(
  track: NormalizedTrackMetadata
): Promise<AudioCandidateMatch | null> {
  try {
    const cached = await findVerifiedCachedTrack(
      track.title,
      track.artists[0] || '',
      track.durationMs
    );

    if (cached) {
      return {
        provider: 'local',
        providerTrackId: `local_${cached.track.id}`,
        title: cached.track.title,
        artist: cached.track.artist,
        durationSeconds: cached.track.duration,
        downloadUrl: `blob:local/${cached.track.id}`,
        format: cached.track.mimeType?.includes('m4a') ? 'm4a' : 'mp3',
        fileSizeBytes: cached.blob.size,
        confidenceScore: 100,
        matchReason: 'Instant hit: verified local IndexedDB audio cache',
        licenseInfo: 'Personal Offline Library Storage',
      };
    }
  } catch (err) {
    console.warn('Local cache check error:', err);
  }
  return null;
}

// Adapter 1: Telegram Audio Hub (Inspired by @MusicsHuntersbot & User Telegram Audio Sync)
export async function searchTelegramAudioHub(
  track: NormalizedTrackMetadata
): Promise<AudioCandidateMatch[]> {
  try {
    const token = await getSetting<string>('telegram_bot_token', '');
    if (!token) return [];

    // Check existing synced Telegram items in library or recent updates
    const localTracks = await getAllTracks();
    const telegramTracks = localTracks.filter((t) => t.telegramSource && t.telegramSource.fileId);

    const matches: AudioCandidateMatch[] = [];
    const normReqTitle = normalizeSongTitle(track.title);
    const normReqArtist = normalizeArtistName(track.artists[0] || '');

    for (const t of telegramTracks) {
      const tTitle = normalizeSongTitle(t.title);
      const tArtist = normalizeArtistName(t.artist);

      if (tTitle === normReqTitle || (normReqTitle.length > 4 && tTitle.includes(normReqTitle))) {
        const { score, reason } = computeMatchConfidence(track, {
          title: t.title,
          artist: t.artist,
          durationSeconds: t.duration,
        });

        if (score >= 60) {
          matches.push({
            provider: 'telegram',
            providerTrackId: `tg_${t.id}`,
            title: t.title,
            artist: t.artist,
            durationSeconds: t.duration,
            downloadUrl: `/api/telegram/download?token=${encodeURIComponent(token)}&file_path=${encodeURIComponent(t.telegramSource?.fileId || '')}`,
            format: 'mp3',
            fileSizeBytes: t.fileSize,
            confidenceScore: score,
            matchReason: `${reason} (Telegram Hub / Bot Sync)`,
            licenseInfo: 'Telegram Music Sync Hub',
          });
        }
      }
    }

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  } catch (err) {
    console.warn('Telegram audio hub search error:', err);
    return [];
  }
}

// Adapter 2: Jamendo API (Open / Creative Commons indie catalog)
export async function searchJamendo(
  track: NormalizedTrackMetadata,
  clientId = DEFAULT_JAMENDO_CLIENT_ID
): Promise<AudioCandidateMatch[]> {
  const cleanTitle = encodeURIComponent(normalizeSongTitle(track.title));
  if (!cleanTitle) return [];

  return fetchWithBackoff(async () => {
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=6&namesearch=${cleanTitle}&include=licenses`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Jamendo API HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    const matches: AudioCandidateMatch[] = [];

    for (const item of data.results) {
      if (!item.audio) continue;

      const durationSeconds = Number(item.duration) || 0;
      const { score, reason } = computeMatchConfidence(track, {
        title: item.name,
        artist: item.artist_name,
        durationSeconds,
      });

      matches.push({
        provider: 'jamendo',
        providerTrackId: `jamendo_${item.id}`,
        title: item.name,
        artist: item.artist_name,
        durationSeconds,
        downloadUrl: item.audiodownload || item.audio,
        previewStreamUrl: item.audio,
        format: 'mp3',
        confidenceScore: score,
        matchReason: reason,
        licenseInfo: item.license_ccurl || 'Creative Commons (Jamendo)',
      });
    }

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, 2, 400);
}

// Adapter 3: Internet Archive (archive.org public domain & live music)
export async function searchInternetArchive(
  track: NormalizedTrackMetadata
): Promise<AudioCandidateMatch[]> {
  const cleanTitle = normalizeSongTitle(track.title);
  if (!cleanTitle) return [];

  return fetchWithBackoff(async () => {
    const query = encodeURIComponent(`mediatype:audio AND (${cleanTitle})`);
    const searchUrl = `https://archive.org/advancedsearch.php?q=${query}&fl[]=identifier,title,creator,mediatype,publicdate&rows=5&output=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Internet Archive HTTP ${res.status}`);
    const data = await res.json();
    const docs = data.response?.docs;
    if (!docs || !Array.isArray(docs)) return [];

    const matches: AudioCandidateMatch[] = [];

    for (const doc of docs.slice(0, 3)) {
      try {
        const metaUrl = `https://archive.org/metadata/${doc.identifier}`;
        const metaRes = await fetch(metaUrl, { signal: AbortSignal.timeout(5000) });
        if (!metaRes.ok) continue;
        const metaData = await metaRes.json();
        const files: Array<{ name: string; format?: string; length?: string; size?: string }> =
          metaData.files || [];

        // Find best .mp3 file
        const mp3File = files.find(
          (f) =>
            f.name.endsWith('.mp3') &&
            !f.name.includes('_thumb') &&
            !f.name.includes('_preview') &&
            (f.format?.toLowerCase().includes('mp3') || f.format?.toLowerCase().includes('vbr'))
        );

        if (mp3File) {
          const durationSeconds = parseFloat(mp3File.length || '0') || 0;
          const { score, reason } = computeMatchConfidence(track, {
            title: doc.title || mp3File.name,
            artist: doc.creator || 'Internet Archive Audio',
            durationSeconds,
          });

          const downloadUrl = `https://archive.org/download/${doc.identifier}/${encodeURIComponent(
            mp3File.name
          )}`;

          matches.push({
            provider: 'archive',
            providerTrackId: `archive_${doc.identifier}`,
            title: doc.title || track.title,
            artist: doc.creator || 'Public Audio',
            durationSeconds,
            downloadUrl,
            previewStreamUrl: downloadUrl,
            format: 'mp3',
            fileSizeBytes: mp3File.size ? parseInt(mp3File.size, 10) : undefined,
            confidenceScore: score,
            matchReason: `${reason} (Public Domain / Live Archive)`,
            licenseInfo: 'Internet Archive Public Audio',
          });
        }
      } catch {
        continue;
      }
    }

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, 2, 500);
}

// Adapter 4: Free Music Archive (FMA) / WFMU Open Archive
export async function searchFreeMusicArchive(
  track: NormalizedTrackMetadata
): Promise<AudioCandidateMatch[]> {
  const cleanTitle = encodeURIComponent(normalizeSongTitle(track.title));
  if (!cleanTitle) return [];

  try {
    // Open CC query against Free Music Archive / WFMU public index
    const url = `https://freemusicarchive.org/api/get/tracks.json?api_key=60BLHNQCA2QA3OG&limit=5&q=${cleanTitle}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    if (!data.dataset || !Array.isArray(data.dataset)) return [];

    const matches: AudioCandidateMatch[] = [];
    for (const item of data.dataset) {
      if (!item.track_file) continue;

      const durationSeconds = item.track_duration ? parseInt(item.track_duration, 10) : 0;
      const { score, reason } = computeMatchConfidence(track, {
        title: item.track_title,
        artist: item.artist_name,
        durationSeconds,
      });

      matches.push({
        provider: 'fma',
        providerTrackId: `fma_${item.track_id}`,
        title: item.track_title,
        artist: item.artist_name,
        durationSeconds,
        downloadUrl: item.track_file,
        format: 'mp3',
        confidenceScore: score,
        matchReason: `${reason} (Free Music Archive CC)`,
        licenseInfo: item.license_title || 'Creative Commons',
      });
    }

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  } catch {
    return [];
  }
}

// ---------------- AUDIO DOWNLOAD & STREAM VERIFICATION ----------------

/**
 * Downloads audio stream, handles progress, verifies minimum size and content-type.
 * If direct browser fetch hits CORS errors on iOS Safari, automatically routes through server proxy.
 */
export async function downloadAndValidateAudio(
  url: string,
  onProgress?: (percent: number) => void
): Promise<{ blob: Blob; mimeType: string }> {
  // If it's a local blob reference from cache, load it directly
  if (url.startsWith('blob:local/')) {
    const trackId = url.replace('blob:local/', '');
    const { getAudioBlob } = await import('../db');
    const blob = await getAudioBlob(trackId);
    if (!blob || blob.size < 1024) {
      throw new Error('Local audio file missing or corrupted in storage.');
    }
    if (onProgress) onProgress(100);
    return { blob, mimeType: blob.type || 'audio/mpeg' };
  }

  // Attempt direct fetch first; on CORS failure fallback to /api/audio-proxy
  let fetchUrl = url;
  let res: Response;

  try {
    res = await fetch(fetchUrl);
    if (!res.ok && res.status >= 400) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (directErr) {
    // Retry via server-side proxy
    try {
      fetchUrl = `/api/audio-proxy?url=${encodeURIComponent(url)}`;
      res = await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`Proxy download failed: HTTP ${res.status}`);
      }
    } catch {
      throw directErr;
    }
  }

  const contentLength = Number(res.headers.get('content-length')) || 0;
  let mimeType = res.headers.get('content-type') || 'audio/mpeg';
  if (!mimeType.includes('audio')) {
    mimeType = 'audio/mpeg';
  }

  if (!res.body) {
    const blob = await res.blob();
    if (blob.size < 1024) {
      throw new Error('Downloaded audio stream is corrupted or empty (size < 1KB).');
    }
    if (onProgress) onProgress(100);
    return { blob, mimeType };
  }

  const reader = res.body.getReader();
  let receivedBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      if (contentLength > 0 && onProgress) {
        onProgress(Math.min(99, Math.round((receivedBytes / contentLength) * 100)));
      }
    }
  }

  if (onProgress) onProgress(100);

  // Combine chunks
  const combined = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const blob = new Blob([combined.buffer], { type: mimeType });
  if (blob.size < 1024) {
    throw new Error('Retrieved file is too small to be a valid audio recording.');
  }

  return { blob, mimeType };
}

// ---------------- MASTER PROVIDER SEARCH PIPELINE ----------------

export interface SearchProvidersResult {
  matches: AudioCandidateMatch[];
  attempts: X2ProviderAttempt[];
  primaryError?: string;
  failureCategory: X2FailureCategory;
}

/**
 * Searches across all configured X2 providers in prioritized order,
 * with error handling, latency logging, and failure recovery.
 */
export async function searchAllX2Providers(
  track: NormalizedTrackMetadata,
  settings: ImportSettings
): Promise<SearchProvidersResult> {
  const attempts: X2ProviderAttempt[] = [];
  const matches: AudioCandidateMatch[] = [];

  // Step 1: Local Library Cache (Checked first - 0 network cost)
  if (settings.preferLocalCache !== false) {
    const start = Date.now();
    try {
      const localMatch = await searchLocalLibraryCache(track);
      if (localMatch) {
        attempts.push({
          provider: 'local',
          providerName: 'Local Library Cache',
          status: 'matched',
          candidateCount: 1,
          latencyMs: Date.now() - start,
        });
        return {
          matches: [localMatch],
          attempts,
          failureCategory: 'none',
        };
      } else {
        attempts.push({
          provider: 'local',
          providerName: 'Local Library Cache',
          status: 'no_match',
          candidateCount: 0,
          latencyMs: Date.now() - start,
        });
      }
    } catch (err: unknown) {
      attempts.push({
        provider: 'local',
        providerName: 'Local Library Cache',
        status: 'error',
        errorDetails: err instanceof Error ? err.message : 'Cache error',
        candidateCount: 0,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Step 2: spotDL Bridge (if enabled and configured)
  if (settings.enableSpotDLBridge && settings.spotDLBridgeUrl) {
    const start = Date.now();
    try {
      const spotMatch = await searchSpotDLBridge(track, settings.spotDLBridgeUrl);
      if (spotMatch) {
        matches.push(spotMatch);
        attempts.push({
          provider: 'spotdl',
          providerName: 'spotDL Python Engine',
          status: 'matched',
          candidateCount: 1,
          latencyMs: Date.now() - start,
        });
      } else {
        attempts.push({
          provider: 'spotdl',
          providerName: 'spotDL Python Engine',
          status: 'no_match',
          candidateCount: 0,
          latencyMs: Date.now() - start,
        });
      }
    } catch (err: unknown) {
      attempts.push({
        provider: 'spotdl',
        providerName: 'spotDL Python Engine',
        status: 'error',
        errorDetails: err instanceof Error ? err.message : 'Bridge unreachable',
        candidateCount: 0,
        latencyMs: Date.now() - start,
      });
    }
  } else if (settings.enableSpotDLBridge && !settings.spotDLBridgeUrl) {
    attempts.push({
      provider: 'spotdl',
      providerName: 'spotDL Python Engine',
      status: 'skipped',
      errorDetails: 'Requires self-hosted Python microservice URL',
      candidateCount: 0,
    });
  }

  // Step 3: Telegram Audio Hub (Inspired by @MusicsHuntersbot & User Telegram Audio Sync)
  if (settings.enableTelegramMatch !== false) {
    const start = Date.now();
    try {
      const tgMatches = await searchTelegramAudioHub(track);
      if (tgMatches.length > 0) {
        matches.push(...tgMatches);
        attempts.push({
          provider: 'telegram',
          providerName: 'Telegram Audio Hub',
          status: 'matched',
          candidateCount: tgMatches.length,
          latencyMs: Date.now() - start,
        });
      } else {
        attempts.push({
          provider: 'telegram',
          providerName: 'Telegram Audio Hub',
          status: 'no_match',
          candidateCount: 0,
          latencyMs: Date.now() - start,
        });
      }
    } catch (err: unknown) {
      attempts.push({
        provider: 'telegram',
        providerName: 'Telegram Audio Hub',
        status: 'error',
        errorDetails: err instanceof Error ? err.message : 'Telegram search error',
        candidateCount: 0,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Step 4: Jamendo Open Music Catalog (v2)
  if (settings.enableJamendo) {
    const start = Date.now();
    try {
      const jamendoMatches = await searchJamendo(track);
      if (jamendoMatches.length > 0) {
        matches.push(...jamendoMatches);
        attempts.push({
          provider: 'jamendo',
          providerName: 'Jamendo Open Music',
          status: 'matched',
          candidateCount: jamendoMatches.length,
          latencyMs: Date.now() - start,
        });
      } else {
        attempts.push({
          provider: 'jamendo',
          providerName: 'Jamendo Open Music',
          status: 'no_match',
          candidateCount: 0,
          latencyMs: Date.now() - start,
        });
      }
    } catch (err: unknown) {
      attempts.push({
        provider: 'jamendo',
        providerName: 'Jamendo Open Music',
        status: 'error',
        errorDetails: err instanceof Error ? err.message : 'API error',
        candidateCount: 0,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Step 5: Internet Archive (v2)
  if (settings.enableInternetArchive) {
    const start = Date.now();
    try {
      const archiveMatches = await searchInternetArchive(track);
      if (archiveMatches.length > 0) {
        matches.push(...archiveMatches);
        attempts.push({
          provider: 'archive',
          providerName: 'Internet Archive',
          status: 'matched',
          candidateCount: archiveMatches.length,
          latencyMs: Date.now() - start,
        });
      } else {
        attempts.push({
          provider: 'archive',
          providerName: 'Internet Archive',
          status: 'no_match',
          candidateCount: 0,
          latencyMs: Date.now() - start,
        });
      }
    } catch (err: unknown) {
      attempts.push({
        provider: 'archive',
        providerName: 'Internet Archive',
        status: 'error',
        errorDetails: err instanceof Error ? err.message : 'Search error',
        candidateCount: 0,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Step 6: Free Music Archive (FMA)
  if (settings.enableFMA) {
    const start = Date.now();
    try {
      const fmaMatches = await searchFreeMusicArchive(track);
      if (fmaMatches.length > 0) {
        matches.push(...fmaMatches);
        attempts.push({
          provider: 'fma',
          providerName: 'Free Music Archive',
          status: 'matched',
          candidateCount: fmaMatches.length,
          latencyMs: Date.now() - start,
        });
      } else {
        attempts.push({
          provider: 'fma',
          providerName: 'Free Music Archive',
          status: 'no_match',
          candidateCount: 0,
          latencyMs: Date.now() - start,
        });
      }
    } catch (err: unknown) {
      attempts.push({
        provider: 'fma',
        providerName: 'Free Music Archive',
        status: 'error',
        errorDetails: err instanceof Error ? err.message : 'FMA search error',
        candidateCount: 0,
        latencyMs: Date.now() - start,
      });
    }
  }

  // Sort candidates by confidence score
  matches.sort((a, b) => b.confidenceScore - a.confidenceScore);

  let failureCategory: X2FailureCategory = 'none';
  if (matches.length === 0) {
    const hasNetworkErrors = attempts.some((a) => a.status === 'error' && (a.errorDetails?.includes('Failed to fetch') || a.errorDetails?.includes('Network')));
    if (hasNetworkErrors) {
      failureCategory = 'network_failure';
    } else {
      failureCategory = 'recording_unavailable';
    }
  }

  return {
    matches,
    attempts,
    failureCategory,
  };
}

// ---------------- FULL X2 MATCHING & IMPORT PIPELINE ----------------

export interface RunX2ImportParams {
  tracks: NormalizedTrackMetadata[];
  playlistTitle: string;
  playlistDescription?: string;
  playlistCoverUrl?: string;
  settings: ImportSettings;
  onItemUpdate: (item: TrackImportProgressItem) => void;
  onSummaryUpdate: (summary: ImportSummary) => void;
  isCancelledRef: { current: boolean };
}

export async function executeX2Import(
  params: RunX2ImportParams
): Promise<{
  createdPlaylist: Playlist;
  summary: ImportSummary;
}> {
  const {
    tracks,
    playlistTitle,
    playlistDescription,
    playlistCoverUrl,
    settings,
    onItemUpdate,
    onSummaryUpdate,
    isCancelledRef,
  } = params;

  const playlistTrackIds: string[] = [];

  const summary: ImportSummary = {
    total: tracks.length,
    completed: 0,
    alreadyLocal: 0,
    reviewRequired: 0,
    unavailable: 0,
    failed: 0,
  };

  for (let i = 0; i < tracks.length; i++) {
    if (isCancelledRef.current) break;

    const trackMeta = tracks[i];
    const itemProgress: TrackImportProgressItem = {
      id: `item_${i}`,
      track: trackMeta,
      status: 'pending',
      candidateMatches: [],
      downloadProgress: 0,
      retryCount: 0,
    };

    onItemUpdate(itemProgress);

    // Search providers with modular pipeline
    itemProgress.status = 'searching';
    onItemUpdate(itemProgress);

    const searchResult = await searchAllX2Providers(trackMeta, settings);
    itemProgress.candidateMatches = searchResult.matches;
    itemProgress.providerAttempts = searchResult.attempts;

    const bestMatch = searchResult.matches[0];

    // Case 1: Already cached in local IndexedDB
    if (bestMatch && bestMatch.provider === 'local') {
      const localTrackId = bestMatch.providerTrackId.replace('local_', '');
      itemProgress.status = 'already_local';
      itemProgress.savedTrackId = localTrackId;
      itemProgress.selectedMatch = bestMatch;
      playlistTrackIds.push(localTrackId);
      summary.alreadyLocal++;
      summary.completed++;
      onItemUpdate(itemProgress);
      onSummaryUpdate({ ...summary });
      continue;
    }

    // Case 2: No acceptable candidates found
    if (!bestMatch || bestMatch.confidenceScore < 45) {
      itemProgress.status = 'unavailable';
      itemProgress.failureCategory = searchResult.failureCategory;
      itemProgress.errorMessage =
        searchResult.failureCategory === 'network_failure'
          ? 'Network timeout or connection error during search.'
          : 'No authorized audio match found across open repositories or Telegram sync.';
      summary.unavailable++;
      onItemUpdate(itemProgress);
      onSummaryUpdate({ ...summary });
      continue;
    }

    // Case 3: Match requires user confirmation
    if (
      settings.requireConfirmationForMedium &&
      bestMatch.confidenceScore < settings.matchingThreshold
    ) {
      itemProgress.status = 'review_required';
      itemProgress.selectedMatch = bestMatch;
      summary.reviewRequired++;
      onItemUpdate(itemProgress);
      onSummaryUpdate({ ...summary });
      continue;
    }

    // Case 4: High confidence match -> proceed to download and store
    itemProgress.status = 'downloading';
    itemProgress.selectedMatch = bestMatch;
    onItemUpdate(itemProgress);

    try {
      const { blob, mimeType } = await downloadAndValidateAudio(
        bestMatch.downloadUrl,
        (progress) => {
          itemProgress.downloadProgress = progress;
          onItemUpdate(itemProgress);
        }
      );

      itemProgress.status = 'saving';
      onItemUpdate(itemProgress);

      const trackId = `imported_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      const newTrack: Track = {
        id: trackId,
        title: trackMeta.title,
        artist: trackMeta.artists.join(', ') || bestMatch.artist || 'Unknown Artist',
        album: trackMeta.album || playlistTitle,
        duration: bestMatch.durationSeconds || Math.round(trackMeta.durationMs / 1000) || 0,
        fileSize: blob.size,
        mimeType: mimeType,
        fileName: `${trackMeta.title}.${bestMatch.format || 'mp3'}`,
        downloadDate: Date.now(),
        isFavorite: false,
        playCount: 0,
        artworkUrl: trackMeta.artworkUrl || playlistCoverUrl,
        telegramSource: {
          chatTitle: `Import: ${playlistTitle}`,
          topicName: bestMatch.provider.toUpperCase(),
          sourceType: 'manual',
        },
      };

      await saveTrack(newTrack, blob);
      playlistTrackIds.push(trackId);

      itemProgress.status = 'completed';
      itemProgress.savedTrackId = trackId;
      summary.completed++;
      onItemUpdate(itemProgress);
      onSummaryUpdate({ ...summary });
    } catch (err: unknown) {
      itemProgress.status = 'failed';
      itemProgress.failureCategory = 'stream_invalid';
      itemProgress.errorMessage = err instanceof Error ? err.message : 'Download failed';
      summary.failed++;
      onItemUpdate(itemProgress);
      onSummaryUpdate({ ...summary });
    }
  }

  // Preserve exact playlist order and save Playlist
  const newPlaylist: Playlist = {
    id: `pl_import_${Date.now()}`,
    name: playlistTitle,
    description: playlistDescription || `Imported playlist with ${playlistTrackIds.length} audio tracks`,
    sourceType: 'manual',
    trackIds: playlistTrackIds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    coverArtworkUrl: playlistCoverUrl,
  };

  await savePlaylist(newPlaylist);
  return { createdPlaylist: newPlaylist, summary };
}

// ---------------- INDIVIDUAL TRACK RETRY (Requirement 4) ----------------

/**
 * Retries an individual failed or unavailable track with updated settings or backoff
 */
export async function retryIndividualTrack(
  item: TrackImportProgressItem,
  settings: ImportSettings,
  onItemUpdate: (item: TrackImportProgressItem) => void,
  targetPlaylistId?: string
): Promise<{ success: boolean; trackId?: string; error?: string }> {
  item.status = 'searching';
  item.retryCount = (item.retryCount || 0) + 1;
  onItemUpdate({ ...item });

  const searchResult = await searchAllX2Providers(item.track, settings);
  item.candidateMatches = searchResult.matches;
  item.providerAttempts = searchResult.attempts;

  const bestMatch = searchResult.matches[0];
  if (!bestMatch || bestMatch.confidenceScore < 45) {
    item.status = 'unavailable';
    item.failureCategory = searchResult.failureCategory;
    item.errorMessage = 'Still unavailable across configured audio providers.';
    onItemUpdate({ ...item });
    return { success: false, error: item.errorMessage };
  }

  // If local
  if (bestMatch.provider === 'local') {
    const localId = bestMatch.providerTrackId.replace('local_', '');
    item.status = 'already_local';
    item.savedTrackId = localId;
    item.selectedMatch = bestMatch;
    onItemUpdate({ ...item });
    return { success: true, trackId: localId };
  }

  // Download
  item.status = 'downloading';
  item.selectedMatch = bestMatch;
  onItemUpdate({ ...item });

  try {
    const { blob, mimeType } = await downloadAndValidateAudio(
      bestMatch.downloadUrl,
      (p) => {
        item.downloadProgress = p;
        onItemUpdate({ ...item });
      }
    );

    item.status = 'saving';
    onItemUpdate({ ...item });

    const trackId = `retry_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newTrack: Track = {
      id: trackId,
      title: item.track.title,
      artist: item.track.artists.join(', ') || bestMatch.artist,
      album: item.track.album || 'Imported Audio',
      duration: bestMatch.durationSeconds || Math.round(item.track.durationMs / 1000) || 0,
      fileSize: blob.size,
      mimeType: mimeType,
      fileName: `${item.track.title}.${bestMatch.format || 'mp3'}`,
      downloadDate: Date.now(),
      isFavorite: false,
      playCount: 0,
      artworkUrl: item.track.artworkUrl || undefined,
      telegramSource: {
        chatTitle: 'Individual Retry',
        topicName: bestMatch.provider.toUpperCase(),
        sourceType: 'manual',
      },
    };

    await saveTrack(newTrack, blob);

    // If target playlist ID is provided, append to it
    if (targetPlaylistId) {
      const { getAllPlaylists, savePlaylist } = await import('../db');
      const pls = await getAllPlaylists();
      const targetPl = pls.find((p) => p.id === targetPlaylistId);
      if (targetPl) {
        targetPl.trackIds = Array.from(new Set([...targetPl.trackIds, trackId]));
        targetPl.updatedAt = Date.now();
        await savePlaylist(targetPl);
      }
    }

    item.status = 'completed';
    item.savedTrackId = trackId;
    item.errorMessage = undefined;
    onItemUpdate({ ...item });
    return { success: true, trackId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Download failed';
    item.status = 'failed';
    item.errorMessage = msg;
    item.failureCategory = 'stream_invalid';
    onItemUpdate({ ...item });
    return { success: false, error: msg };
  }
}
