import { NormalizedPlaylist, NormalizedTrackMetadata } from '../../types/playlistImport';

export interface SpotifyConfig {
  clientId?: string;
  clientSecret?: string;
}

export interface ParsedSpotifyTarget {
  type: 'playlist' | 'album' | 'track';
  id: string;
}

/**
 * Extracts Spotify target (type and ID) from various URL and URI forms:
 * - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
 * - https://open.spotify.com/intl-fr/playlist/37i9dQZF1DXcBWIGoYBM5M
 * - https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy
 * - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 * - 37i9dQZF1DXcBWIGoYBM5M
 */
export function parseSpotifyTarget(input: string): ParsedSpotifyTarget | null {
  if (!input) return null;
  const trimmed = input.trim();

  // URI format: spotify:playlist:123 or spotify:album:123
  const uriMatch = trimmed.match(/^spotify:(playlist|album|track):([a-zA-Z0-9]+)/);
  if (uriMatch) {
    return { type: uriMatch[1] as 'playlist' | 'album' | 'track', id: uriMatch[2] };
  }

  // URL format with optional /intl-xx/ and query parameters
  const urlMatch = trimmed.match(
    /open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/
  );
  if (urlMatch) {
    return { type: urlMatch[1] as 'playlist' | 'album' | 'track', id: urlMatch[2] };
  }

  // Direct 22-character alphanumeric ID
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
    return { type: 'playlist', id: trimmed };
  }

  return null;
}

export function parseSpotifyPlaylistId(input: string): string | null {
  const target = parseSpotifyTarget(input);
  return target ? target.id : null;
}

/**
 * X1: Resolves Spotify playlist or album metadata without asking the user for API credentials.
 * Utilizes the public embed metadata resolver (inspired by Unstream's keyless architecture).
 *
 * Conforms to exact X1 normalized schema:
 * {
 *   source: "spotify",
 *   playlistTitle: string,
 *   tracks: [
 *     { title, artists, album, durationMs, isrc, artworkUrl, position }
 *   ]
 * }
 */
export async function fetchSpotifyPlaylist(
  playlistUrlOrId: string,
  config?: SpotifyConfig
): Promise<NormalizedPlaylist> {
  const target = parseSpotifyTarget(playlistUrlOrId);
  if (!target) {
    throw new Error(
      'Invalid Spotify link. Please paste a valid Spotify playlist or album URL (e.g. https://open.spotify.com/playlist/...)'
    );
  }

  // Primary: Call the local server endpoint which runs the keyless embed resolver
  try {
    const res = await fetch(`/api/spotify/playlist?id=${encodeURIComponent(target.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: playlistUrlOrId,
        id: target.id,
        clientId: config?.clientId?.trim() || undefined,
        clientSecret: config?.clientSecret?.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.tracks && Array.isArray(data.tracks) && data.tracks.length > 0) {
      return {
        source: 'spotify',
        playlistTitle: data.playlistTitle || 'Spotify Playlist',
        playlistDescription: data.playlistDescription || '',
        playlistCoverUrl: data.playlistCoverUrl || undefined,
        externalUrl: data.externalUrl || `https://open.spotify.com/${target.type}/${target.id}`,
        totalTracks: data.totalTracks || data.tracks.length,
        tracks: data.tracks,
      };
    }

    if (data.details || data.error) {
      throw new Error(data.details || data.error);
    }
  } catch (err: unknown) {
    if (err instanceof Error && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // Client-side fallback: In case the local server is temporarily rebooting,
  // attempt public CORS proxy to open.spotify.com/embed/...
  try {
    const embedUrl = `https://open.spotify.com/embed/${target.type}/${target.id}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(embedUrl)}`;
    const clientRes = await fetch(proxyUrl);

    if (clientRes.ok) {
      const html = await clientRes.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

      if (match) {
        const parsed = JSON.parse(match[1]);
        const entity = parsed.props?.pageProps?.state?.data?.entity;

        if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
          const playlistTitle = entity.title || entity.name || 'Spotify Playlist';
          const coverUrl =
            entity.visualIdentity?.image?.[entity.visualIdentity.image.length - 1]?.url ||
            entity.coverArt?.sources?.[0]?.url ||
            null;

          const tracks: NormalizedTrackMetadata[] = entity.trackList.map(
            (item: any, index: number) => {
              const artists = item.subtitle
                ? item.subtitle.split(/,\s*|\s*,\s*/).map((a: string) => a.trim()).filter(Boolean)
                : ['Unknown Artist'];

              return {
                title: item.title || 'Unknown Title',
                artists: artists.length > 0 ? artists : ['Unknown Artist'],
                album: playlistTitle,
                durationMs: typeof item.duration === 'number' ? item.duration : 0,
                isrc: null,
                artworkUrl: coverUrl,
                position: index,
              };
            }
          );

          return {
            source: 'spotify',
            playlistTitle,
            playlistDescription: entity.subtitle || '',
            playlistCoverUrl: coverUrl || undefined,
            externalUrl: `https://open.spotify.com/${target.type}/${target.id}`,
            totalTracks: tracks.length,
            tracks,
          };
        }
      }
    }
  } catch {
    // ignore client fallback error and throw main descriptive error below
  }

  throw new Error(
    'Unable to resolve Spotify playlist. Ensure the playlist is Public and not Private or Deleted on Spotify.'
  );
}
