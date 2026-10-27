/**
 * Official Apple iTunes Search API Integration (X1 Provider)
 * Unauthenticated, documented, public music metadata API.
 * https://performance-partners.apple.com/search-api
 */

export interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  artworkUrl600: string;
  previewUrl: string | null;
  trackTimeMillis: number;
  primaryGenreName?: string;
  releaseDate?: string;
  isrc?: string | null;
}

export async function searchITunesTracks(query: string, limit = 25): Promise<ITunesTrack[]> {
  const clean = query.trim();
  if (!clean) return [];

  // 1. Try server proxy first to avoid any iOS Safari CORS edge cases
  try {
    const proxyUrl = `/api/itunes/search?term=${encodeURIComponent(clean)}&limit=${limit}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results)) {
        return formatITunesResults(data.results);
      }
    }
  } catch (err) {
    // Continue to direct fallback
  }

  // 2. Direct Apple iTunes Search API
  try {
    const directUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      clean
    )}&media=music&entity=song&limit=${limit}`;
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error(`iTunes Search API error: HTTP ${res.status}`);
    const data = await res.json();
    return formatITunesResults(data.results || []);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to search iTunes';
    throw new Error(msg);
  }
}

function formatITunesResults(results: any[]): ITunesTrack[] {
  return results
    .filter((item) => item.wrapperType === 'track' && item.kind === 'song')
    .map((item) => {
      // Upgrade 100x100 artwork to crisp 600x600 retina artwork
      const rawArt = item.artworkUrl100 || '';
      const artworkUrl600 = rawArt ? rawArt.replace('100x100bb', '600x600bb') : '/pwa-512x512.png';

      return {
        trackId: item.trackId,
        trackName: item.trackName || 'Unknown Title',
        artistName: item.artistName || 'Unknown Artist',
        collectionName: item.collectionName || 'Single',
        artworkUrl100: rawArt,
        artworkUrl600,
        previewUrl: item.previewUrl || null,
        trackTimeMillis: item.trackTimeMillis || 0,
        primaryGenreName: item.primaryGenreName,
        releaseDate: item.releaseDate,
        isrc: item.isrc || null,
      };
    });
}
