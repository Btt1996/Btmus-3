import React, { useState } from 'react';
import {
  Search,
  Music,
  Play,
  Pause,
  ExternalLink,
  Plus,
  Check,
  Loader2,
  Sparkles,
  Radio,
  Youtube,
  ShieldCheck,
  Info,
  Disc,
  ListMusic,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { searchITunesTracks, ITunesTrack } from '../../services/musicSearch/itunesService';
import { searchYouTubeSong, YouTubeSearchResult } from '../../services/musicSearch/youtubeSearchService';
import { searchSoundCloudTracks, SoundCloudTrack } from '../../services/musicSearch/soundcloudService';
import { fetchSpotifyPlaylist } from '../../services/playlistImport/x1Spotify';
import { NormalizedPlaylist } from '../../types/playlistImport';
import { useMusic } from '../../context/MusicContext';
import { Track, Playlist } from '../../types/music';
import { saveTrack, savePlaylist } from '../../services/db';
import { PlaylistImportModal } from '../import/PlaylistImportModal';

type SearchEngine = 'itunes' | 'spotify' | 'youtube' | 'soundcloud';

export const SearchScreen: React.FC = () => {
  const { playTrack, showToast, refreshLibrary } = useMusic();

  const [query, setQuery] = useState('');
  const [activeEngine, setActiveEngine] = useState<SearchEngine>('itunes');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [itunesResults, setItunesResults] = useState<ITunesTrack[]>([]);
  const [spotifyResult, setSpotifyResult] = useState<NormalizedPlaylist | null>(null);
  const [youtubeResults, setYoutubeResults] = useState<YouTubeSearchResult[]>([]);
  const [soundcloudResults, setSoundCloudResults] = useState<SoundCloudTrack[]>([]);
  const [soundCloudNotice, setSoundCloudNotice] = useState<string | null>(null);

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activePreviewVideoId, setActivePreviewVideoId] = useState<string | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<number | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    setIsLoading(true);
    setError(null);

    try {
      if (activeEngine === 'itunes') {
        const results = await searchITunesTracks(clean);
        setItunesResults(results);
        if (results.length === 0) setError(`No songs found on iTunes for "${clean}". Try another title or artist.`);
      } else if (activeEngine === 'spotify') {
        const result = await fetchSpotifyPlaylist(clean);
        setSpotifyResult(result);
        if (!result.tracks || result.tracks.length === 0) {
          setError(`No tracks found in the provided Spotify link.`);
        }
      } else if (activeEngine === 'youtube') {
        const parts = clean.split(/\s*[-–—]\s*/);
        const title = parts[0];
        const artist = parts[1] || '';
        const data = await searchYouTubeSong(title, artist);
        setYoutubeResults(data.results);
        if (data.results.length === 0) setError(`No YouTube recordings found for "${clean}".`);
      } else if (activeEngine === 'soundcloud') {
        const sc = await searchSoundCloudTracks(clean);
        setSoundCloudResults(sc.tracks);
        setSoundCloudNotice(sc.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleITunesPreview = (track: ITunesTrack) => {
    if (previewTrackId === track.trackId && previewAudio) {
      previewAudio.pause();
      setPreviewTrackId(null);
      return;
    }

    if (previewAudio) {
      previewAudio.pause();
    }

    if (!track.previewUrl) {
      showToast('No audio preview stream available for this track.');
      return;
    }

    const audio = new Audio(track.previewUrl);
    audio.play().catch(() => showToast('Could not play preview.'));
    audio.onended = () => setPreviewTrackId(null);
    setPreviewAudio(audio);
    setPreviewTrackId(track.trackId);
  };

  const handlePlayITunesAsTrack = (it: ITunesTrack) => {
    if (!it.previewUrl) {
      showToast('No playable stream available for this search result.');
      return;
    }

    const newTrack: Track = {
      id: `itunes_${it.trackId}`,
      title: it.trackName,
      artist: it.artistName,
      album: it.collectionName,
      duration: Math.round(it.trackTimeMillis / 1000) || 30,
      fileSize: 500000,
      mimeType: 'audio/m4a',
      fileName: `${it.trackName}.m4a`,
      downloadDate: Date.now(),
      isFavorite: false,
      playCount: 0,
      artworkUrl: it.artworkUrl600,
      previewUrl: it.previewUrl,
    };

    playTrack(newTrack);
    showToast(`Playing "${it.trackName}"`);
  };

  // One-click save Spotify playlist metadata to local library
  const handleSaveSpotifyPlaylist = async () => {
    if (!spotifyResult) return;
    try {
      const createdTrackIds: string[] = [];
      for (const [idx, t] of spotifyResult.tracks.entries()) {
        const trackId = `spotify_${Date.now()}_${idx}`;
        const newTrack: Track = {
          id: trackId,
          title: t.title,
          artist: t.artists.join(', ') || 'Unknown Artist',
          album: t.album || spotifyResult.playlistTitle,
          duration: Math.round(t.durationMs / 1000) || 180,
          fileSize: 0,
          mimeType: 'audio/mpeg',
          fileName: `${t.title}.mp3`,
          downloadDate: Date.now(),
          isFavorite: false,
          playCount: 0,
          artworkUrl: t.artworkUrl || spotifyResult.playlistCoverUrl,
          telegramSource: {
            chatTitle: 'Spotify Import',
            sourceType: 'manual',
          },
        };
        // Save dummy/metadata track
        await saveTrack(newTrack, new Blob([], { type: 'audio/mpeg' }));
        createdTrackIds.push(trackId);
      }

      const newPl: Playlist = {
        id: `pl_spotify_${Date.now()}`,
        name: spotifyResult.playlistTitle,
        description: spotifyResult.playlistDescription,
        sourceType: 'manual',
        trackIds: createdTrackIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        coverArtworkUrl: spotifyResult.playlistCoverUrl,
      };

      await savePlaylist(newPl);
      await refreshLibrary();
      showToast(`Added "${spotifyResult.playlistTitle}" (${createdTrackIds.length} songs) to Library!`);
    } catch (err: unknown) {
      showToast('Error saving playlist: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 max-w-2xl mx-auto w-full select-none pb-28">
      {/* Search Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C8F169] text-[#292820] flex items-center justify-center font-bold shadow-sm shadow-[#C8F169]/30">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-black text-[#176B67] dark:text-[#C8F169] uppercase tracking-wider">
                X1 & X2 MUSIC DISCOVERY
              </span>
              <h1 className="text-xl font-black text-[#292820] dark:text-[#E8E9DD] tracking-tight">
                Search & Retrieval
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Engine Switcher Capsule with RESTORED SPOTIFY ENTRY */}
      <div className="p-1 rounded-2xl bg-[#E8DDC9]/80 dark:bg-[#141815]/90 backdrop-blur-xl border border-[#176B67]/25 dark:border-[#C8F169]/30 flex items-center gap-1 text-xs font-bold shadow-xs">
        {/* iTunes */}
        <button
          type="button"
          onClick={() => {
            setActiveEngine('itunes');
            setError(null);
          }}
          className={`flex-1 py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeEngine === 'itunes'
              ? 'bg-[#C8F169] text-[#292820] shadow-sm font-black'
              : 'text-[#777267] dark:text-[#92998F] hover:text-[#176B67] dark:hover:text-[#C8F169]'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>iTunes</span>
        </button>

        {/* RESTORED SPOTIFY MENU ENTRY */}
        <button
          type="button"
          onClick={() => {
            setActiveEngine('spotify');
            setError(null);
          }}
          className={`flex-1 py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeEngine === 'spotify'
              ? 'bg-[#1DB954] text-white shadow-sm font-black'
              : 'text-[#777267] dark:text-[#92998F] hover:text-[#1DB954]'
          }`}
        >
          <Disc className="w-3.5 h-3.5 text-[#1DB954] fill-current" />
          <span>Spotify</span>
        </button>

        {/* YouTube */}
        <button
          type="button"
          onClick={() => {
            setActiveEngine('youtube');
            setError(null);
          }}
          className={`flex-1 py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeEngine === 'youtube'
              ? 'bg-[#C8F169] text-[#292820] shadow-sm font-black'
              : 'text-[#777267] dark:text-[#92998F] hover:text-[#176B67] dark:hover:text-[#C8F169]'
          }`}
        >
          <Youtube className="w-3.5 h-3.5 text-rose-500" />
          <span>YouTube</span>
        </button>

        {/* SoundCloud */}
        <button
          type="button"
          onClick={() => {
            setActiveEngine('soundcloud');
            setError(null);
          }}
          className={`flex-1 py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
            activeEngine === 'soundcloud'
              ? 'bg-[#C8F169] text-[#292820] shadow-sm font-black'
              : 'text-[#777267] dark:text-[#92998F] hover:text-[#176B67] dark:hover:text-[#C8F169]'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-amber-500" />
          <span>SoundCloud</span>
        </button>
      </div>

      {/* Main Search Input Form */}
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            activeEngine === 'spotify'
              ? 'Paste Spotify playlist URL (https://open.spotify.com/playlist/...)'
              : activeEngine === 'youtube'
              ? 'Song Title — Artist Name (e.g. Starboy — The Weeknd)'
              : activeEngine === 'itunes'
              ? 'Search song, artist, or album (e.g. Blinding Lights)...'
              : 'Search SoundCloud tracks...'
          }
          className="w-full px-4 py-3.5 pl-11 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/90 border border-[#176B67]/25 dark:border-[#C8F169]/30 text-xs sm:text-sm text-[#292820] dark:text-[#E8E9DD] placeholder-[#777267] dark:placeholder-[#92998F] focus:outline-none focus:border-[#176B67] dark:focus:border-[#C8F169] transition shadow-xs"
        />
        <Search className="w-4 h-4 text-[#176B67] dark:text-[#C8F169] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />

        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold transition active:scale-95 disabled:opacity-40 shadow-xs"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : activeEngine === 'spotify' ? 'Resolve' : 'Search'}
        </button>
      </form>

      {/* Query Presets Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-medium no-scrollbar">
        <span className="text-[10px] text-[#176B67] dark:text-[#C8F169] shrink-0 uppercase tracking-wider font-bold">
          Quick:
        </span>
        {activeEngine === 'spotify'
          ? [
              'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
              'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
            ].map((preset, idx) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQuery(preset);
                  setTimeout(() => {
                    fetchSpotifyPlaylist(preset).then(setSpotifyResult);
                  }, 50);
                }}
                className="px-2.5 py-1 rounded-xl bg-[#1DB954]/15 text-[#1DB954] border border-[#1DB954]/30 shrink-0 font-mono text-[10px] hover:border-[#1DB954] transition"
              >
                Spotify Top Hits {idx + 1}
              </button>
            ))
          : ['The Weeknd — Blinding Lights', 'Daft Punk — Get Lucky', 'Miley Cyrus — Flowers', 'Queen — Bohemian Rhapsody'].map(
              (preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setQuery(preset);
                    setTimeout(() => {
                      if (activeEngine === 'itunes') searchITunesTracks(preset).then(setItunesResults);
                      else if (activeEngine === 'youtube') searchYouTubeSong(preset).then((r) => setYoutubeResults(r.results));
                    }, 50);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#E8DDC9]/70 dark:bg-[#141815] text-[#292820] dark:text-[#E8E9DD] border border-[#176B67]/20 dark:border-[#C8F169]/25 shrink-0 hover:border-[#176B67] dark:hover:border-[#C8F169] transition"
                >
                  {preset}
                </button>
              )
            )}
      </div>

      {/* Error / Notice Display */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* RESULTS 1: APPLE ITUNES SONGS */}
      {activeEngine === 'itunes' && itunesResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">
            <span>Apple iTunes Songs ({itunesResults.length})</span>
            <span className="text-[10px] font-mono text-[#176B67] dark:text-[#C8F169]">
              600x600 Retina Artwork
            </span>
          </div>

          <div className="space-y-2">
            {itunesResults.map((t) => (
              <div
                key={t.trackId}
                className="p-3 rounded-2xl bg-[#E8DDC9]/60 dark:bg-[#141815]/70 backdrop-blur-xl border border-[#176B67]/20 dark:border-[#C8F169]/25 flex items-center justify-between gap-3 transition hover:border-[#176B67] dark:hover:border-[#C8F169]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 shadow-sm relative group border border-[#176B67]/20 dark:border-[#C8F169]/30">
                    <img src={t.artworkUrl600} alt={t.trackName} className="w-full h-full object-cover" />
                    {t.previewUrl && (
                      <button
                        onClick={() => toggleITunesPreview(t)}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition"
                      >
                        {previewTrackId === t.trackId ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-[#C8F169]" />}
                      </button>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                      {t.trackName}
                    </div>
                    <div className="text-[11px] text-[#777267] dark:text-[#92998F] truncate mt-0.5">
                      {t.artistName} • {t.collectionName}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {t.previewUrl && (
                    <button
                      onClick={() => toggleITunesPreview(t)}
                      className="p-2 rounded-xl bg-[#176B67]/15 dark:bg-[#C8F169]/15 text-[#176B67] dark:text-[#C8F169] text-xs font-bold transition active:scale-95"
                      title="Preview 30-second AAC stream"
                    >
                      {previewTrackId === t.trackId ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => handlePlayITunesAsTrack(t)}
                    className="px-3 py-1.5 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold transition active:scale-95 shadow-xs"
                  >
                    Play
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RESULTS 2: SPOTIFY RESOLVER (RESTORED FEATURE) */}
      {activeEngine === 'spotify' && (
        <div className="space-y-3">
          {/* Spotify info and bridge card */}
          <div className="p-4 rounded-3xl bg-[#1DB954]/10 dark:bg-[#1DB954]/15 border border-[#1DB954]/30 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-[#1DB954]">
                <Disc className="w-4 h-4 fill-current" />
                <span>Official Spotify Playlist Resolver (X1)</span>
              </div>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-2.5 py-1 rounded-xl bg-[#1DB954] text-white text-[10px] font-bold flex items-center gap-1 shadow-xs active:scale-95 transition"
              >
                <Download className="w-3 h-3" />
                <span>Full Import Modal</span>
              </button>
            </div>
            <p className="text-[11px] text-[#292820] dark:text-[#E8E9DD] leading-relaxed">
              Paste any public Spotify playlist URL above to resolve its tracklist, artwork, and metadata. You can save the playlist structure to your library or run the audio retrieval engine.
            </p>
          </div>

          {/* Resolved Spotify Playlist Card */}
          {spotifyResult && (
            <div className="p-4 rounded-3xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 border border-[#1DB954]/30 space-y-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-zinc-200 dark:bg-zinc-800 shadow-sm border border-[#1DB954]/40">
                  {spotifyResult.playlistCoverUrl ? (
                    <img
                      src={spotifyResult.playlistCoverUrl}
                      alt={spotifyResult.playlistTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#1DB954]">
                      <ListMusic className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-[#1DB954] text-white text-[9px] font-bold uppercase font-mono">
                      Spotify
                    </span>
                    <span className="text-[10px] font-mono text-[#777267] dark:text-[#92998F]">
                      {spotifyResult.totalTracks} tracks
                    </span>
                  </div>
                  <h3 className="text-base font-black text-[#292820] dark:text-[#E8E9DD] truncate mt-0.5">
                    {spotifyResult.playlistTitle}
                  </h3>
                  {spotifyResult.playlistDescription && (
                    <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate">
                      {spotifyResult.playlistDescription}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-[#292820]/10 dark:border-white/10">
                <button
                  onClick={handleSaveSpotifyPlaylist}
                  className="flex-1 py-2.5 rounded-xl bg-[#1DB954] text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Save to My Playlists</span>
                </button>
                {spotifyResult.externalUrl && (
                  <a
                    href={spotifyResult.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl bg-[#292820]/10 dark:bg-white/10 text-[#292820] dark:text-[#E8E9DD] hover:text-[#1DB954] transition"
                    title="Open on Spotify"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Track list preview */}
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 pt-1">
                {spotifyResult.tracks.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-xl bg-[#E8DDC9]/50 dark:bg-[#141815] border border-[#292820]/10 dark:border-white/10 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                        {idx + 1}. {t.title}
                      </div>
                      <div className="text-[10px] text-[#777267] dark:text-[#92998F] truncate">
                        {t.artists.join(', ')}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-[#777267] dark:text-[#92998F] shrink-0">
                      {Math.floor(t.durationMs / 60000)}:
                      {String(Math.floor((t.durationMs % 60000) / 1000)).padStart(2, '0')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* RESULTS 3: YOUTUBE SEARCH RESULTS (X2) */}
      {activeEngine === 'youtube' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 border border-[#176B67]/25 dark:border-[#C8F169]/30 space-y-1 text-xs text-[#777267] dark:text-[#92998F] leading-relaxed">
            <div className="font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" />
              <span>YouTube Search & Preview Architecture</span>
            </div>
            <p className="text-[11px]">
              YouTube candidate ranking scores title and artist matches. You can preview videos in-app. In compliance with YouTube Terms of Service, YouTube content does not support unauthorized offline downloading.
            </p>
          </div>

          {youtubeResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">
                <span>Recordings Found ({youtubeResults.length})</span>
                <span className="text-[10px] font-mono text-[#176B67] dark:text-[#C8F169]">
                  Candidate Match Ranking
                </span>
              </div>

              <div className="space-y-2">
                {youtubeResults.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 rounded-2xl bg-[#E8DDC9]/60 dark:bg-[#141815]/70 backdrop-blur-xl border border-[#176B67]/20 dark:border-[#C8F169]/25 space-y-2 transition hover:border-[#176B67] dark:hover:border-[#C8F169]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="w-16 h-12 rounded-xl bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 shadow-sm relative border border-[#176B67]/20">
                        <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                        {v.isOfficialAudio && (
                          <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[#C8F169] text-[8px] font-mono font-bold">
                            OFFICIAL
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] line-clamp-1">
                          {v.title}
                        </div>
                        <div className="text-[11px] text-[#777267] dark:text-[#92998F] truncate mt-0.5">
                          {v.channelTitle}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9.5px] font-mono font-bold text-[#176B67] dark:text-[#C8F169]">
                            {v.confidenceScore}% Confidence
                          </span>
                          <span className="text-[9.5px] text-[#777267] dark:text-[#92998F]">
                            • {v.matchReason}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          onClick={() => setActivePreviewVideoId(v.id)}
                          className="px-3 py-1.5 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold transition active:scale-95 shadow-xs flex items-center gap-1"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* RESULTS 4: SOUNDCLOUD RESULTS */}
      {activeEngine === 'soundcloud' && (
        <div className="space-y-3">
          {soundCloudNotice && (
            <div className="p-3.5 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 border border-[#176B67]/25 dark:border-[#C8F169]/30 text-xs text-[#777267] dark:text-[#92998F] space-y-1.5">
              <div className="font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" />
                <span>SoundCloud Integration Status</span>
              </div>
              <p className="text-[11px]">{soundCloudNotice}</p>
              <div className="pt-1">
                <a
                  href="https://developers.soundcloud.com/docs/api/guide"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-[#176B67] dark:text-[#C8F169] hover:underline flex items-center gap-1"
                >
                  Official Developer Documentation <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* IN-APP YOUTUBE PREVIEW MODAL */}
      {activePreviewVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-[#E8DDC9] dark:bg-[#141815] border border-[#176B67]/30 dark:border-[#C8F169]/30 overflow-hidden shadow-2xl space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-rose-500" />
                <span className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">
                  YouTube Recording Preview
                </span>
              </div>
              <button
                onClick={() => setActivePreviewVideoId(null)}
                className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-[#777267] dark:text-[#92998F]"
              >
                ✕
              </button>
            </div>

            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-inner">
              <iframe
                src={`https://www.youtube.com/embed/${activePreviewVideoId}?autoplay=1&enablejsapi=1`}
                title="YouTube Preview"
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="flex justify-between items-center text-[10px] text-[#777267] dark:text-[#92998F] pt-1">
              <span>Streaming directly via official YouTube player</span>
              <button
                onClick={() => setActivePreviewVideoId(null)}
                className="px-3 py-1 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Import Modal for full audio matching */}
      <PlaylistImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};
