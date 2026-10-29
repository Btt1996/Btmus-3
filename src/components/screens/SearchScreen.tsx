import React, { useState, useEffect, useRef } from 'react';
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
  History,
  Send,
  Library,
  Layers,
  MoreVertical,
  Volume2,
  X,
  AlertCircle,
  Copy,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UnifiedMusicSource,
  UnifiedSearchResultItem,
  DownloadAvailability,
} from '../../types/unifiedSearch';
import { performUnifiedSearch } from '../../services/musicSearch/unifiedSearchService';
import { resolveAndDownloadSingleTrack } from '../../services/playlistImport/x2Engine';
import { useMusic } from '../../context/MusicContext';
import { Track } from '../../types/music';
import { formatDuration } from '../../utils/id3Parser';
import { MusicHistoryModal } from '../common/MusicHistoryModal';
import { SpotifyPlaylistReviewModal } from '../import/SpotifyPlaylistReviewModal';
import { TelegramDiscoveryModal } from '../import/TelegramDiscoveryModal';
import { AddToPlaylistModal } from '../player/AddToPlaylistModal';
import { NormalizedPlaylist, DEFAULT_IMPORT_SETTINGS } from '../../types/playlistImport';

export const SearchScreen: React.FC = () => {
  const { playTrack, showToast, refreshLibrary, tracks: localTracks, addToQueue } = useMusic();

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<UnifiedMusicSource | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search Results
  const [results, setResults] = useState<UnifiedSearchResultItem[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [detectedPlaylist, setDetectedPlaylist] = useState<NormalizedPlaylist | null>(null);

  // Per-item download progress state: [itemId]: { percent, status, error }
  const [itemProgress, setItemProgress] = useState<
    Record<string, { percent: number; status: string; error?: string }>
  >({});

  // Audio preview playback state
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Modals state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [activeAddToPlaylistTrack, setActiveAddToPlaylistTrack] = useState<Track | null>(null);
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);

  // Stop preview audio when unmounting
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const clean = (customQuery !== undefined ? customQuery : query).trim();
    if (!clean) return;

    setIsLoading(true);
    setError(null);
    setDetectedPlaylist(null);

    // Stop existing preview audio
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewItemId(null);
    }

    try {
      const res = await performUnifiedSearch(clean, {
        sourceFilter,
        limitPerSource: 15,
      });

      setResults(res.results);
      setSourceCounts(res.sourceCounts);

      if (res.spotifyPlaylist) {
        setDetectedPlaylist(res.spotifyPlaylist);
        showToast(`Spotify Playlist detected: "${res.spotifyPlaylist.playlistTitle}"`);
      }

      if (res.results.length === 0) {
        setError(`No tracks found for "${clean}". Try another title or select "All Sources".`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search request failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Source tab change
  const handleSourceTabChange = (source: UnifiedMusicSource | 'all') => {
    setSourceFilter(source);
    if (query.trim()) {
      setTimeout(() => {
        handleSearch();
      }, 50);
    }
  };

  // Preview Playback Handler
  const handleTogglePreview = (item: UnifiedSearchResultItem) => {
    // If it's a local track in IndexedDB, use standard full player!
    if (item.isLocal && item.localTrackId) {
      const track = localTracks.find((t) => t.id === item.localTrackId);
      if (track) {
        playTrack(track);
        return;
      }
    }

    // If item has audioStreamUrl
    if (!item.audioStreamUrl) {
      showToast('Audio preview stream not available for this record');
      return;
    }

    if (previewItemId === item.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewItemId(null);
      }
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const audio = new Audio(item.audioStreamUrl);
    previewAudioRef.current = audio;
    setPreviewItemId(item.id);

    audio.play().catch((err) => {
      console.warn('Preview play blocked:', err);
      showToast('Preview playback blocked by browser');
      setPreviewItemId(null);
    });

    audio.onended = () => {
      setPreviewItemId(null);
    };
  };

  // Individual Track Download Handler (Requirement 1, 3, 4)
  const handleDownloadTrack = async (item: UnifiedSearchResultItem) => {
    if (item.isLocal) {
      showToast('Track is already downloaded in your library');
      return;
    }

    setItemProgress((prev) => ({
      ...prev,
      [item.id]: { percent: 15, status: 'checking' },
    }));

    try {
      const result = await resolveAndDownloadSingleTrack(
        {
          title: item.title,
          artist: item.artist,
          album: item.album,
          durationMs: item.durationSeconds ? item.durationSeconds * 1000 : undefined,
          artworkUrl: item.artworkUrl,
          isrc: item.isrc,
          source: item.source,
        },
        DEFAULT_IMPORT_SETTINGS,
        (percent, statusMsg) => {
          setItemProgress((prev) => ({
            ...prev,
            [item.id]: { percent, status: statusMsg },
          }));
        }
      );

      if (result.success && result.track) {
        setItemProgress((prev) => ({
          ...prev,
          [item.id]: { percent: 100, status: 'completed' },
        }));

        // Mark item as local in UI
        setResults((prev) =>
          prev.map((r) =>
            r.id === item.id
              ? {
                  ...r,
                  isLocal: true,
                  localTrackId: result.track?.id,
                  downloadAvailability: 'in_library',
                }
              : r
          )
        );

        showToast(`Downloaded "${item.title}" to offline library!`);
        await refreshLibrary();
      } else {
        const errorMsg = result.error || 'No authorized audio provider could supply this recording';
        setItemProgress((prev) => ({
          ...prev,
          [item.id]: { percent: 0, status: 'unavailable', error: errorMsg },
        }));
        showToast(errorMsg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setItemProgress((prev) => ({
        ...prev,
        [item.id]: { percent: 0, status: 'failed', error: msg },
      }));
      showToast(`Download failed: ${msg}`);
    }
  };

  // Add to Queue handler
  const handleAddToQueue = (item: UnifiedSearchResultItem) => {
    setActiveMenuTrackId(null);
    if (item.isLocal && item.localTrackId) {
      const t = localTracks.find((lt) => lt.id === item.localTrackId);
      if (t) {
        addToQueue(t);
        showToast(`Added "${item.title}" to queue`);
        return;
      }
    }
    showToast('Download track first to add to offline queue');
  };

  const sourceTabs: { id: UnifiedMusicSource | 'all'; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'all', label: 'All Sources', icon: Layers },
    { id: 'youtube', label: 'YouTube', icon: Youtube },
    { id: 'spotify', label: 'Spotify', icon: ListMusic },
    { id: 'soundcloud', label: 'SoundCloud', icon: Disc },
    { id: 'telegram', label: 'Telegram Hub', icon: Send },
    { id: 'local', label: 'Local Library', icon: Library },
    { id: 'open_cc', label: 'Open CC', icon: Sparkles },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F3EBDD] dark:bg-[#080A09] text-[#292820] dark:text-[#E8E9DD] select-none transition-colors duration-300">
      {/* Top Bar with History & Modals triggers */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-[#292820]/10 dark:border-white/10 shrink-0">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#176B67] dark:text-[#C8F169] font-bold">
            Unified Discovery & Import
          </span>
          <h1 className="text-xl font-bold tracking-tight text-[#292820] dark:text-[#E8E9DD]">
            Music Search
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Telegram Hub Modal Button */}
          <button
            onClick={() => setIsTelegramModalOpen(true)}
            className="p-2 rounded-xl bg-[#02ABB0]/15 text-[#02ABB0] hover:bg-[#02ABB0]/25 active:scale-95 transition"
            title="Telegram Music Hub"
          >
            <Send className="w-4 h-4" />
          </button>

          {/* Persistent History Button */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 rounded-xl bg-[#176B67]/15 dark:bg-[#C8F169]/15 text-[#176B67] dark:text-[#C8F169] hover:opacity-80 active:scale-95 transition flex items-center gap-1.5"
            title="Music & Search History"
          >
            <History className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">History</span>
          </button>
        </div>
      </div>

      {/* Unified Search Input Bar */}
      <div className="p-4 shrink-0">
        <form onSubmit={handleSearch} className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, artists, albums, or Spotify URLs..."
            className="w-full pl-11 pr-24 py-3 rounded-2xl bg-white/80 dark:bg-[#141815]/80 backdrop-blur-xl border border-[#292820]/15 dark:border-white/15 text-sm font-medium text-[#292820] dark:text-[#E8E9DD] placeholder:text-[#777267] shadow-sm focus:outline-none focus:border-[#176B67] dark:focus:border-[#C8F169] transition"
          />
          <Search className="w-5 h-5 text-[#777267] absolute left-3.5 pointer-events-none" />

          <div className="absolute right-2 flex items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1.5 rounded-lg text-[#777267] hover:text-[#292820] dark:hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold active:scale-95 transition disabled:opacity-50 flex items-center gap-1 shadow-xs"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Search</span>}
            </button>
          </div>
        </form>

        {/* Source Selector Filter Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pt-3 pb-1 -mx-4 px-4">
          {sourceTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = sourceFilter === tab.id;
            const count = sourceCounts[tab.id];

            return (
              <button
                key={tab.id}
                onClick={() => handleSourceTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09] shadow-sm'
                    : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {count !== undefined && count > 0 && (
                  <span className="text-[10px] font-mono opacity-80">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detected Spotify Playlist Banner */}
      {detectedPlaylist && (
        <div className="mx-4 mb-3 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {detectedPlaylist.playlistCoverUrl ? (
              <img
                src={detectedPlaylist.playlistCoverUrl}
                alt=""
                className="w-11 h-11 rounded-xl object-cover border border-emerald-500/20 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                <ListMusic className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-bold">
                Spotify Playlist Detected
              </span>
              <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                {detectedPlaylist.playlistTitle}
              </h4>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F] font-mono">
                {detectedPlaylist.totalTracks} tracks ready for track-by-track download
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsSpotifyModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold shadow-xs active:scale-95 transition flex items-center gap-1 shrink-0"
          >
            <span>Inspect All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results List */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-2.5">
        {isLoading ? (
          <div className="p-12 text-center text-[#777267] dark:text-[#92998F] text-xs font-mono flex flex-col items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#176B67] dark:text-[#C8F169] mb-3" />
            <span>Searching across YouTube, Spotify, Local, and Open CC catalogs...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center select-none text-[#777267] dark:text-[#92998F]">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <h3 className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD]">
              Discover Music Anywhere
            </h3>
            <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed">
              Search by song name, artist, album, or paste a Spotify link. Every result includes playback and download actions when permitted.
            </p>
          </div>
        ) : (
          results.map((item) => {
            const progress = itemProgress[item.id];
            const isDownloading = progress && progress.status !== 'completed' && progress.percent > 0;
            const isDownloaded = item.isLocal || progress?.status === 'completed';
            const isPreviewing = previewItemId === item.id;

            return (
              <div
                key={item.id}
                className="group p-3 rounded-2xl bg-white/70 dark:bg-[#141815]/70 border border-[#292820]/10 dark:border-white/10 hover:border-[#176B67]/40 dark:hover:border-[#C8F169]/40 transition-all duration-200 flex items-center justify-between gap-3 shadow-xs"
              >
                {/* Left: Thumbnail + Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Artwork with Play Preview Overlay */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#292820]/10 dark:bg-white/10 shrink-0">
                    {item.artworkUrl ? (
                      <img
                        src={item.artworkUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#777267]">
                        <Music className="w-5 h-5" />
                      </div>
                    )}

                    {/* Play / Pause Overlay Button */}
                    <button
                      onClick={() => handleTogglePreview(item)}
                      className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
                        isPreviewing
                          ? 'bg-black/60 text-[#C8F169] opacity-100'
                          : 'bg-black/40 text-white opacity-0 group-hover:opacity-100 active:scale-95'
                      }`}
                      title={isPreviewing ? 'Stop preview' : 'Play preview stream'}
                    >
                      {isPreviewing ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>
                  </div>

                  {/* Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                        {item.title}
                      </h4>
                      {/* Source Badge */}
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                          item.source === 'youtube'
                            ? 'bg-red-500/15 text-red-500'
                            : item.source === 'spotify'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : item.source === 'soundcloud'
                            ? 'bg-amber-500/15 text-amber-500'
                            : item.source === 'telegram'
                            ? 'bg-[#02ABB0]/15 text-[#02ABB0]'
                            : item.source === 'local'
                            ? 'bg-[#176B67]/20 text-[#176B67] dark:text-[#C8F169]'
                            : 'bg-purple-500/15 text-purple-500'
                        }`}
                      >
                        {item.source}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate mt-0.5">
                      {item.artist}
                      {item.album ? ` • ${item.album}` : ''}
                    </p>

                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#777267] font-mono">
                      {item.durationFormatted && <span>{item.durationFormatted}</span>}
                      {item.isLocal && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> In Library
                        </span>
                      )}
                      {progress?.status && progress.status !== 'completed' && (
                        <span className="text-[#176B67] dark:text-[#C8F169]">{progress.status}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Download Action & Context Menu */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Download Action with Real State Machine */}
                  {isDownloaded ? (
                    <span className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Downloaded</span>
                    </span>
                  ) : isDownloading ? (
                    <span className="px-2.5 py-1.5 rounded-xl bg-[#176B67]/20 text-[#176B67] dark:text-[#C8F169] text-xs font-mono font-bold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{progress.percent}%</span>
                    </span>
                  ) : item.downloadAvailability === 'downloadable' ? (
                    <button
                      onClick={() => handleDownloadTrack(item)}
                      className="px-3 py-1.5 rounded-xl bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold active:scale-95 transition flex items-center gap-1 shadow-xs"
                      title="Download audio recording to local vault"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  ) : (
                    <span
                      className="px-2 py-1 rounded-lg bg-[#292820]/5 dark:bg-white/5 text-[#777267] text-[10px] font-mono flex items-center gap-1"
                      title={item.availabilityReason}
                    >
                      <span>Stream Only</span>
                    </span>
                  )}

                  {/* Context Menu Trigger */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setActiveMenuTrackId(activeMenuTrackId === item.id ? null : item.id)
                      }
                      className="p-1.5 rounded-lg text-[#777267] hover:text-[#292820] dark:hover:text-white transition"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Context Dropdown */}
                    {activeMenuTrackId === item.id && (
                      <div className="absolute right-0 top-full mt-1 w-44 rounded-2xl bg-white/95 dark:bg-[#141815]/95 backdrop-blur-2xl border border-[#292820]/15 dark:border-white/15 shadow-xl p-1.5 z-30 space-y-1">
                        <button
                          onClick={() => handleAddToQueue(item)}
                          className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs text-[#292820] dark:text-[#E8E9DD] hover:bg-[#292820]/5 dark:hover:bg-white/5 flex items-center gap-2"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add to Queue
                        </button>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs text-[#292820] dark:text-[#E8E9DD] hover:bg-[#292820]/5 dark:hover:bg-white/5 flex items-center gap-2"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View on {item.source}
                          </a>
                        )}
                        <div className="p-2 border-t border-[#292820]/10 dark:border-white/10 text-[10px] text-[#777267] font-mono leading-tight">
                          {item.availabilityReason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODALS */}
      {/* 1. Spotify Review Modal */}
      <SpotifyPlaylistReviewModal
        isOpen={isSpotifyModalOpen}
        onClose={() => setIsSpotifyModalOpen(false)}
        initialPlaylist={detectedPlaylist}
      />

      {/* 2. Persistent Music History Modal */}
      <MusicHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectSearch={(q) => {
          setQuery(q);
          handleSearch(undefined, q);
        }}
        onSelectPlaylistUrl={(url) => {
          setQuery(url);
          setIsSpotifyModalOpen(true);
        }}
      />

      {/* 3. Telegram Hub Modal */}
      <TelegramDiscoveryModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
      />
    </div>
  );
};
