import React, { useState } from 'react';
import {
  ArrowLeft,
  Play,
  Shuffle,
  Trash2,
  Edit2,
  Music,
  ChevronUp,
  ChevronDown,
  X,
  Send,
  ListMusic,
  Sparkles,
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { Playlist, Track } from '../../types/music';
import { formatDuration } from '../../utils/id3Parser';
import { ConfirmModal } from '../common/ConfirmModal';
import { SmartMixDrawer } from '../player/SmartMixDrawer';

interface PlaylistDetailViewProps {
  playlist: Playlist;
  onBack: () => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({ playlist, onBack }) => {
  const {
    tracks,
    playTrack,
    updatePlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    trackAnalyses,
  } = useMusic();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(playlist.name);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSmartMixOpen, setIsSmartMixOpen] = useState(false);

  const playlistTracks: Track[] = playlist.trackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => t !== undefined);

  const totalDuration = playlistTracks.reduce((acc, t) => acc + (t.duration || 0), 0);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedName.trim()) return;
    await updatePlaylist({ ...playlist, name: editedName.trim() });
    setIsEditingName(false);
  };

  const moveTrack = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= playlist.trackIds.length) return;

    const copy = [...playlist.trackIds];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    reorderPlaylistTracks(playlist.id, copy);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-notch pb-8 space-y-5 max-w-lg mx-auto w-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Playlists</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditingName(true)}
            className="p-2 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="Rename playlist"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="p-2 text-zinc-500 hover:text-red-500 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="Delete playlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Playlist Hero Info */}
      <div className="flex flex-col items-center text-center space-y-3 pt-2">
        <div className="w-36 h-36 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl relative flex items-center justify-center">
          {playlistTracks.length > 0 && playlistTracks[0].artworkUrl ? (
            <img
              src={playlistTracks[0].artworkUrl}
              alt={playlist.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-500">
              <ListMusic className="w-16 h-16 stroke-[1.2]" />
            </div>
          )}
        </div>

        <div>
          {isEditingName ? (
            <form onSubmit={handleSaveName} className="flex items-center gap-2 mt-1">
              <input
                type="text"
                autoFocus
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-sm font-bold text-black dark:text-white text-center"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="p-1.5 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <h2 className="text-xl font-bold text-black dark:text-white">{playlist.name}</h2>
          )}

          {playlist.sourceType === 'telegram' && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 font-medium mt-1">
              <Send className="w-3.5 h-3.5" />
              <span>Telegram: {playlist.telegramTopic || playlist.telegramChatTitle || 'Chat'}</span>
            </div>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {playlistTracks.length} song{playlistTracks.length !== 1 ? 's' : ''} • {formatDuration(totalDuration)}
          </p>
        </div>

        {/* Play and Shuffle Action Buttons */}
        <div className="flex items-center gap-3 pt-2 w-full max-w-xs">
          <button
            onClick={() => {
              if (playlistTracks.length > 0) playTrack(playlistTracks[0], playlistTracks);
            }}
            disabled={playlistTracks.length === 0}
            className="flex-1 py-3 px-4 rounded-2xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 text-xs font-bold flex items-center justify-center gap-2 shadow-md transition active:scale-95"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
            Play All
          </button>
          <button
            onClick={() => {
              if (playlistTracks.length > 0) {
                const shuffled = [...playlistTracks].sort(() => Math.random() - 0.5);
                playTrack(shuffled[0], shuffled);
              }
            }}
            disabled={playlistTracks.length === 0}
            className="flex-1 py-3 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-black dark:text-white disabled:opacity-50 text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95"
          >
            <Shuffle className="w-4 h-4" />
            Shuffle
          </button>
        </div>

        {/* Smart Mix Optimize Order Button */}
        {playlistTracks.length > 1 && (
          <button
            onClick={() => setIsSmartMixOpen(true)}
            className="w-full max-w-xs py-2.5 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-black dark:text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>Smart Mix: Optimize Flow</span>
          </button>
        )}
      </div>

      {/* Track List */}
      <div className="space-y-2 pt-2">
        {playlistTracks.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 text-xs">
            This playlist has no songs yet. Open any song in Library and tap "+ Add to Playlist".
          </div>
        ) : (
          playlistTracks.map((track, idx) => {
            const analysis = trackAnalyses[track.id];
            return (
              <div
                key={`${track.id}_${idx}`}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/60 hover:bg-zinc-200/70 dark:hover:bg-zinc-850/80 border border-zinc-200 dark:border-zinc-800 transition group"
              >
                <div
                  onClick={() => playTrack(track, playlistTracks)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0 overflow-hidden relative flex items-center justify-center border border-zinc-300/40 dark:border-zinc-700/40">
                    {track.artworkUrl ? (
                      <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 pr-2">
                    <h4 className="text-xs font-semibold text-black dark:text-white truncate">
                      {track.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      <span className="truncate">{track.artist}</span>
                      {analysis && (
                        <>
                          <span>•</span>
                          <span className="font-mono font-medium shrink-0 text-zinc-600 dark:text-zinc-400">
                            {analysis.bpm} BPM • {analysis.camelot}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Order buttons & Remove button */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mr-1">
                    {formatDuration(track.duration)}
                  </span>

                  <button
                    onClick={() => moveTrack(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-20 transition"
                    aria-label="Move track up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => moveTrack(idx, 'down')}
                    disabled={idx === playlistTracks.length - 1}
                    className="p-1 text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-20 transition"
                    aria-label="Move track down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => removeTrackFromPlaylist(playlist.id, track.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 transition"
                    title="Remove from playlist"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Playlist Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title={`Delete playlist "${playlist.name}"?`}
        description="This will delete this playlist. The underlying songs will remain safely saved in your library and local storage."
        confirmLabel="Delete Playlist"
        isDestructive={true}
        onConfirm={async () => {
          await deletePlaylist(playlist.id);
          setIsDeleteModalOpen(false);
          onBack();
        }}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      {/* Smart Mix Drawer */}
      <SmartMixDrawer
        isOpen={isSmartMixOpen}
        onClose={() => setIsSmartMixOpen(false)}
        playlistId={playlist.id}
      />
    </div>
  );
};
