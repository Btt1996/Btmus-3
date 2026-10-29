import { UnifiedHistoryRecord, HistoryType } from '../types/unifiedSearch';
import { getSetting, saveSetting } from './db';

const HISTORY_STORAGE_KEY = 'bttm_unified_music_history_v2';
const MAX_HISTORY_RECORDS = 200;

// In-memory cache for ultra-fast sync UI reads
let inMemoryHistory: UnifiedHistoryRecord[] | null = null;

function loadFromLocalStorage(): UnifiedHistoryRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed reading history from localStorage:', err);
    return [];
  }
}

function saveToLocalStorage(records: UnifiedHistoryRecord[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Failed saving history to localStorage:', err);
  }
}

/**
 * Initializes and retrieves all history records.
 * Integrates bidirectional fallback between localStorage and IndexedDB settings store.
 */
export async function getAllHistory(): Promise<UnifiedHistoryRecord[]> {
  if (inMemoryHistory) return inMemoryHistory;

  let records = loadFromLocalStorage();

  // If localStorage empty, attempt restoration from IndexedDB settings
  if (records.length === 0) {
    try {
      const idbHistory = await getSetting<UnifiedHistoryRecord[]>(HISTORY_STORAGE_KEY, []);
      if (Array.isArray(idbHistory) && idbHistory.length > 0) {
        records = idbHistory;
        saveToLocalStorage(records);
      }
    } catch {
      // IndexedDB fallback silent
    }
  }

  inMemoryHistory = records.sort((a, b) => b.timestamp - a.timestamp);
  return inMemoryHistory;
}

/**
 * Saves updated records and syncs to both localStorage and IndexedDB
 */
async function persistHistory(records: UnifiedHistoryRecord[]): Promise<void> {
  const trimmed = records.slice(0, MAX_HISTORY_RECORDS);
  inMemoryHistory = trimmed;
  saveToLocalStorage(trimmed);

  try {
    await saveSetting(HISTORY_STORAGE_KEY, trimmed);
  } catch {
    // Non-blocking IndexedDB persistence
  }
}

/**
 * Record a search query
 */
export async function recordSearchHistory(
  query: string,
  source: string,
  resultCount: number
): Promise<void> {
  const clean = query.trim();
  if (!clean) return;

  const records = await getAllHistory();
  // Filter out recent identical search to keep history fresh
  const filtered = records.filter(
    (r) => !(r.type === 'search' && r.query?.toLowerCase() === clean.toLowerCase())
  );

  const newRecord: UnifiedHistoryRecord = {
    id: `search_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'search',
    timestamp: Date.now(),
    title: clean,
    subtitle: `${source.toUpperCase()} • ${resultCount} results found`,
    source,
    query: clean,
    status: 'completed',
  };

  await persistHistory([newRecord, ...filtered]);
}

/**
 * Record a Spotify or external playlist inspection
 */
export async function recordPlaylistHistory(playlist: {
  id?: string;
  title: string;
  curator?: string;
  source: string;
  coverUrl?: string;
  totalTracks: number;
  externalUrl?: string;
}): Promise<void> {
  const records = await getAllHistory();
  const filtered = records.filter(
    (r) =>
      !(
        r.type === 'playlist' &&
        (r.title === playlist.title || (playlist.externalUrl && r.playlistUrl === playlist.externalUrl))
      )
  );

  const newRecord: UnifiedHistoryRecord = {
    id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'playlist',
    timestamp: Date.now(),
    title: playlist.title,
    subtitle: `${playlist.curator || 'Curated Playlist'} • ${playlist.totalTracks} tracks`,
    source: playlist.source,
    artworkUrl: playlist.coverUrl,
    playlistUrl: playlist.externalUrl,
    trackCount: playlist.totalTracks,
    status: 'completed',
  };

  await persistHistory([newRecord, ...filtered]);
}

/**
 * Record a successful or attempted download
 */
export async function recordDownloadHistory(item: {
  title: string;
  artist: string;
  album?: string;
  source: string;
  status: 'completed' | 'failed' | 'in_library';
  localTrackId?: string;
  artworkUrl?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  errorReason?: string;
}): Promise<void> {
  const records = await getAllHistory();

  const newRecord: UnifiedHistoryRecord = {
    id: `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'download',
    timestamp: Date.now(),
    title: item.title,
    subtitle: `${item.artist}${item.album ? ` • ${item.album}` : ''}`,
    source: item.source,
    status: item.status,
    localTrackId: item.localTrackId,
    artworkUrl: item.artworkUrl,
    durationSeconds: item.durationSeconds,
    fileSizeBytes: item.fileSizeBytes,
    errorReason: item.errorReason,
  };

  await persistHistory([newRecord, ...records]);
}

/**
 * Record a failed import for subsequent retry
 */
export async function recordFailedImport(item: {
  title: string;
  artist: string;
  album?: string;
  source: string;
  errorReason: string;
  durationMs?: number;
  isrc?: string | null;
}): Promise<void> {
  const records = await getAllHistory();

  const newRecord: UnifiedHistoryRecord = {
    id: `fail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'failed_import',
    timestamp: Date.now(),
    title: item.title,
    subtitle: `${item.artist} — ${item.errorReason}`,
    source: item.source,
    status: 'failed',
    errorReason: item.errorReason,
    retryPayload: {
      title: item.title,
      artist: item.artist,
      album: item.album,
      source: item.source,
      durationMs: item.durationMs,
      isrc: item.isrc,
    },
  };

  await persistHistory([newRecord, ...records]);
}

/**
 * Record duplicate detection event
 */
export async function recordDuplicateDetection(item: {
  title: string;
  artist: string;
  matchedTrackId: string;
}): Promise<void> {
  const records = await getAllHistory();

  const newRecord: UnifiedHistoryRecord = {
    id: `dup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'duplicate',
    timestamp: Date.now(),
    title: item.title,
    subtitle: `${item.artist} • Already in Library (Skipped re-download)`,
    source: 'local_duplicate_check',
    localTrackId: item.matchedTrackId,
    status: 'in_library',
  };

  await persistHistory([newRecord, ...records]);
}

/**
 * Record playback event
 */
export async function recordPlaybackHistory(item: {
  title: string;
  artist: string;
  artworkUrl?: string;
  durationSeconds?: number;
  localTrackId?: string;
}): Promise<void> {
  const records = await getAllHistory();
  const newRecord: UnifiedHistoryRecord = {
    id: `play_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'playback',
    timestamp: Date.now(),
    title: item.title,
    subtitle: item.artist,
    artworkUrl: item.artworkUrl,
    durationSeconds: item.durationSeconds,
    localTrackId: item.localTrackId,
    status: 'completed',
  };

  await persistHistory([newRecord, ...records]);
}

/**
 * Delete a single history record by ID
 */
export async function deleteHistoryRecord(id: string): Promise<void> {
  const records = await getAllHistory();
  const updated = records.filter((r) => r.id !== id);
  await persistHistory(updated);
}

/**
 * Clear records by type or all
 */
export async function clearHistoryByType(type?: HistoryType): Promise<void> {
  if (!type || type === 'all') {
    await persistHistory([]);
  } else {
    const records = await getAllHistory();
    const updated = records.filter((r) => r.type !== type);
    await persistHistory(updated);
  }
}
