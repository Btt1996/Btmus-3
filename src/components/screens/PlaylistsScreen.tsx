import React, { useState } from 'react';
import { Plus, ListMusic, Send, Download, Sparkles, Disc } from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { PlaylistDetailView } from './PlaylistDetailView';
import { PlaylistImportModal } from '../import/PlaylistImportModal';

interface PlaylistsScreenProps {
  selectedPlaylistId?: string | null;
  onClearSelectedPlaylist?: () => void;
}

export const PlaylistsScreen: React.FC<PlaylistsScreenProps> = ({
  selectedPlaylistId,
  onClearSelectedPlaylist,
}) => {
  const { playlists, tracks, createPlaylist } = useMusic();
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(selectedPlaylistId || null);
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // If a playlist is selected, display its details
  const activePlaylist = playlists.find((pl) => pl.id === (activePlaylistId || selectedPlaylistId));

  if (activePlaylist) {
    return (
      <PlaylistDetailView
        playlist={activePlaylist}
        onBack={() => {
          setActivePlaylistId(null);
          if (onClearSelectedPlaylist) onClearSelectedPlaylist();
        }}
      />
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const created = await createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsCreatingModalOpen(false);
    setActivePlaylistId(created.id);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-notch pb-8 space-y-4 max-w-lg mx-auto w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#176B67] dark:text-[#C8F169] font-black font-mono">
            bttm By Ahmed Taboubi
          </div>
          <h1 className="text-2xl font-black text-[#292820] dark:text-[#E8E9DD] tracking-tight">
            Playlists
          </h1>
          <p className="text-xs text-[#777267] dark:text-[#92998F] mt-0.5">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''} stored offline
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Playlist Import Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition"
            aria-label="Import Playlist"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          {/* New Custom Playlist Button */}
          <button
            onClick={() => setIsCreatingModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-[#E8DDC9]/80 dark:bg-[#141815]/90 text-[#292820] dark:text-[#E8E9DD] border border-[#176B67]/20 dark:border-[#C8F169]/30 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Hero Liquid Glass Quick Import Card */}
      <div
        onClick={() => setIsImportModalOpen(true)}
        className="p-4 rounded-3xl bg-[#E8DDC9]/75 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#176B67]/25 dark:border-[#C8F169]/30 shadow-md cursor-pointer hover:border-[#176B67] dark:hover:border-[#C8F169] transition-all group active:scale-[0.99] flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#C8F169] text-[#292820] flex items-center justify-center font-bold shrink-0 shadow-sm shadow-[#C8F169]/30">
            <Sparkles className="w-5 h-5 text-[#176B67]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-[#292820] dark:text-[#E8E9DD]">
                Spotify & Web Playlist Import
              </span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#1DB954]/20 text-[#1DB954] text-[9px] font-bold">
                Spotify Ready
              </span>
            </div>
            <p className="text-[11px] text-[#777267] dark:text-[#92998F] mt-0.5">
              Paste public Spotify link to resolve tracklist with zero API keys
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-[#176B67] dark:text-[#C8F169] shrink-0 group-hover:translate-x-0.5 transition-transform">
          Import &rarr;
        </span>
      </div>

      {/* Playlists Grid */}
      {playlists.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ListMusic className="w-12 h-12 text-[#777267] dark:text-[#92998F] mx-auto opacity-40" />
          <h3 className="text-base font-bold text-[#292820] dark:text-[#E8E9DD]">
            No Playlists Yet
          </h3>
          <p className="text-xs text-[#777267] dark:text-[#92998F] max-w-xs mx-auto">
            Import a Spotify playlist, sync audio from Telegram, or create custom playlists.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold inline-flex items-center gap-2 shadow-xs"
            >
              <Download className="w-4 h-4" />
              Import Playlist
            </button>
            <button
              onClick={() => setIsCreatingModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] text-[#292820] dark:text-[#E8E9DD] text-xs font-semibold inline-flex items-center gap-2 border border-[#176B67]/20 dark:border-[#C8F169]/30"
            >
              <Plus className="w-4 h-4" />
              Create Empty
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-1">
          {playlists.map((playlist) => {
            const firstTrackWithArt = playlist.trackIds
              .map((id) => tracks.find((t) => t.id === id))
              .find((t) => t && t.artworkUrl);

            return (
              <div
                key={playlist.id}
                onClick={() => setActivePlaylistId(playlist.id)}
                className="p-3 rounded-2xl bg-[#E8DDC9]/60 dark:bg-[#141815]/70 hover:bg-[#E8DDC9] dark:hover:bg-[#141815] border border-[#176B67]/20 dark:border-[#C8F169]/25 hover:border-[#176B67] dark:hover:border-[#C8F169] transition cursor-pointer flex flex-col justify-between space-y-2.5 group active:scale-[0.98] shadow-xs"
              >
                <div className="w-full aspect-square rounded-xl bg-[#E8DDC9] dark:bg-[#080A09] overflow-hidden relative shadow-sm flex items-center justify-center border border-[#176B67]/15 dark:border-[#C8F169]/20">
                  {playlist.coverArtworkUrl || firstTrackWithArt?.artworkUrl ? (
                    <img
                      src={playlist.coverArtworkUrl || firstTrackWithArt?.artworkUrl}
                      alt={playlist.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#777267] dark:text-[#92998F]">
                      <ListMusic className="w-10 h-10 stroke-[1.2]" />
                    </div>
                  )}

                  {playlist.sourceType === 'telegram' && (
                    <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 dark:bg-white/60 text-white dark:text-black backdrop-blur-md">
                      <Send className="w-3 h-3" />
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                    {playlist.name}
                  </h4>
                  <p className="text-[10px] text-[#777267] dark:text-[#92998F] mt-0.5">
                    {playlist.trackIds.length} track{playlist.trackIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Playlist Modal */}
      {isCreatingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-[#E8DDC9] dark:bg-[#141815] border border-[#176B67]/30 dark:border-[#C8F169]/30 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-[#292820] dark:text-[#E8E9DD]">
              Create New Playlist
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="Playlist name (e.g. Gym, Lo-Fi, Favorites)"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#F3EBDD] dark:bg-[#080A09] border border-[#176B67]/25 dark:border-white/10 text-xs text-[#292820] dark:text-[#E8E9DD] focus:outline-none focus:border-[#176B67] dark:focus:border-[#C8F169] placeholder-[#777267]"
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreatingModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] disabled:opacity-50 text-xs font-bold transition active:scale-95"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playlist Import Modal (X1/X2) */}
      <PlaylistImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onPlaylistCreated={(id) => setActivePlaylistId(id)}
      />
    </div>
  );
};
