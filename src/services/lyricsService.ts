export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface SongLyrics {
  trackId: string;
  title: string;
  artist: string;
  syncedLyrics?: LyricLine[];
  plainLyrics?: string[];
  source: string;
  fetchedAt: number;
}

const LYRICS_CACHE_PREFIX = 'btt_lyrics_cache_';

/**
 * Clean artist and title for higher lyric matching rates
 */
function cleanSongTitle(title: string): string {
  return title
    .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics?|visualizer|hq|hd|remix|feat\..*|ft\..*)[\)\]]/gi, '')
    .replace(/\.mp3$|\.m4a$|\.wav$|\.flac$/i, '')
    .trim();
}

function cleanArtistName(artist: string): string {
  if (!artist || artist === 'Unknown Artist' || artist === 'Imported Audio') return '';
  return artist.split(',')[0].split('&')[0].trim();
}

/**
 * Parses LRC format text "[00:12.34] line text" into sorted LyricLine array
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return [];

  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  // Regex to match timestamp e.g. [01:23.45] or [01:23]
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length > 0) {
      const text = trimmed.replace(timeRegex, '').trim();
      for (const match of matches) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseFloat(match[2]);
        const totalSeconds = minutes * 60 + seconds;
        result.push({
          time: totalSeconds,
          text: text || '♪',
        });
      }
    }
  }

  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Get cached lyrics for a track ID
 */
export function getCachedLyrics(trackId: string): SongLyrics | null {
  try {
    const cached = localStorage.getItem(`${LYRICS_CACHE_PREFIX}${trackId}`);
    if (cached) {
      return JSON.parse(cached) as SongLyrics;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Save lyrics to offline cache
 */
export function saveCachedLyrics(lyrics: SongLyrics): void {
  try {
    localStorage.setItem(`${LYRICS_CACHE_PREFIX}${lyrics.trackId}`, JSON.stringify(lyrics));
  } catch (err) {
    console.warn('Could not cache lyrics:', err);
  }
}

/**
 * Fetch lyrics for a song using LRCLIB free open API
 */
export async function fetchLyricsForTrack(
  trackId: string,
  rawTitle: string,
  rawArtist: string,
  durationSeconds?: number
): Promise<SongLyrics | null> {
  // 1. Check local offline cache first
  const cached = getCachedLyrics(trackId);
  if (cached) return cached;

  const title = cleanSongTitle(rawTitle);
  const artist = cleanArtistName(rawArtist);

  if (!title) return null;

  try {
    let data: any = null;

    // Strategy A: Exact match with duration if available
    const params = new URLSearchParams();
    params.set('track_name', title);
    if (artist) params.set('artist_name', artist);
    if (durationSeconds && durationSeconds > 0) {
      params.set('duration', Math.round(durationSeconds).toString());
    }

    try {
      const resp = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        headers: {
          'Lrclib-Client': 'BttMusicPlayer/1.5.0 (https://bttmusic.app)',
        },
      });

      if (resp.ok) {
        data = await resp.json();
      }
    } catch {
      // ignore network error, try search fallback
    }

    // Strategy B: Search fallback if exact get failed
    if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
      const query = artist ? `${artist} ${title}` : title;
      const searchResp = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'Lrclib-Client': 'BttMusicPlayer/1.5.0 (https://bttmusic.app)',
          },
        }
      );

      if (searchResp.ok) {
        const results = await searchResp.json();
        if (Array.isArray(results) && results.length > 0) {
          // Prefer item with syncedLyrics
          data = results.find((r) => r.syncedLyrics) || results[0];
        }
      }
    }

    if (!data) return null;

    const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : undefined;
    const plain = data.plainLyrics
      ? data.plainLyrics.split('\n').map((l: string) => l.trim()).filter(Boolean)
      : undefined;

    if (!synced && !plain) return null;

    const lyricsObj: SongLyrics = {
      trackId,
      title: data.trackName || rawTitle,
      artist: data.artistName || rawArtist,
      syncedLyrics: synced && synced.length > 0 ? synced : undefined,
      plainLyrics: plain,
      source: 'LRCLIB (Synced)',
      fetchedAt: Date.now(),
    };

    saveCachedLyrics(lyricsObj);
    return lyricsObj;
  } catch (err) {
    console.warn('Lyrics fetch failed:', err);
    return null;
  }
}
