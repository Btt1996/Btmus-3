import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  MoreVertical,
  Play,
  Heart,
  Trash2,
  ListPlus,
  Info,
  CheckSquare,
  Square,
  HardDrive,
  Music,
  Send,
  X,
  Sparkles,
  Activity,
  Copy,
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { Track } from '../../types/music';
import { formatDuration, formatFileSize } from '../../utils/id3Parser';
import { findDuplicateTracks, DuplicateGroup } from '../../utils/duplicates';
import { TrackDetailModal } from './TrackDetailModal';
import { AddToPlaylistModal } from '../player/AddToPlaylistModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { DuplicatesModal } from '../common/DuplicatesModal';

type SortOption = 'recent' | 'title' | 'artist' | 'album' | 'duration' | 'plays' | 'bpm';
type FilterOption = 'all' | 'favorites' | 'telegram' | 'analyzed';

export const LibraryScreen: React.FC = () => {
  const {
    tracks,
    playTrack,
    toggleFavorite,
    deleteTrack,
    deleteTracks,
    storageStats,
    addToQueue,
    playNextInQueue,
    trackAnalyses,
    batchAnalyzeTracks,
    showToast,
  } = useMusic();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [activeSort, setActiveSort] = useState<SortOption>('recent');
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Duplicates state
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  const handleCheckDuplicates = () => {
    const groups = findDuplicateTracks(tracks);
    setDuplicateGroups(groups);
    if (groups.length === 0) {
      showToast('No duplicate songs found! Your library is clean.');
    } else {
      setIsDuplicatesModalOpen(true);
    }
  };

  // Modals state
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id?: string; isBatch?: boolean } | null>(null);
  const [activeActionMenuTrackId, setActiveActionMenuTrackId] = useState<string | null>(null);

  // Filtered and Sorted Tracks
  const filteredTracks = useMemo(() => {
    let result = [...tracks];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.fileName.toLowerCase().includes(q) ||
          (t.telegramSource?.chatTitle && t.telegramSource.chatTitle.toLowerCase().includes(q)) ||
          (t.telegramSource?.topicName && t.telegramSource.topicName.toLowerCase().includes(q)) ||
          (trackAnalyses[t.id] &&
            (trackAnalyses[t.id].camelot.toLowerCase().includes(q) ||
              trackAnalyses[t.id].key.toLowerCase().includes(q) ||
              `${trackAnalyses[t.id].bpm}`.includes(q)))
      );
    }

    // Filter type
    if (activeFilter === 'favorites') {
      result = result.filter((t) => t.isFavorite);
    } else if (activeFilter === 'telegram') {
      result = result.filter((t) => !!t.telegramSource);
    } else if (activeFilter === 'analyzed') {
      result = result.filter((t) => !!trackAnalyses[t.id]);
    }

    // Sorting
    result.sort((a, b) => {
      switch (activeSort) {
        case 'recent':
          return b.downloadDate - a.downloadDate;
        case 'title':
          return a.title.localeCompare(b.title);
        case 'artist':
          return a.artist.localeCompare(b.artist);
        case 'album':
          return a.album.localeCompare(b.album);
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        case 'plays':
          return (b.playCount || 0) - (a.playCount || 0);
        case 'bpm':
          return (trackAnalyses[b.id]?.bpm || 0) - (trackAnalyses[a.id]?.bpm || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [tracks, searchQuery, activeFilter, activeSort, trackAnalyses]);

  // Multi-select toggle
  const toggleSelectTrack = (trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTrackIds(new Set(filteredTracks.map((t) => t.id)));
  };

  const clearSelection = () => {
    setSelectedTrackIds(new Set());
    setIsMultiSelectMode(false);
  };

  const analyzedCount = Object.keys(trackAnalyses).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-notch pb-8 space-y-4 max-w-lg mx-auto w-full select-none">
      {/* Header with Title and Storage */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase font-mono font-black text-[#176B67] dark:text-[#C8F169] tracking-wider">
            BttM Library
          </div>
          <h1 className="text-2xl font-black text-[#292820] dark:text-[#E8E9DD] tracking-tight">Music Library</h1>
          <p className="text-xs text-[#777267] dark:text-[#92998F] mt-0.5 flex items-center gap-2">
            <span>{tracks.length} songs</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-[#176B67] dark:text-[#C8F169]" />
              {formatFileSize(storageStats.trackBytes)} stored
            </span>
            {analyzedCount > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-[#176B67] dark:text-[#C8F169]">
                  <Activity className="w-3 h-3" />
                  {analyzedCount} analyzed
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckDuplicates}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[#176B67]/30 dark:border-[#C8F169]/30 bg-[#E8DDC9]/70 dark:bg-[#141815] text-[#176B67] dark:text-[#C8F169] hover:bg-[#C8F169]/20 transition flex items-center gap-1.5 active:scale-95"
            title="Scan & remove duplicate songs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicates</span>
          </button>

          <button
            onClick={() => {
              if (isMultiSelectMode) clearSelection();
              else setIsMultiSelectMode(true);
            }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${
              isMultiSelectMode
                ? 'bg-[#292820] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09]'
                : 'text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white'
            }`}
          >
            {isMultiSelectMode ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#777267] dark:text-[#92998F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search title, artist, key, BPM..."
          className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/90 border border-[#292820]/15 dark:border-white/10 text-xs text-[#292820] dark:text-[#E8E9DD] placeholder-[#777267] dark:placeholder-[#92998F] focus:outline-none focus:border-[#176B67] dark:focus:border-[#C8F169] transition shadow-xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777267] hover:text-[#292820] dark:hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter and Sort Pills */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
        <div className="flex items-center gap-1.5 shrink-0">
          {(['all', 'favorites', 'telegram', 'analyzed'] as FilterOption[]).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-full capitalize font-semibold transition flex items-center gap-1 ${
                activeFilter === f
                  ? 'bg-[#292820] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] shadow-sm'
                  : 'bg-[#E8DDC9]/60 dark:bg-[#141815]/70 text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white border border-[#292820]/10 dark:border-white/10'
              }`}
            >
              {f === 'analyzed' && <Sparkles className="w-3 h-3 text-[#176B67] dark:text-[#080A09]" />}
              {f === 'all' ? 'All Songs' : f === 'favorites' ? 'Favorites' : f === 'telegram' ? 'Telegram' : 'Smart Mix'}
            </button>
          ))}
        </div>

        {/* Sort Select */}
        <div className="relative shrink-0">
          <select
            value={activeSort}
            onChange={(e) => setActiveSort(e.target.value as SortOption)}
            className="appearance-none pl-7 pr-4 py-1.5 rounded-full bg-[#E8DDC9]/60 dark:bg-[#141815]/70 border border-[#292820]/10 dark:border-white/10 text-[11px] font-semibold text-[#292820] dark:text-[#E8E9DD] focus:outline-none focus:border-[#176B67] dark:focus:border-[#C8F169] cursor-pointer"
          >
            <option value="recent">Recently Added</option>
            <option value="title">Title (A-Z)</option>
            <option value="artist">Artist</option>
            <option value="album">Album</option>
            <option value="duration">Longest</option>
            <option value="plays">Most Played</option>
            <option value="bpm">Tempo (BPM)</option>
          </select>
          <ArrowUpDown className="w-3 h-3 text-[#777267] dark:text-[#92998F] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Multi-Select Action Bar */}
      {isMultiSelectMode && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#E8DDC9] dark:bg-[#141815] border border-[#292820]/15 dark:border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-[#292820] dark:text-[#E8E9DD] hover:underline font-bold">
              Select All ({filteredTracks.length})
            </button>
            <span className="text-[#777267]">•</span>
            <span className="text-[#777267] dark:text-[#92998F]">{selectedTrackIds.size} selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => batchAnalyzeTracks(Array.from(selectedTrackIds))}
              disabled={selectedTrackIds.size === 0}
              className="px-2.5 py-1.5 rounded-xl bg-[#292820] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] disabled:opacity-40 font-semibold flex items-center gap-1 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Analyze
            </button>
            <button
              onClick={() => setDeleteConfirmTarget({ isBatch: true })}
              disabled={selectedTrackIds.size === 0}
              className="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Tracks List */}
      {filteredTracks.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Music className="w-10 h-10 text-[#777267] dark:text-[#92998F] mx-auto opacity-40" />
          <h4 className="text-sm font-semibold text-[#292820] dark:text-[#E8E9DD]">No matching tracks found</h4>
          <p className="text-xs text-[#777267] max-w-xs mx-auto">
            {searchQuery
              ? `No results for "${searchQuery}". Try another search term.`
              : 'Your library is empty. Import songs from the header button or Discover.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTracks.map((track) => {
            const isSelected = selectedTrackIds.has(track.id);
            const isMenuOpen = activeActionMenuTrackId === track.id;
            const analysis = trackAnalyses[track.id];

            return (
              <div
                key={track.id}
                className={`relative flex items-center justify-between p-2.5 rounded-2xl border transition group ${
                  isSelected
                    ? 'bg-[#E8DDC9] dark:bg-[#141815] border-[#176B67] dark:border-[#C8F169]'
                    : 'bg-[#E8DDC9]/50 dark:bg-[#141815]/60 hover:bg-[#E8DDC9] dark:hover:bg-[#141815] border-[#292820]/10 dark:border-white/10'
                }`}
              >
                {/* Checkbox in multi-select mode */}
                {isMultiSelectMode && (
                  <button
                    onClick={() => toggleSelectTrack(track.id)}
                    className="p-1 mr-1 text-[#777267] hover:text-[#292820] dark:hover:text-white"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-[#176B67] dark:text-[#C8F169] fill-current" />
                    ) : (
                      <Square className="w-5 h-5 text-[#777267] dark:text-[#92998F]" />
                    )}
                  </button>
                )}

                {/* Track Row clickable content */}
                <div
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleSelectTrack(track.id);
                    } else {
                      playTrack(track, filteredTracks);
                    }
                  }}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#292820]/10 dark:bg-white/10 shrink-0 overflow-hidden relative flex items-center justify-center border border-[#292820]/10 dark:border-white/10">
                    {track.artworkUrl ? (
                      <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-5 h-5 text-[#777267] dark:text-[#92998F]" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-4 h-4 text-[#C8F169] fill-current ml-0.5" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 pr-2">
                    <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                      {track.title}
                    </h4>
                    <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate mt-0.5">
                      {track.artist || 'Unknown Artist'}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#777267] dark:text-[#92998F] mt-0.5 flex-wrap font-mono">
                      <span>{formatDuration(track.duration)}</span>
                      <span>•</span>
                      <span>{formatFileSize(track.fileSize)}</span>
                      {analysis && (
                        <>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded bg-[#292820]/10 dark:bg-white/10 text-[#176B67] dark:text-[#C8F169] font-bold">
                            {analysis.bpm} BPM • {analysis.camelot}
                          </span>
                        </>
                      )}
                      {track.telegramSource && (
                        <>
                          <span>•</span>
                          <span className="text-[#292820] dark:text-[#E8E9DD] flex items-center gap-0.5 font-sans">
                            <Send className="w-2.5 h-2.5 text-[#176B67] dark:text-[#C8F169]" />
                            {track.telegramSource.topicName || track.telegramSource.chatTitle || 'Telegram'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions Right */}
                {!isMultiSelectMode && (
                  <div className="flex items-center gap-1 shrink-0 relative">
                    <button
                      onClick={() => toggleFavorite(track.id)}
                      className="p-2 text-[#777267] dark:text-[#92998F] hover:text-rose-500 transition"
                      aria-label="Favorite"
                    >
                      <Heart className={`w-4 h-4 ${track.isFavorite ? 'text-rose-500 fill-current' : ''}`} />
                    </button>

                    <button
                      onClick={() =>
                        setActiveActionMenuTrackId((curr) => (curr === track.id ? null : track.id))
                      }
                      className="p-2 text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white rounded-lg hover:bg-[#292820]/10 dark:hover:bg-white/10 transition"
                      aria-label="Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Popover Action Menu */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-10 z-30 w-44 rounded-2xl bg-[#E8DDC9] dark:bg-[#141815] border border-[#292820]/15 dark:border-white/10 shadow-2xl p-1.5 space-y-0.5 animate-in fade-in duration-150">
                        <button
                          onClick={() => {
                            addToQueue(track);
                            setActiveActionMenuTrackId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-[#292820] dark:text-[#E8E9DD] hover:bg-[#292820]/10 dark:hover:bg-white/10 rounded-xl flex items-center gap-2 transition"
                        >
                          <Music className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                          Add to Queue
                        </button>
                        <button
                          onClick={() => {
                            playNextInQueue(track);
                            setActiveActionMenuTrackId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-[#292820] dark:text-[#E8E9DD] hover:bg-[#292820]/10 dark:hover:bg-white/10 rounded-xl flex items-center gap-2 transition"
                        >
                          <Play className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                          Play Next
                        </button>
                        <button
                          onClick={() => {
                            setPlaylistTrack(track);
                            setActiveActionMenuTrackId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-[#292820] dark:text-[#E8E9DD] hover:bg-[#292820]/10 dark:hover:bg-white/10 rounded-xl flex items-center gap-2 transition"
                        >
                          <ListPlus className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                          Add to Playlist
                        </button>
                        <button
                          onClick={() => {
                            setDetailTrack(track);
                            setActiveActionMenuTrackId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-[#292820] dark:text-[#E8E9DD] hover:bg-[#292820]/10 dark:hover:bg-white/10 rounded-xl flex items-center gap-2 transition"
                        >
                          <Info className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                          Song Info
                        </button>
                        <div className="h-px bg-[#292820]/10 dark:bg-white/10 my-1" />
                        <button
                          onClick={() => {
                            setDeleteConfirmTarget({ id: track.id });
                            setActiveActionMenuTrackId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-2 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete from iPhone
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <TrackDetailModal
        track={detailTrack}
        analysis={detailTrack ? trackAnalyses[detailTrack.id] : undefined}
        isOpen={!!detailTrack}
        onClose={() => setDetailTrack(null)}
        onDelete={(id) => setDeleteConfirmTarget({ id })}
        onToggleFavorite={toggleFavorite}
        onAddToPlaylist={(t) => setPlaylistTrack(t)}
      />

      <AddToPlaylistModal
        track={playlistTrack}
        isOpen={!!playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmTarget}
        title={deleteConfirmTarget?.isBatch ? `Delete ${selectedTrackIds.size} songs?` : 'Delete song?'}
        description={
          deleteConfirmTarget?.isBatch
            ? 'This will permanently remove the selected audio files from your iPhone local storage.'
            : 'This will permanently remove this song and free up space on your device.'
        }
        confirmLabel="Delete"
        isDestructive={true}
        onConfirm={async () => {
          if (deleteConfirmTarget?.isBatch) {
            await deleteTracks(Array.from(selectedTrackIds));
            clearSelection();
          } else if (deleteConfirmTarget?.id) {
            await deleteTrack(deleteConfirmTarget.id);
          }
          setDeleteConfirmTarget(null);
        }}
        onCancel={() => setDeleteConfirmTarget(null)}
      />

      <DuplicatesModal
        isOpen={isDuplicatesModalOpen}
        onClose={() => setIsDuplicatesModalOpen(false)}
        duplicateGroups={duplicateGroups}
        onDuplicatesRemoved={() => {
          setDuplicateGroups([]);
        }}
      />
    </div>
  );
};
