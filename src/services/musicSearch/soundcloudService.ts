/**
 * Official SoundCloud Integration Service
 * Follows official developer documentation (https://developers.soundcloud.com/docs/api/guide)
 * Provides official track search (when client_id is configured) and official oEmbed widget previews.
 */

export interface SoundCloudTrack {
  id: number | string;
  title: string;
  user: {
    username: string;
    avatar_url?: string;
  };
  duration: number; // ms
  artwork_url?: string;
  permalink_url: string;
  stream_url?: string;
  genre?: string;
  playback_count?: number;
}

export interface SoundCloudSearchResponse {
  configured: boolean;
  tracks: SoundCloudTrack[];
  message: string;
}

export async function searchSoundCloudTracks(
  query: string,
  clientId?: string
): Promise<SoundCloudSearchResponse> {
  const clean = query.trim();
  const cId = clientId?.trim() || '';

  // Query server proxy
  try {
    const url = `/api/soundcloud/search?q=${encodeURIComponent(clean)}&client_id=${encodeURIComponent(cId)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return {
        configured: data.configured,
        tracks: data.tracks || [],
        message: data.message || '',
      };
    }
  } catch (err) {
    console.warn('SoundCloud search request error:', err);
  }

  return {
    configured: false,
    tracks: [],
    message: 'SoundCloud requires a registered developer Client ID for track search. Public oEmbed playback is supported.',
  };
}

/**
 * Resolves SoundCloud oEmbed data for any public track URL
 * Uses official public oEmbed standard (no token required)
 */
export async function getSoundCloudOEmbed(trackUrl: string): Promise<{ html: string; title: string; author_name: string; thumbnail_url?: string } | null> {
  try {
    const res = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trackUrl)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('SoundCloud oEmbed failed:', err);
  }
  return null;
}
