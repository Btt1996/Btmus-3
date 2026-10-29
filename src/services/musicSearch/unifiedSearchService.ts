import {
  UnifiedMusicSource,
  UnifiedSearchResultItem,
  DownloadAvailability,
} from '../../types/unifiedSearch';
import { getAllTracks, findVerifiedCachedTrack } from '../db';
import { formatDuration } from '../../utils/id3Parser';
import { searchYouTubeSong } from './youtubeSearchService';
import { searchITunesTracks } from './itunesService';
import { searchSoundCloudTracks } from './soundcloudService';
import { fetchSpotifyPlaylist, parseSpotifyPlaylistId } from '../playlistImport/x1Spotify';
import { recordSearchHistory } from '../historyService';
import { NormalizedPlaylist } from '../../types/playlistImport';

export interface UnifiedSearchOptions {
  sourceFilter?: UnifiedMusicSource | 'all';
  limitPerSource?: number;
}

export interface UnifiedSearchResponse {
  query: string;
  sourceFilter: UnifiedMusicSource | 'all';
  results: UnifiedSearchResultItem[];
  spotifyPlaylist?: NormalizedPlaylist;
  sourceCounts: Record<string, number>;
  executionTimeMs: number;
}

/**
 * Searches across all requested sources, normalizes records into a single structure,
 * checks against verified local cache, and records history.
 */
export async function performUnifiedSearch(
  query: string,
  options: UnifiedSearchOptions = {}
): Promise<UnifiedSearchResponse> {
  const startTime = Date.now();
  const cleanQuery = query.trim();
  const sourceFilter = options.sourceFilter || 'all';
  const limit = options.limitPerSource || 15;

  if (!cleanQuery) {
    return {
      query: '',
      sourceFilter,
      results: [],
      sourceCounts: {},
      executionTimeMs: 0,
    };
  }

  // ---------------- SPOTIFY URL / URI DETECTION ----------------
  // If the query looks like a Spotify URL or URI, check whether it is a playlist or track
  const isSpotifyUrl =
    cleanQuery.includes('spotify.com') ||
    cleanQuery.startsWith('spotify:') ||
    /^[a-zA-Z0-9]{22}$/.test(cleanQuery);

  let detectedSpotifyPlaylist: NormalizedPlaylist | undefined;
  if (isSpotifyUrl && (sourceFilter === 'all' || sourceFilter === 'spotify')) {
    try {
      const pl = await fetchSpotifyPlaylist(cleanQuery);
      if (pl && pl.tracks && pl.tracks.length > 0) {
        detectedSpotifyPlaylist = pl;
      }
    } catch {
      // Non-fatal: continue with normal query search
    }
  }

  const results: UnifiedSearchResultItem[] = [];
  const sourceCounts: Record<string, number> = {
    local: 0,
    spotify: 0,
    youtube: 0,
    soundcloud: 0,
    telegram: 0,
    open_cc: 0,
  };

  const tasks: Promise<void>[] = [];

  // 1. LOCAL LIBRARY SEARCH
  if (sourceFilter === 'all' || sourceFilter === 'local') {
    tasks.push(
      (async () => {
        try {
          const allLocal = await getAllTracks();
          const q = cleanQuery.toLowerCase();
          const matched = allLocal.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.artist.toLowerCase().includes(q) ||
              t.album.toLowerCase().includes(q)
          );

          for (const t of matched.slice(0, limit)) {
            sourceCounts.local++;
            results.push({
              id: `local_${t.id}`,
              title: t.title,
              artist: t.artist,
              album: t.album,
              durationSeconds: t.duration,
              durationFormatted: formatDuration(t.duration),
              artworkUrl: t.artworkUrl,
              source: 'local',
              sourceId: t.id,
              downloadAvailability: 'in_library',
              availabilityReason: 'Stored locally in offline IndexedDB vault',
              localTrackId: t.id,
              isLocal: true,
              confidenceScore: 100,
              matchReason: 'Direct local library audio hit',
              importState: 'in_library',
            });
          }
        } catch (err) {
          console.warn('Local library search error:', err);
        }
      })()
    );
  }

  // 2. SPOTIFY (Playlist items or iTunes official commercial catalog)
  if (sourceFilter === 'all' || sourceFilter === 'spotify') {
    tasks.push(
      (async () => {
        try {
          if (detectedSpotifyPlaylist) {
            for (const t of detectedSpotifyPlaylist.tracks.slice(0, limit)) {
              sourceCounts.spotify++;
              // Check local cache
              const cached = await findVerifiedCachedTrack(t.title, t.artists[0] || '', t.durationMs);
              const durationSec = Math.round(t.durationMs / 1000);

              results.push({
                id: `sp_${t.position}_${t.title.substring(0, 10)}`,
                title: t.title,
                artist: t.artists.join(', ') || 'Unknown Artist',
                album: t.album || detectedSpotifyPlaylist.playlistTitle,
                durationSeconds: durationSec,
                durationFormatted: formatDuration(durationSec),
                artworkUrl: t.artworkUrl || detectedSpotifyPlaylist.playlistCoverUrl,
                source: 'spotify',
                sourceUrl: detectedSpotifyPlaylist.externalUrl,
                sourceId: `sp_${t.position}`,
                downloadAvailability: cached ? 'in_library' : 'downloadable',
                availabilityReason: cached
                  ? 'Already in local library'
                  : 'Ready for authorized recording match & download',
                localTrackId: cached ? cached.track.id : undefined,
                isLocal: !!cached,
                isrc: t.isrc,
                channelOrCurator: detectedSpotifyPlaylist.playlistTitle,
                importState: cached ? 'in_library' : 'idle',
              });
            }
          } else {
            // General query -> query official metadata via iTunes
            const itunesResults = await searchITunesTracks(cleanQuery, limit);
            for (const it of itunesResults) {
              sourceCounts.spotify++;
              const cached = await findVerifiedCachedTrack(
                it.trackName,
                it.artistName,
                it.trackTimeMillis
              );
              const durationSec = Math.round(it.trackTimeMillis / 1000);

              results.push({
                id: `sp_meta_${it.trackId}`,
                title: it.trackName,
                artist: it.artistName,
                album: it.collectionName,
                durationSeconds: durationSec,
                durationFormatted: formatDuration(durationSec),
                artworkUrl: it.artworkUrl100?.replace('100x100bb', '600x600bb'),
                source: 'spotify',
                sourceUrl: `https://music.apple.com/song/${it.trackId}`,
                sourceId: String(it.trackId),
                downloadAvailability: cached ? 'in_library' : 'downloadable',
                availabilityReason: cached
                  ? 'Already in local library'
                  : 'Official song metadata (30s preview available; download matches authorized CC/sync)',
                localTrackId: cached ? cached.track.id : undefined,
                isLocal: !!cached,
                audioStreamUrl: it.previewUrl || undefined,
                importState: cached ? 'in_library' : 'idle',
              });
            }
          }
        } catch (err) {
          console.warn('Spotify / iTunes search error:', err);
        }
      })()
    );
  }

  // 3. YOUTUBE SEARCH
  if (sourceFilter === 'all' || sourceFilter === 'youtube') {
    tasks.push(
      (async () => {
        try {
          const parts = cleanQuery.split(/\s*[-–—]\s*/);
          const title = parts[0] || cleanQuery;
          const artist = parts[1] || '';
          const ytResponse = await searchYouTubeSong(title, artist);

          for (const item of ytResponse.results.slice(0, limit)) {
            sourceCounts.youtube++;
            const cached = await findVerifiedCachedTrack(item.title, item.channelTitle);

            results.push({
              id: `yt_${item.id}`,
              title: item.title,
              artist: item.channelTitle,
              durationSeconds: item.durationSeconds,
              durationFormatted: item.durationFormatted,
              artworkUrl: item.thumbnailUrl,
              source: 'youtube',
              sourceUrl: item.videoUrl,
              sourceId: item.id,
              downloadAvailability: cached ? 'in_library' : 'downloadable',
              availabilityReason: cached
                ? 'Already downloaded in offline vault'
                : 'YouTube video stream available (Download matches authorized audio provider)',
              localTrackId: cached ? cached.track.id : undefined,
              isLocal: !!cached,
              confidenceScore: item.confidenceScore,
              matchReason: item.matchReason,
              channelOrCurator: item.channelTitle,
              importState: cached ? 'in_library' : 'idle',
            });
          }
        } catch (err) {
          console.warn('YouTube search error:', err);
        }
      })()
    );
  }

  // 4. SOUNDCLOUD SEARCH
  if (sourceFilter === 'all' || sourceFilter === 'soundcloud') {
    tasks.push(
      (async () => {
        try {
          const scResponse = await searchSoundCloudTracks(cleanQuery);
          for (const t of scResponse.tracks.slice(0, limit)) {
            sourceCounts.soundcloud++;
            const cached = await findVerifiedCachedTrack(t.title, t.user?.username || '');
            const durationSec = Math.round(t.duration / 1000);

            results.push({
              id: `sc_${t.id}`,
              title: t.title,
              artist: t.user?.username || 'SoundCloud Artist',
              durationSeconds: durationSec,
              durationFormatted: formatDuration(durationSec),
              artworkUrl: t.artwork_url || t.user?.avatar_url,
              source: 'soundcloud',
              sourceUrl: t.permalink_url,
              sourceId: String(t.id),
              downloadAvailability: cached
                ? 'in_library'
                : t.stream_url
                ? 'downloadable'
                : 'preview_only',
              availabilityReason: cached
                ? 'Already in library'
                : t.stream_url
                ? 'SoundCloud stream available for playback & authorized matching'
                : 'SoundCloud web stream available',
              localTrackId: cached ? cached.track.id : undefined,
              isLocal: !!cached,
              audioStreamUrl: t.stream_url,
              downloadUrl: t.stream_url,
              channelOrCurator: t.user?.username,
              importState: cached ? 'in_library' : 'idle',
            });
          }
        } catch (err) {
          console.warn('SoundCloud search error:', err);
        }
      })()
    );
  }

  // 5. TELEGRAM AUDIO HUB
  if (sourceFilter === 'all' || sourceFilter === 'telegram') {
    tasks.push(
      (async () => {
        try {
          const allTracks = await getAllTracks();
          const telegramTracks = allTracks.filter((t) => t.telegramSource && t.telegramSource.fileId);
          const q = cleanQuery.toLowerCase();
          const matched = telegramTracks.filter(
            (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
          );

          for (const t of matched.slice(0, limit)) {
            sourceCounts.telegram++;
            results.push({
              id: `tg_${t.id}`,
              title: t.title,
              artist: t.artist,
              album: t.album,
              durationSeconds: t.duration,
              durationFormatted: formatDuration(t.duration),
              artworkUrl: t.artworkUrl,
              source: 'telegram',
              sourceId: t.id,
              downloadAvailability: 'in_library',
              availabilityReason: 'Synced from Telegram Hub into local library',
              localTrackId: t.id,
              isLocal: true,
              channelOrCurator: t.telegramSource?.chatTitle || 'Telegram Audio Hub',
              importState: 'in_library',
            });
          }
        } catch (err) {
          console.warn('Telegram search error:', err);
        }
      })()
    );
  }

  // 6. OPEN CREATIVE COMMONS & ARCHIVE CATALOG (Jamendo & Internet Archive)
  if (sourceFilter === 'all' || sourceFilter === 'open_cc') {
    tasks.push(
      (async () => {
        try {
          const clean = encodeURIComponent(cleanQuery.replace(/[^a-zA-Z0-9\s]/g, ' ').trim());
          if (!clean) return;

          // Jamendo Open API
          const jamUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=96cf1c7c&format=json&limit=5&namesearch=${clean}&include=licenses`;
          const jamRes = await fetch(jamUrl, { signal: AbortSignal.timeout(4500) });
          if (jamRes.ok) {
            const data = await jamRes.json();
            for (const item of (data.results || []).slice(0, 5)) {
              sourceCounts.open_cc++;
              const durationSec = Number(item.duration) || 0;
              const cached = await findVerifiedCachedTrack(item.name, item.artist_name);

              results.push({
                id: `jam_${item.id}`,
                title: item.name,
                artist: item.artist_name,
                album: item.album_name || 'Jamendo Music',
                durationSeconds: durationSec,
                durationFormatted: formatDuration(durationSec),
                artworkUrl: item.image || item.album_image,
                source: 'open_cc',
                sourceUrl: item.shareurl,
                sourceId: item.id,
                downloadAvailability: cached ? 'in_library' : 'downloadable',
                availabilityReason: cached
                  ? 'Already in library'
                  : 'Creative Commons Open Music: Direct MP3 download permitted',
                localTrackId: cached ? cached.track.id : undefined,
                isLocal: !!cached,
                audioStreamUrl: item.audio,
                downloadUrl: item.audiodownload || item.audio,
                channelOrCurator: 'Jamendo CC',
                confidenceScore: 95,
                matchReason: 'Direct Open CC recording hit',
                importState: cached ? 'in_library' : 'idle',
              });
            }
          }
        } catch (err) {
          console.warn('Open CC search error:', err);
        }
      })()
    );
  }

  // Wait for parallel requests to complete
  await Promise.all(tasks);

  // Record query into persistent history
  await recordSearchHistory(cleanQuery, sourceFilter, results.length);

  // If a Spotify playlist was parsed, record into playlist history
  if (detectedSpotifyPlaylist) {
    await recordSearchHistory(detectedSpotifyPlaylist.playlistTitle, 'spotify_playlist', detectedSpotifyPlaylist.totalTracks);
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    query: cleanQuery,
    sourceFilter,
    results,
    spotifyPlaylist: detectedSpotifyPlaylist,
    sourceCounts,
    executionTimeMs,
  };
}
