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
  onGoToTab: (tab: 'home' | 'search' | 'library' | 'playlists' | 'sync' | 'settings' | 'import') => void;
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
              Unified Music Search & Discovery
            </div>
            <p className="text-[11px] text-[#777267] dark:text-[#92998F]">
              Search songs across YouTube, Spotify, Telegram, and CC with instant downloads
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
      <div className="p-4 rounded-3xl bg-[#E8DDC9]/75 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#292820]/10 dark:border-white/10 shadow-sm flex items-center justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">Music Library</span>
            <span className="px-2 py-0.5 rounded-full bg-[#176B67]/15 dark:bg-[#C8F169]/15 text-[#176B67] dark:text-[#C8F169] text-[10px] font-bold font-mono">
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
            className="px-3.5 py-2 rounded-xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
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

      {/* SECTION: RECENTLY PLAYED (Apple-Inspired Horizontal Song List) */}
      {recentlyPlayed.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#176B67] dark:text-[#C8F169] font-bold">
                Jump Back In
              </span>
              <h3 className="text-lg font-bold text-[#292820] dark:text-[#E8E9DD] tracking-tight">
                Recently Played
              </h3>
            </div>
            <span className="text-xs text-[#777267] dark:text-[#92998F] font-mono">
              {recentlyPlayed.length} songs
            </span>
          </div>

          {/* Horizontal Scrolling Song Carousel */}
          <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
            {recentlyPlayed.map((track) => (
              <SongHorizontalCard
                key={track.id}
                track={track}
                analysis={trackAnalyses[track.id]}
                isCurrent={playerState.currentTrack?.id === track.id}
                isPlaying={playerState.isPlaying && playerState.currentTrack?.id === track.id}
                onPlay={() => playTrack(track, recentlyPlayed)}
                onToggleFavorite={() => toggleFavorite(track.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* SECTION: FAVORITES (Apple-Inspired Horizontal Song List) */}
      {favoriteTracks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#176B67] dark:text-[#C8F169] font-bold">
                Loved Tracks
              </span>
              <h3 className="text-lg font-bold text-[#292820] dark:text-[#E8E9DD] tracking-tight flex items-center gap-1.5">
                <Heart className="w-4 h-4 fill-current text-rose-500" /> Favorites
              </h3>
            </div>
            <button
              onClick={() => onGoToTab('library')}
              className="text-xs text-[#176B67] dark:text-[#C8F169] hover:underline font-semibold"
            >
              See all ({tracks.filter((t) => t.isFavorite).length})
            </button>
          </div>

          {/* Horizontal Scrolling Favorites Carousel */}
          <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
            {favoriteTracks.map((track) => (
              <SongHorizontalCard
                key={track.id}
                track={track}
                analysis={trackAnalyses[track.id]}
                isCurrent={playerState.currentTrack?.id === track.id}
                isPlaying={playerState.isPlaying && playerState.currentTrack?.id === track.id}
                onPlay={() => playTrack(track, favoriteTracks)}
                onToggleFavorite={() => toggleFavorite(track.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* SECTION: RECENTLY DOWNLOADED / ADDED (Apple-Inspired Horizontal Song List) */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#176B67] dark:text-[#C8F169] font-bold">
              Offline Vault
            </span>
            <h3 className="text-lg font-bold text-[#292820] dark:text-[#E8E9DD] tracking-tight">
              Recently Downloaded
            </h3>
          </div>
          <button
            onClick={() => onGoToTab('library')}
            className="text-xs text-[#176B67] dark:text-[#C8F169] hover:underline font-semibold"
          >
            All songs ({tracks.length}) &rarr;
          </button>
        </div>

        {/* Horizontal Scrolling Recently Downloaded Carousel */}
        <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
          {recentlyAdded.map((track) => (
            <SongHorizontalCard
              key={track.id}
              track={track}
              analysis={trackAnalyses[track.id]}
              isCurrent={playerState.currentTrack?.id === track.id}
              isPlaying={playerState.isPlaying && playerState.currentTrack?.id === track.id}
              onPlay={() => playTrack(track, recentlyAdded)}
              onToggleFavorite={() => toggleFavorite(track.id)}
            />
          ))}
        </div>
      </section>

      {/* Playlists Quick Shortcuts */}
      {playlists.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#176B67] dark:text-[#C8F169] font-bold">
                Collections
              </span>
              <h3 className="text-lg font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5 tracking-tight">
                <ListMusic className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" /> Playlists
              </h3>
            </div>
            <button
              onClick={() => onGoToTab('playlists')}
              className="text-xs text-[#176B67] dark:text-[#C8F169] hover:underline font-semibold"
            >
              See all ({playlists.length})
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => onOpenPlaylist(pl.id)}
                className="w-40 shrink-0 p-3 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-xl border border-[#292820]/10 dark:border-white/10 hover:border-[#176B67] dark:hover:border-[#C8F169] transition flex flex-col text-left group active:scale-95"
              >
                <div className="w-full aspect-square rounded-xl bg-[#292820]/10 dark:bg-white/10 flex items-center justify-center text-[#777267] dark:text-[#92998F] group-hover:text-[#176B67] dark:group-hover:text-[#C8F169] shadow-inner mb-2.5">
                  <ListMusic className="w-8 h-8" />
                </div>
                <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate w-full">
                  {pl.name}
                </h4>
                <p className="text-[10px] text-[#777267] dark:text-[#92998F] font-mono mt-0.5">
                  {pl.trackIds.length} track{pl.trackIds.length !== 1 ? 's' : ''}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

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

// Apple-Inspired Horizontal Song Card
export const SongHorizontalCard: React.FC<{
  track: Track;
  analysis?: any;
  isCurrent?: boolean;
  isPlaying?: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}> = ({ track, analysis, isCurrent, isPlaying, onPlay, onToggleFavorite }) => {
  return (
    <div
      onClick={onPlay}
      className={`w-36 sm:w-40 shrink-0 p-2.5 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-xl border transition-all cursor-pointer group snap-start active:scale-[0.97] select-none ${
        isCurrent
          ? 'border-[#176B67] dark:border-[#C8F169] shadow-[0_0_16px_rgba(200,241,105,0.25)]'
          : 'border-[#292820]/10 dark:border-white/10 hover:border-[#176B67]/40 dark:hover:border-[#C8F169]/40'
      }`}
    >
      {/* Artwork Box */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-[#292820]/10 dark:bg-white/10 shadow-sm border border-[#292820]/10 dark:border-white/10 mb-2">
        {track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt={track.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#777267] dark:text-[#92998F]">
            <Music className="w-8 h-8" />
          </div>
        )}

        {/* Favorite indicator pill top right */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute top-1.5 right-1.5 p-1.5 rounded-full backdrop-blur-md transition ${
            track.isFavorite
              ? 'bg-rose-500/20 text-rose-500'
              : 'bg-black/30 text-white/70 hover:text-white opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Toggle favorite"
        >
          <Heart className={`w-3 h-3 ${track.isFavorite ? 'fill-current' : ''}`} />
        </button>

        {/* Play Icon / Playing Indicator Overlay */}
        <div
          className={`absolute inset-0 bg-black/35 flex items-center justify-center transition-opacity ${
            isPlaying || isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-[#C8F169] text-[#292820] flex items-center justify-center shadow-md scale-95 group-hover:scale-105 transition-transform">
            {isPlaying ? (
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-3 bg-[#292820] rounded-full animate-bounce" />
                <span className="w-1 h-4 bg-[#292820] rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1 h-2 bg-[#292820] rounded-full animate-bounce [animation-delay:0.3s]" />
              </span>
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </div>
        </div>
      </div>

      {/* Song Metadata with Apple typography */}
      <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate leading-tight">
        {track.title}
      </h4>
      <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate mt-0.5 font-medium">
        {track.artist || 'Unknown'}
      </p>

      {/* Footer Info Pill */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#777267] dark:text-[#92998F] mt-1 pt-1 border-t border-[#292820]/5 dark:border-white/5">
        <span>{formatDuration(track.duration)}</span>
        {analysis ? (
          <span className="text-[#176B67] dark:text-[#C8F169] font-bold">
            {analysis.bpm} BPM
          </span>
        ) : track.fileSize ? (
          <span>{formatFileSize(track.fileSize)}</span>
        ) : null}
      </div>
    </div>
  );
};
