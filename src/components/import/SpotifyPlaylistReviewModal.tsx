import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Music,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  Play,
  Pause,
  Download,
  ListMusic,
  Info,
  Check,
  Search,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trash2,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import {
  NormalizedPlaylist,
  NormalizedTrackMetadata,
  AudioCandidateMatch,
  ImportSettings,
  DEFAULT_IMPORT_SETTINGS,
} from '../../types/playlistImport';
import { fetchSpotifyPlaylist } from '../../services/playlistImport/x1Spotify';
import {
  resolveAndDownloadSingleTrack,
  searchAllX2Providers,
} from '../../services/playlistImport/x2Engine';
import { findVerifiedCachedTrack, savePlaylist } from '../../services/db';
import { formatDuration } from '../../utils/id3Parser';
import { useMusic } from '../../context/MusicContext';
import { recordPlaylistHistory } from '../../services/historyService';

interface SpotifyPlaylistReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  initialPlaylist?: NormalizedPlaylist | null;
  onPlaylistSaved?: (playlistId: string) => void;
}

type TrackFilterTab = 'all' | 'ready' | 'in_library' | 'review' | 'unavailable';

interface TrackReviewItem {
  id: string;
  meta: NormalizedTrackMetadata;
  isSelected: boolean;
  isExcluded: boolean;
  isLocal: boolean;
  localTrackId?: string;
  status: 'idle' | 'checking' | 'downloading' | 'completed' | 'unavailable' | 'review_required' | 'failed';
  downloadProgress: number;
  bestMatch?: AudioCandidateMatch;
  candidateMatches: AudioCandidateMatch[];
  errorMessage?: string;
}

export const SpotifyPlaylistReviewModal: React.FC<SpotifyPlaylistReviewModalProps> = ({
  isOpen,
  onClose,
  initialUrl = '',
  initialPlaylist = null,
  onPlaylistSaved,
}) => {
  const { showToast, refreshLibrary, playTrack, tracks: localTracks } = useMusic();

  const [urlInput, setUrlInput] = useState(initialUrl);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [playlist, setPlaylist] = useState<NormalizedPlaylist | null>(initialPlaylist);
  const [reviewItems, setReviewItems] = useState<TrackReviewItem[]>([]);
  const [filterTab, setFilterTab] = useState<TrackFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Batch download state
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const isCancelledRef = useRef(false);

  // Settings
  const [settings, setSettings] = useState<ImportSettings>(DEFAULT_IMPORT_SETTINGS);

  const [activeCandidatePickerId, setActiveCandidatePickerId] = useState<string | null>(null);

  // Load if initial playlist is provided
  useEffect(() => {
    if (initialPlaylist) {
      setPlaylist(initialPlaylist);
      initializeReviewItems(initialPlaylist);
    } else if (initialUrl && isOpen) {
      setUrlInput(initialUrl);
      handleFetchPlaylist(initialUrl);
    }
  }, [initialPlaylist, initialUrl, isOpen]);

  const handleFetchPlaylist = async (urlToFetch = urlInput) => {
    const clean = urlToFetch.trim();
    if (!clean) return;

    setIsLoadingMetadata(true);
    setMetadataError(null);
    try {
      const data = await fetchSpotifyPlaylist(clean);
      setPlaylist(data);
      await initializeReviewItems(data);
      await recordPlaylistHistory({
        title: data.playlistTitle,
        curator: data.playlistDescription,
        source: 'spotify',
        coverUrl: data.playlistCoverUrl,
        totalTracks: data.totalTracks,
        externalUrl: data.externalUrl,
      });
      showToast(`Loaded ${data.totalTracks} tracks from Spotify`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch Spotify playlist';
      setMetadataError(msg);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const initializeReviewItems = async (pl: NormalizedPlaylist) => {
    const items: TrackReviewItem[] = [];

    for (let i = 0; i < pl.tracks.length; i++) {
      const t = pl.tracks[i];
      // Check local cache
      const cached = await findVerifiedCachedTrack(t.title, t.artists[0] || '', t.durationMs);

      items.push({
        id: `track_${i}`,
        meta: t,
        isSelected: true,
        isExcluded: false,
        isLocal: !!cached,
        localTrackId: cached ? cached.track.id : undefined,
        status: cached ? 'completed' : 'idle',
        downloadProgress: cached ? 100 : 0,
        candidateMatches: [],
      });
    }

    setReviewItems(items);
  };

  // Toggle track selection
  const handleToggleSelect = (id: string) => {
    setReviewItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isSelected: !item.isSelected } : item))
    );
  };

  // Remove track from import queue
  const handleExcludeTrack = (id: string) => {
    setReviewItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isExcluded: true, isSelected: false } : item))
    );
    showToast('Track removed from import queue');
  };

  // Select all / Deselect all
  const handleSelectAll = (select: boolean) => {
    setReviewItems((prev) =>
      prev.map((item) => (!item.isExcluded ? { ...item, isSelected: select } : item))
    );
  };

  // Individual Track Download Handler
  const handleDownloadSingle = async (item: TrackReviewItem) => {
    if (item.status === 'downloading' || item.isLocal) return;

    setReviewItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: 'checking', downloadProgress: 10 } : it
      )
    );

    try {
      const result = await resolveAndDownloadSingleTrack(
        {
          title: item.meta.title,
          artist: item.meta.artists.join(', '),
          album: item.meta.album || playlist?.playlistTitle,
          durationMs: item.meta.durationMs,
          artworkUrl: item.meta.artworkUrl || playlist?.playlistCoverUrl,
          isrc: item.meta.isrc,
          source: 'spotify_playlist',
        },
        settings,
        (percent, statusMsg) => {
          setReviewItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: percent > 40 ? 'downloading' : 'checking',
                    downloadProgress: percent,
                  }
                : it
            )
          );
        }
      );

      if (result.success) {
        setReviewItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'completed',
                  isLocal: true,
                  localTrackId: result.track?.id,
                  downloadProgress: 100,
                  errorMessage: undefined,
                }
              : it
          )
        );
        showToast(`Downloaded "${item.meta.title}"!`);
        await refreshLibrary();
      } else {
        setReviewItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: result.status === 'unavailable' ? 'unavailable' : 'failed',
                  errorMessage: result.error,
                  downloadProgress: 0,
                }
              : it
          )
        );
        showToast(`Could not download: ${result.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setReviewItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: 'failed', errorMessage: msg, downloadProgress: 0 } : it
        )
      );
      showToast(`Error: ${msg}`);
    }
  };

  // Inspect Candidates for a Track
  const handleInspectCandidates = async (item: TrackReviewItem) => {
    setActiveCandidatePickerId(item.id);
    if (item.candidateMatches.length === 0) {
      const res = await searchAllX2Providers(item.meta, settings);
      setReviewItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, candidateMatches: res.matches } : it))
      );
    }
  };

  // Batch Download all eligible tracks
  const handleBatchDownload = async () => {
    if (!playlist) return;
    setIsBatchDownloading(true);
    isCancelledRef.current = false;

    const queue = reviewItems.filter(
      (it) => it.isSelected && !it.isExcluded && (!skipDuplicates || !it.isLocal)
    );

    let completedCount = 0;
    const importedTrackIds: string[] = [];

    // Keep existing locals if skipDuplicates is active
    for (const it of reviewItems) {
      if (it.isLocal && it.localTrackId && !it.isExcluded) {
        importedTrackIds.push(it.localTrackId);
      }
    }

    for (const item of queue) {
      if (isCancelledRef.current) break;
      await handleDownloadSingle(item);
      completedCount++;
    }

    // Save playlist locally with preserved order
    try {
      const newPlaylistId = `pl_spotify_${Date.now()}`;
      await savePlaylist({
        id: newPlaylistId,
        name: playlist.playlistTitle,
        description: playlist.playlistDescription || `Imported Spotify playlist (${playlist.totalTracks} tracks)`,
        sourceType: 'manual',
        trackIds: Array.from(new Set(importedTrackIds)),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        coverArtworkUrl: playlist.playlistCoverUrl,
      });

      showToast(`Playlist saved with ${importedTrackIds.length} tracks!`);
      if (onPlaylistSaved) onPlaylistSaved(newPlaylistId);
    } catch (e) {
      console.warn('Failed saving playlist:', e);
    }

    setIsBatchDownloading(false);
  };

  // Computed summary
  const summary = useMemo(() => {
    const total = reviewItems.filter((i) => !i.isExcluded).length;
    const inLibrary = reviewItems.filter((i) => !i.isExcluded && i.isLocal).length;
    const unavailable = reviewItems.filter((i) => !i.isExcluded && i.status === 'unavailable').length;
    const eligible = reviewItems.filter(
      (i) => !i.isExcluded && i.isSelected && (!skipDuplicates || !i.isLocal)
    ).length;

    return { total, inLibrary, unavailable, eligible };
  }, [reviewItems, skipDuplicates]);

  // Filtered tracks
  const displayedItems = reviewItems.filter((item) => {
    if (item.isExcluded) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.meta.title.toLowerCase().includes(q);
      const matchArtist = item.meta.artists.some((a) => a.toLowerCase().includes(q));
      if (!matchTitle && !matchArtist) return false;
    }

    if (filterTab === 'in_library') return item.isLocal;
    if (filterTab === 'unavailable') return item.status === 'unavailable';
    if (filterTab === 'review') return item.status === 'review_required';
    if (filterTab === 'ready') return !item.isLocal && item.status !== 'unavailable';
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-3xl bg-[#F3EBDD]/95 dark:bg-[#080A09]/95 border border-[#176B67]/20 dark:border-[#C8F169]/20 shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#292820]/10 dark:border-white/10 flex items-center justify-between shrink-0 bg-[#E8DDC9]/50 dark:bg-[#141815]/50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#292820] dark:text-[#E8E9DD] tracking-tight">
                Spotify Playlist Inspector
              </h2>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F] font-mono">
                Inspect metadata & download individual recordings
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (isBatchDownloading) isCancelledRef.current = true;
              onClose();
            }}
            className="p-2 rounded-xl bg-[#292820]/5 dark:bg-white/5 text-[#292820] dark:text-[#E8E9DD] active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Bar if not loaded or if user wants to change URL */}
        <div className="p-3 border-b border-[#292820]/10 dark:border-white/10 bg-white/40 dark:bg-[#141815]/40">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFetchPlaylist();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste Spotify playlist URL (e.g. https://open.spotify.com/playlist/...)"
                className="w-full pl-3.5 pr-8 py-2 rounded-xl bg-[#292820]/5 dark:bg-white/5 border border-[#292820]/10 dark:border-white/10 text-xs font-mono text-[#292820] dark:text-[#E8E9DD] placeholder:text-[#777267] focus:outline-none focus:border-[#176B67] dark:focus:border-[#C8F169]"
              />
              {urlInput && (
                <button
                  type="button"
                  onClick={() => setUrlInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777267] hover:text-[#292820]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoadingMetadata || !urlInput.trim()}
              className="px-4 py-2 rounded-xl bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold flex items-center gap-1.5 active:scale-95 transition shrink-0 disabled:opacity-50"
            >
              {isLoadingMetadata ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Inspect</span>
                </>
              )}
            </button>
          </form>

          {metadataError && (
            <div className="mt-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{metadataError}</span>
            </div>
          )}
        </div>

        {/* Playlist Overview & Pre-flight Summary */}
        {playlist && (
          <div className="p-4 border-b border-[#292820]/10 dark:border-white/10 bg-white/60 dark:bg-[#141815]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {playlist.playlistCoverUrl ? (
                <img
                  src={playlist.playlistCoverUrl}
                  alt=""
                  className="w-14 h-14 rounded-2xl object-cover shadow-sm shrink-0 border border-[#292820]/10"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#176B67]/20 text-[#176B67] dark:bg-[#C8F169]/20 dark:text-[#C8F169] flex items-center justify-center shrink-0">
                  <Music className="w-7 h-7" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                    Spotify Playlist
                  </span>
                  <span className="text-xs font-mono text-[#777267] dark:text-[#92998F]">
                    {playlist.totalTracks} tracks
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#292820] dark:text-[#E8E9DD] truncate tracking-tight mt-0.5">
                  {playlist.playlistTitle}
                </h3>
                {playlist.playlistDescription && (
                  <p className="text-xs text-[#777267] dark:text-[#92998F] truncate max-w-sm">
                    {playlist.playlistDescription}
                  </p>
                )}
              </div>
            </div>

            {/* Pre-flight Batch Action */}
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
              <label className="flex items-center gap-1.5 text-xs text-[#777267] dark:text-[#92998F] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded text-[#176B67] dark:text-[#C8F169] focus:ring-0"
                />
                <span>Skip duplicates ({summary.inLibrary})</span>
              </label>

              <button
                onClick={handleBatchDownload}
                disabled={isBatchDownloading || summary.eligible === 0}
                className="px-4 py-2.5 rounded-2xl bg-[#C8F169] text-[#292820] text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition flex items-center gap-2 disabled:opacity-50"
              >
                {isBatchDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download All Eligible ({summary.eligible})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Filter Tabs & Search Within Playlist */}
        {playlist && (
          <div className="p-3 border-b border-[#292820]/10 dark:border-white/10 flex flex-col sm:flex-row gap-2 justify-between items-center">
            {/* Filter Pills */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none w-full sm:w-auto">
              {(
                [
                  { id: 'all', label: 'All', count: summary.total },
                  { id: 'ready', label: 'Eligible', count: summary.eligible },
                  { id: 'in_library', label: 'In Library', count: summary.inLibrary },
                  { id: 'unavailable', label: 'Unavailable', count: summary.unavailable },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 whitespace-nowrap ${
                    filterTab === tab.id
                      ? 'bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09]'
                      : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono opacity-80">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Quick Filter Search Input */}
            <div className="relative w-full sm:w-48">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tracks..."
                className="w-full pl-7 pr-3 py-1 rounded-xl bg-[#292820]/5 dark:bg-white/5 text-xs text-[#292820] dark:text-[#E8E9DD] placeholder:text-[#777267] focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-[#777267] absolute left-2 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        )}

        {/* Track List with Individual Download Actions */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!playlist ? (
            <div className="p-12 text-center text-[#777267] dark:text-[#92998F] select-none">
              <Music className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD]">
                Enter a Spotify playlist or album URL above
              </p>
              <p className="text-xs mt-1">
                Public playlists are inspected keylessly. Each track has an individual download button.
              </p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="p-12 text-center text-[#777267] dark:text-[#92998F] text-xs">
              No tracks matching current filter.
            </div>
          ) : (
            displayedItems.map((item, idx) => {
              const isDownloading = item.status === 'downloading' || item.status === 'checking';
              const isDownloaded = item.isLocal || item.status === 'completed';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl bg-white/70 dark:bg-[#141815]/70 border transition-all duration-200 flex items-center justify-between gap-3 ${
                    isDownloaded
                      ? 'border-emerald-500/20'
                      : item.status === 'unavailable'
                      ? 'border-amber-500/20 opacity-75'
                      : 'border-[#292820]/10 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={item.isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="rounded text-[#176B67] dark:text-[#C8F169] focus:ring-0 shrink-0"
                    />

                    {/* Track Number or Artwork */}
                    {item.meta.artworkUrl ? (
                      <img
                        src={item.meta.artworkUrl}
                        alt=""
                        className="w-10 h-10 rounded-xl object-cover shrink-0 border border-[#292820]/10"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#292820]/5 dark:bg-white/5 flex items-center justify-center font-mono text-xs text-[#777267] shrink-0">
                        {idx + 1}
                      </div>
                    )}

                    {/* Track Info */}
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                        {item.meta.title}
                      </h4>
                      <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate">
                        {item.meta.artists.join(', ')}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#777267] font-mono">
                        {item.meta.durationMs > 0 && (
                          <span>{formatDuration(Math.round(item.meta.durationMs / 1000))}</span>
                        )}
                        {item.isLocal && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> In Library
                          </span>
                        )}
                        {item.errorMessage && (
                          <span className="text-amber-500 truncate max-w-xs">{item.errorMessage}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Individual Actions: Play, Candidate Inspector, Download */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Inspect match candidate */}
                    <button
                      onClick={() => handleInspectCandidates(item)}
                      className="p-1.5 rounded-lg text-[#777267] dark:text-[#92998F] hover:text-[#176B67] dark:hover:text-[#C8F169] active:scale-95 transition"
                      title="Inspect match candidates"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>

                    {/* Individual Download Action */}
                    {isDownloaded ? (
                      <span className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Downloaded</span>
                      </span>
                    ) : isDownloading ? (
                      <span className="px-2.5 py-1.5 rounded-xl bg-[#176B67]/20 text-[#176B67] dark:text-[#C8F169] text-xs font-mono font-bold flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{item.downloadProgress}%</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDownloadSingle(item)}
                        className="px-3 py-1.5 rounded-xl bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold shadow-xs active:scale-95 transition flex items-center gap-1"
                        title="Download matching audio recording"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    )}

                    {/* Remove from queue */}
                    <button
                      onClick={() => handleExcludeTrack(item.id)}
                      className="p-1.5 rounded-lg text-[#777267] hover:text-red-500 active:scale-90 transition"
                      title="Remove from queue"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
