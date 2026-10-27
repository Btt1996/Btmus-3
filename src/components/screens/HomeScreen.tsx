import React, { useState } from 'react';
import { Play, Heart, RefreshCw, Send, ListMusic, Music, Wifi, WifiOff, Sparkles, Sliders, Activity, Download, Search } from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { formatDuration, formatFileSize } from '../../utils/id3Parser';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { OnboardingView } from './OnboardingView';
import { Track } from '../../types/music';
import { SmartMixDrawer } from '../player/SmartMixDrawer';
import { PlaylistImportModal } from '../import/PlaylistImportModal';

interface HomeScreenProps {
  onGoToTab: (tab: 'home' | 'search' | 'library' | 'playlists' | 'sync' | 'settings') => void;
  onOpenPlaylist: (playlistId: string) => void;
  onTriggerFileInput: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onGoToTab,
  onOpenPlaylist,
  onTriggerFileInput,
}) => {
  const { tracks, playlists, playTrack, toggleFavorite, storageStats, playerState, trackAnalyses } = useMusic();
  const isOnline = useOnlineStatus();
  const [isSmartMixDrawerOpen, setIsSmartMixDrawerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Greeting based on current local hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (tracks.length === 0) {
    return (
      <OnboardingView
        onGoToSync={() => onGoToTab('sync')}
        onTriggerFileInput={onTriggerFileInput}
      />
    );
  }

  // Filter recently played
  const recentlyPlayed = [...tracks]
    .filter((t) => (t.playCount && t.playCount > 0) || t.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    .slice(0, 6);

  // Favorite tracks
  const favoriteTracks = tracks.filter((t) => t.isFavorite).slice(0, 8);

  // Recently added
  const recentlyAdded = [...tracks].sort((a, b) => b.downloadDate - a.downloadDate).slice(0, 8);

  const smartMixConfig = playerState.smartMixConfig;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-notch pb-8 space-y-6 max-w-lg mx-auto w-full select-none">
      {/* Header: Brand, Greeting & Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md border border-[#176B67]/30 dark:border-[#C8F169]/30 bg-[#E8DDC9] dark:bg-[#141815] shrink-0">
            <img
              src="/app-logo.png"
              alt="BttM Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black tracking-widest uppercase text-[#176B67] dark:text-[#C8F169] font-mono">
                bttm By Ahmed Taboubi
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-[#176B67]/15 dark:bg-[#C8F169]/15 text-[9px] font-bold text-[#176B67] dark:text-[#C8F169]">
                Offline
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#292820] dark:text-[#E8E9DD] tracking-tight mt-0.5 truncate font-sans">
              {getGreeting()}
            </h1>
          </div>
        </div>

        {/* Online / Offline status badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            isOnline
              ? 'bg-[#E8DDC9]/70 dark:bg-[#141815]/80 border-[#292820]/10 dark:border-white/10 text-[#292820] dark:text-[#E8E9DD]'
              : 'bg-[#E8DDC9]/40 dark:bg-[#141815]/50 border-[#292820]/10 dark:border-white/10 text-[#777267] dark:text-[#92998F]'
          }`}
        >
          {isOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#176B67] dark:bg-[#C8F169]" />
              <Wifi className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
              <span className="font-mono text-[11px]">Online</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[#777267]" />
              <WifiOff className="w-3.5 h-3.5" />
              <span className="font-mono text-[11px]">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Discovery / Search Callout */}
      <div
        onClick={() => onGoToTab('search')}
        className="p-3.5 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-xl border border-[#292820]/10 dark:border-white/10 shadow-sm flex items-center justify-between cursor-pointer hover:border-[#176B67] dark:hover:border-[#C8F169] transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#C8F169] text-[#292820] flex items-center justify-center font-bold">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-[#292820] dark:text-[#E8E9DD] tracking-tight">
              X1 & X2 Music Discovery
            </div>
            <p className="text-[11px] text-[#777267] dark:text-[#92998F]">
              Search Apple iTunes, YouTube recordings, and SoundCloud
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-[#176B67] dark:text-[#C8F169]">&rarr;</span>
      </div>

      {/* Btt Smart Mix Quick Action & Status Banner */}
      <div
        onClick={() => setIsSmartMixDrawerOpen(true)}
        className="p-4 rounded-3xl bg-[#E8DDC9]/75 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#292820]/10 dark:border-white/10 shadow-sm cursor-pointer hover:border-[#176B67] dark:hover:border-[#C8F169] transition-all group active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#292820] dark:text-[#E8E9DD] tracking-wide">
                  BTT SMART MIX
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    smartMixConfig.enabled
                      ? 'bg-[#C8F169] text-[#292820]'
                      : 'bg-[#292820]/10 dark:bg-white/10 text-[#777267] dark:text-[#92998F]'
                  }`}
                >
                  {smartMixConfig.enabled
                    ? `${smartMixConfig.preset.toUpperCase()} (${smartMixConfig.duration}s)`
                    : 'OFF'}
                </span>
              </div>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F] mt-0.5">
                {smartMixConfig.enabled
                  ? 'Continuous DJ equal-power crossfades & harmonic mixes'
                  : 'Tap to configure seamless transitions and silence trimming'}
              </p>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#292820]/5 dark:bg-white/10 text-[#292820] dark:text-[#E8E9DD] group-hover:bg-[#C8F169] group-hover:text-[#292820] transition">
            <Sliders className="w-4 h-4" />
          </div>
        </div>

        {/* Acoustic stats strip */}
        <div className="mt-3 pt-2.5 border-t border-[#292820]/10 dark:border-white/10 flex items-center justify-between text-[10px] text-[#777267] dark:text-[#92998F]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-[#292820] dark:text-[#E8E9DD]">
              <Activity className="w-3 h-3 text-[#176B67] dark:text-[#C8F169]" />
              {Object.keys(trackAnalyses).length}/{tracks.length} Analyzed
            </span>
            {smartMixConfig.useHarmonicMixing && (
              <span className="text-[#176B67] dark:text-[#62D8C8] font-bold">Harmonic Match</span>
            )}
            {smartMixConfig.trimSilence && (
              <span>Trim Silence</span>
            )}
          </div>
          <span className="font-semibold text-[#176B67] dark:text-[#C8F169] group-hover:underline">
            Configure &rarr;
          </span>
        </div>
      </div>

      {/* Prominent Quick Sync & Storage Metric Card */}
      <div className="p-4 rounded-3xl bg-[#E8DDC9]/60 dark:bg-[#141815]/70 backdrop-blur-xl border border-[#292820]/10 dark:border-white/10 shadow-sm flex items-center justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">Music Library</span>
            <span className="px-2 py-0.5 rounded-md bg-[#292820]/10 dark:bg-white/10 text-[#292820] dark:text-[#E8E9DD] text-[10px] font-bold font-mono">
              {tracks.length} Songs Stored
            </span>
          </div>
          <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate font-mono">
            {formatFileSize(storageStats.trackBytes)} cached offline on this iPhone
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={() => onGoToTab('sync')}
            className="px-3 py-2 rounded-xl bg-[#292820]/10 dark:bg-white/10 text-[#292820] dark:text-[#E8E9DD] text-xs font-semibold flex items-center gap-1 transition active:scale-95"
          >
            <RefreshCw className="w-3 h-3" />
            Sync
          </button>
        </div>
      </div>

      {/* Playlists Quick Shortcuts */}
      {playlists.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5">
              <ListMusic className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" /> Playlists
            </h3>
            <button
              onClick={() => onGoToTab('playlists')}
              className="text-xs text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-[#E8E9DD] font-semibold"
            >
              See all ({playlists.length})
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {playlists.slice(0, 4).map((pl) => (
              <button
                key={pl.id}
                onClick={() => onOpenPlaylist(pl.id)}
                className="p-3 rounded-2xl bg-[#E8DDC9]/50 dark:bg-[#141815]/60 border border-[#292820]/10 dark:border-white/10 hover:border-[#176B67] dark:hover:border-[#C8F169] transition flex items-center gap-2.5 text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#292820]/10 dark:bg-white/10 flex items-center justify-center text-[#777267] dark:text-[#92998F] group-hover:text-[#292820] dark:group-hover:text-white shrink-0">
                  <ListMusic className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                    {pl.name}
                  </h4>
                  <p className="text-[10px] text-[#777267] dark:text-[#92998F]">
                    {pl.trackIds.length} track{pl.trackIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD]">Recently Played</h3>
            <span className="text-[11px] text-[#777267] dark:text-[#92998F] font-mono">
              {recentlyPlayed.length} songs
            </span>
          </div>

          <div className="space-y-2">
            {recentlyPlayed.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                analysis={trackAnalyses[track.id]}
                onPlay={() => playTrack(track, recentlyPlayed)}
                onToggleFavorite={() => toggleFavorite(track.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Favorites Carousel */}
      {favoriteTracks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5">
              <Heart className="w-4 h-4 fill-current text-rose-500" /> Favorites
            </h3>
            <button
              onClick={() => onGoToTab('library')}
              className="text-xs text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-[#E8E9DD] font-semibold"
            >
              View in library
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
            {favoriteTracks.map((track) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, favoriteTracks)}
                className="w-28 shrink-0 cursor-pointer group space-y-1.5"
              >
                <div className="w-28 h-28 rounded-2xl bg-[#E8DDC9] dark:bg-[#141815] border border-[#292820]/10 dark:border-white/10 overflow-hidden relative shadow-sm group-hover:scale-[1.02] transition-transform">
                  {track.artworkUrl ? (
                    <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#777267] dark:text-[#92998F]">
                      <Music className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-7 h-7 text-[#C8F169] fill-current" />
                  </div>
                </div>
                <h4 className="text-xs font-semibold text-[#292820] dark:text-[#E8E9DD] truncate">{track.title}</h4>
                <p className="text-[10px] text-[#777267] dark:text-[#92998F] truncate">{track.artist}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently Downloaded */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD]">Recently Downloaded</h3>
          <button
            onClick={() => onGoToTab('library')}
            className="text-xs text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-[#E8E9DD] font-semibold"
          >
            All songs ({tracks.length})
          </button>
        </div>

        <div className="space-y-2">
          {recentlyAdded.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              analysis={trackAnalyses[track.id]}
              onPlay={() => playTrack(track, recentlyAdded)}
              onToggleFavorite={() => toggleFavorite(track.id)}
            />
          ))}
        </div>
      </section>

      {/* Smart Mix Drawer */}
      <SmartMixDrawer
        isOpen={isSmartMixDrawerOpen}
        onClose={() => setIsSmartMixDrawerOpen(false)}
      />

      {/* Playlist Import Modal */}
      <PlaylistImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onPlaylistCreated={(id) => onOpenPlaylist(id)}
      />
    </div>
  );
};

export const TrackRow: React.FC<{
  track: Track;
  analysis?: any;
  onPlay: () => void;
  onToggleFavorite: () => void;
}> = ({ track, analysis, onPlay, onToggleFavorite }) => {
  return (
    <div
      onClick={onPlay}
      className="flex items-center justify-between p-2.5 rounded-2xl bg-[#E8DDC9]/50 dark:bg-[#141815]/60 hover:bg-[#E8DDC9] dark:hover:bg-[#141815] border border-[#292820]/10 dark:border-white/10 transition cursor-pointer group active:scale-[0.99]"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-xl bg-[#292820]/10 dark:bg-white/10 shrink-0 overflow-hidden relative flex items-center justify-center border border-[#292820]/10 dark:border-white/10">
          {track.artworkUrl ? (
            <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <Music className="w-4 h-4 text-[#777267] dark:text-[#92998F]" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play className="w-4 h-4 text-[#C8F169] fill-current ml-0.5" />
          </div>
        </div>

        <div className="min-w-0 flex-1 pr-2">
          <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
            {track.title}
          </h4>
          <div className="flex items-center gap-1.5 text-[10px] text-[#777267] dark:text-[#92998F] truncate mt-0.5">
            <span className="truncate">{track.artist}</span>
            {track.telegramSource && (
              <>
                <span>•</span>
                <span className="text-[#292820] dark:text-[#E8E9DD] flex items-center gap-0.5 shrink-0">
                  <Send className="w-2.5 h-2.5 text-[#176B67] dark:text-[#C8F169]" />
                  {track.telegramSource.topicName || track.telegramSource.chatTitle || 'TG'}
                </span>
              </>
            )}
            {analysis && (
              <>
                <span>•</span>
                <span className="font-mono font-medium shrink-0 text-[#176B67] dark:text-[#C8F169]">
                  {analysis.bpm} BPM • {analysis.camelot}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-mono text-[#777267] dark:text-[#92998F]">
          {formatDuration(track.duration)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="p-1.5 text-[#777267] dark:text-[#92998F] hover:text-rose-500 transition"
          aria-label="Toggle favorite"
        >
          <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current text-rose-500' : ''}`} />
        </button>
      </div>
    </div>
  );
};
