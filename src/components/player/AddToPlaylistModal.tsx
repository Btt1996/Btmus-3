import React, { useState } from 'react';
import { X, Plus, Check, ListMusic } from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { Track } from '../../types/music';

interface AddToPlaylistModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({ track, isOpen, onClose }) => {
  const { playlists, addTrackToPlaylist, createPlaylist } = useMusic();
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen || !track) return null;

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const created = await createPlaylist(newPlaylistName.trim(), undefined, [track.id]);
    setNewPlaylistName('');
    setIsCreating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 pb-[max(calc(env(safe-area-inset-bottom,0px)+1.5rem),2rem)] shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-black dark:text-white">Add to Playlist</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[260px] mt-0.5">{track.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-black dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create New Playlist Field */}
        <div className="pt-4 pb-2">
          {isCreating ? (
            <form onSubmit={handleCreateAndAdd} className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white placeholder-zinc-400"
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="px-4 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 text-xs font-semibold transition"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-2.5 px-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              New Playlist
            </button>
          )}
        </div>

        {/* Playlists List */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1 max-h-64">
          {playlists.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 text-xs">
              No playlists created yet. Tap above to create your first one!
            </div>
          ) : (
            playlists.map((playlist) => {
              const isIncluded = playlist.trackIds.includes(track.id);
              return (
                <button
                  key={playlist.id}
                  onClick={async () => {
                    await addTrackToPlaylist(playlist.id, track.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-950/60 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-800 transition text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white">
                      <ListMusic className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-black dark:text-white">
                        {playlist.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {playlist.trackIds.length} track{playlist.trackIds.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {isIncluded ? (
                    <span className="text-black dark:text-white flex items-center gap-1 text-[11px] font-bold">
                      <Check className="w-4 h-4" /> Added
                    </span>
                  ) : (
                    <span className="text-zinc-400 group-hover:text-black dark:group-hover:text-white text-xs font-medium">
                      + Add
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
