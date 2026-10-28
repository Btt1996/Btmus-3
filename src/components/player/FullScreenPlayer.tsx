import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ListPlus,
  ListMusic,
  Mic2,
  Sparkles,
  Activity,
  Disc3,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusic } from '../../context/MusicContext';
import { formatDuration } from '../../utils/id3Parser';
import * as db from '../../services/db';
import { AddToPlaylistModal } from './AddToPlaylistModal';
import { QueueModal } from './QueueModal';
import { SmartMixDrawer } from './SmartMixDrawer';
import { LyricsView } from './LyricsView';
import { CircularVolumeDial } from './CircularVolumeDial';
import { BttPlaybackAnimation, BttAnimationTrigger } from './BttPlaybackAnimation';

export const FullScreenPlayer: React.FC = () => {
  const {
    playerState,
    isFullScreenPlayerOpen,
    setIsFullScreenPlayerOpen,
    togglePlayPause,
    seekTo,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeatMode,
    toggleFavorite,
    setPlaybackRate,
    showToast,
  } = useMusic();

  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSmartMixOpen, setIsSmartMixOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);

  // BTT Playback signature animation state
  const [bttTrigger, setBttTrigger] = useState<BttAnimationTrigger | null>(null);
  const [activeBttButton, setActiveBttButton] = useState<'play' | 'next' | 'prev' | null>(null);

  // Seeking Interaction State
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragSeekTime, setDragSeekTime] = useState(0);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    isShuffle,
    repeatMode,
    isLoading,
    playbackRate,
    smartMixConfig,
    isSmartMixBlending,
    activeAnalysis,
  } = playerState;

  useEffect(() => {
    if (!isDraggingSeek) {
      setDragSeekTime(currentTime);
    }
  }, [currentTime, isDraggingSeek]);

  if (!isFullScreenPlayerOpen || !currentTrack) return null;

  const activeDuration = duration > 0 ? duration : currentTrack.duration || 180;
  const displayTime = isDraggingSeek ? dragSeekTime : currentTime;
  const progressPercent = activeDuration > 0 ? Math.min(100, Math.max(0, (displayTime / activeDuration) * 100)) : 0;
  const remainingTime = Math.max(0, activeDuration - displayTime);

  const calculateSeekFromEvent = (clientX: number) => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    return fraction * activeDuration;
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingSeek(true);
    const targetTime = calculateSeekFromEvent(e.clientX);
    setDragSeekTime(targetTime);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const movedTime = calculateSeekFromEvent(moveEvent.clientX);
      setDragSeekTime(movedTime);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const finalTime = calculateSeekFromEvent(upEvent.clientX);
      setIsDraggingSeek(false);
      seekTo(finalTime);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTimelineTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    setIsDraggingSeek(true);
    const targetTime = calculateSeekFromEvent(e.touches[0].clientX);
    setDragSeekTime(targetTime);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return;
      const movedTime = calculateSeekFromEvent(moveEvent.touches[0].clientX);
      setDragSeekTime(movedTime);
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      const touch = endEvent.changedTouches[0];
      const finalTime = touch ? calculateSeekFromEvent(touch.clientX) : dragSeekTime;
      setIsDraggingSeek(false);
      seekTo(finalTime);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  // Play in other app (VLC, Clik, Documents, Files, etc. via native Share Sheet)
  const handlePlayInOtherApp = async () => {
    if (!currentTrack) return;
    try {
      showToast('Preparing audio for other player app...');
      const blob = await db.getAudioBlob(currentTrack.id);
      if (!blob) {
        showToast('Audio file not found in offline storage');
        return;
      }
      const safeTitle = (currentTrack.title || 'song').replace(/[/\\?%*:|"<>]/g, '_');
      const ext = currentTrack.fileName?.split('.').pop() || 'mp3';
      const file = new File([blob], `${safeTitle}.${ext}`, { type: blob.type || 'audio/mpeg' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: currentTrack.title,
          text: `Play ${currentTrack.title} in external player`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showToast('Audio file exported to open in other app');
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        showToast('Could not open in other app');
      }
    }
  };

  // Playback handlers with Signature BTT Button Animation Triggers
  const handlePlayPauseClick = () => {
    togglePlayPause();
    setBttTrigger({ id: Date.now(), type: 'play' });
    setActiveBttButton('play');
    setTimeout(() => setActiveBttButton(null), 450);
  };

  const handleNextClick = () => {
    nextTrack();
    setBttTrigger({ id: Date.now(), type: 'next' });
    setActiveBttButton('next');
    setTimeout(() => setActiveBttButton(null), 450);
  };

  const handlePrevClick = () => {
    prevTrack();
    setBttTrigger({ id: Date.now(), type: 'previous' });
    setActiveBttButton('prev');
    setTimeout(() => setActiveBttButton(null), 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F3EBDD] dark:bg-[#080A09] text-[#292820] dark:text-[#E8E9DD] select-none overflow-hidden transition-colors duration-300">
      {/* Background Liquid Glass Ambient Artwork Glow with Brand Tint */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40 dark:opacity-30 filter blur-3xl scale-125 transition-all duration-700">
        {currentTrack.artworkUrl ? (
          <img
            src={currentTrack.artworkUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-[#176B67] via-[#C8F169]/40 to-[#62D8C8]" />
        )}
      </div>

      {/* Main Player Container */}
      <div className="relative z-10 flex-1 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto w-full pt-[max(env(safe-area-inset-top,0px),1rem)] pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-2 shrink-0">
          <button
            onClick={() => setIsFullScreenPlayerOpen(false)}
            className="p-2.5 rounded-full bg-[#E8DDC9]/80 dark:bg-[#141815]/85 backdrop-blur-xl border border-[#176B67]/20 dark:border-[#C8F169]/30 text-[#176B67] dark:text-[#C8F169] active:scale-90 transition shadow-xs"
            aria-label="Minimize player"
          >
            <ChevronDown className="w-5 h-5" />
          </button>

          {/* Discreet Branding: bttm By Ahmed Taboubi */}
          <div className="text-center flex flex-col items-center">
            <span className="text-[10.5px] font-mono tracking-widest uppercase font-black text-[#176B67] dark:text-[#C8F169]">
              BttM <span className="lowercase font-normal tracking-normal text-[#777267] dark:text-[#92998F]">By</span> Ahmed Taboubi
            </span>
            <span className="text-[9px] font-mono text-[#777267] dark:text-[#92998F] font-bold">
              NOW PLAYING
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Smart Mix Drawer */}
            <button
              onClick={() => setIsSmartMixOpen(true)}
              className={`p-2.5 rounded-full backdrop-blur-xl border transition active:scale-90 ${
                smartMixConfig.enabled
                  ? 'bg-[#C8F169]/30 text-[#176B67] dark:text-[#C8F169] border-[#176B67]/30 dark:border-[#C8F169]/50 shadow-xs'
                  : 'bg-[#E8DDC9]/80 dark:bg-[#141815]/80 text-[#777267] dark:text-[#92998F] border-[#292820]/10 dark:border-white/10'
              }`}
              title="Btt Smart Mix"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Queue Toggle */}
            <button
              onClick={() => setIsQueueOpen(true)}
              className="p-2.5 rounded-full bg-[#E8DDC9]/80 dark:bg-[#141815]/80 backdrop-blur-xl border border-[#176B67]/20 dark:border-[#C8F169]/30 text-[#176B67] dark:text-[#C8F169] active:scale-90 transition relative shadow-xs"
              aria-label="Open queue"
            >
              <ListMusic className="w-4 h-4" />
              {playerState.queue.length > 1 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#C8F169] shadow-xs" />
              )}
            </button>
          </div>
        </div>

        {/* Center Main Stage: Album Artwork or Synced Lyrics Panel */}
        <div className="flex-1 flex items-center justify-center my-auto py-2 w-full">
          {isLyricsOpen ? (
            <div className="w-full animate-in fade-in zoom-in-95 duration-200">
              <LyricsView
                track={currentTrack}
                currentTime={currentTime}
                duration={activeDuration}
                onSeek={seekTo}
                onClose={() => setIsLyricsOpen(false)}
              />
            </div>
          ) : (
            <motion.div
              animate={{
                scale: isPlaying ? [1, 1.018, 1] : 1,
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="w-full max-w-[310px] sm:max-w-[330px] aspect-square rounded-[2.5rem] p-2 bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-3xl border border-[#176B67]/25 dark:border-[#C8F169]/30 shadow-[0_20px_50px_rgba(23,107,103,0.18)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.85)] relative group overflow-hidden"
            >
              <div className="w-full h-full rounded-[2rem] overflow-hidden bg-[#E8DDC9] dark:bg-[#141815] relative">
                {currentTrack.artworkUrl ? (
                  <img
                    src={currentTrack.artworkUrl}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover select-none transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <img
                    src="/app-logo.png"
                    alt="BttM"
                    className="w-full h-full object-cover select-none"
                  />
                )}

                {/* Acoustic camelot badge if analyzed */}
                {activeAnalysis && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#141815]/80 backdrop-blur-md border border-[#C8F169]/40 text-[9.5px] font-mono font-bold text-[#E8E9DD] flex items-center gap-1.5 shadow-md">
                    <Activity className="w-3 h-3 text-[#C8F169]" />
                    <span>{activeAnalysis.bpm} BPM</span>
                    <span>•</span>
                    <span>{activeAnalysis.camelot}</span>
                  </div>
                )}

                {isLoading && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                    <div className="w-10 h-10 border-3 border-[#C8F169] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Lower Controls & Floating Dial Section */}
        <div className="space-y-3 shrink-0 pt-1">
          {/* Track Info & Actions Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-black text-[#292820] dark:text-[#E8E9DD] truncate tracking-tight">
                {currentTrack.title}
              </h2>
              <p className="text-sm sm:text-base text-[#176B67] dark:text-[#62D8C8] font-bold truncate mt-0.5">
                {currentTrack.artist || 'Unknown Artist'}
              </p>
              {currentTrack.album && currentTrack.album !== 'Unknown Album' && (
                <p className="text-xs text-[#777267] dark:text-[#92998F] truncate font-medium mt-0.5">
                  {currentTrack.album}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* PLAY IN OTHER APP BUTTON */}
              <button
                onClick={handlePlayInOtherApp}
                className="px-2.5 py-1.5 rounded-xl bg-[#E8DDC9]/80 dark:bg-[#141815]/80 text-[#176B67] dark:text-[#C8F169] border border-[#176B67]/25 dark:border-[#C8F169]/30 hover:border-[#C8F169] text-xs font-bold flex items-center gap-1 transition active:scale-90 shadow-xs"
                title="Play in other app (VLC, Clik, Documents, Files)"
                aria-label="Play in other app"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="text-[11px]">Open in App</span>
              </button>

              {/* RESTORED PROMINENT LYRICS BUTTON */}
              <button
                onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                className={`px-3 py-1.5 rounded-xl transition active:scale-90 border text-xs font-bold flex items-center gap-1.5 shadow-xs ${
                  isLyricsOpen
                    ? 'bg-[#C8F169] text-[#292820] border-[#C8F169]'
                    : 'bg-[#E8DDC9]/80 dark:bg-[#141815]/80 text-[#176B67] dark:text-[#C8F169] border-[#176B67]/25 dark:border-[#C8F169]/30 hover:border-[#C8F169]'
                }`}
                title="Toggle Synced Lyrics"
                aria-label="Toggle Lyrics"
              >
                <Mic2 className="w-3.5 h-3.5" />
                <span>Lyrics</span>
              </button>

              {/* Favorite */}
              <button
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`p-2 rounded-full transition active:scale-90 border ${
                  currentTrack.isFavorite
                    ? 'text-rose-500 bg-rose-500/10 border-rose-500/30'
                    : 'bg-[#E8DDC9]/70 dark:bg-[#141815]/70 text-[#777267] dark:text-[#92998F] border-[#292820]/10 dark:border-white/10'
                }`}
                aria-label="Favorite song"
              >
                <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-current' : ''}`} />
              </button>

              {/* Add to Playlist */}
              <button
                onClick={() => setIsAddToPlaylistOpen(true)}
                className="p-2 rounded-full bg-[#E8DDC9]/70 dark:bg-[#141815]/70 border border-[#292820]/10 dark:border-white/10 text-[#777267] dark:text-[#92998F] active:scale-90 transition"
                aria-label="Add to playlist"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Timeline Scrubber */}
          <div className="space-y-1">
            <div
              ref={progressBarRef}
              onMouseDown={handleTimelineMouseDown}
              onTouchStart={handleTimelineTouchStart}
              className="relative w-full h-6 flex items-center cursor-pointer group"
            >
              {/* Background Track */}
              <div className="w-full h-1.5 bg-[#292820]/15 dark:bg-white/10 rounded-full overflow-hidden relative group-hover:h-2 transition-all">
                {/* Played Progress Bar in Electric Chartreuse & Deep Teal */}
                <div
                  className="h-full bg-gradient-to-r from-[#176B67] via-[#62D8C8] to-[#C8F169] rounded-full transition-all duration-75 shadow-xs"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Scrubber Thumb */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 rounded-full bg-[#176B67] dark:bg-[#C8F169] shadow-md transition-transform ${
                  isDraggingSeek ? 'scale-125 ring-4 ring-[#C8F169]/40' : 'group-hover:scale-110'
                }`}
                style={{ left: `${progressPercent}%` }}
              />

              {/* Drag Position Live Tooltip */}
              {isDraggingSeek && (
                <div
                  className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[#292820] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] text-[10px] font-mono font-bold shadow-lg pointer-events-none"
                  style={{ left: `${progressPercent}%` }}
                >
                  {formatDuration(displayTime)}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs font-mono font-bold text-[#777267] dark:text-[#92998F]">
              <span className={isDraggingSeek ? 'text-[#176B67] dark:text-[#C8F169]' : ''}>
                {formatDuration(displayTime)}
              </span>
              <span>-{formatDuration(remainingTime)}</span>
            </div>
          </div>

          {/* Primary Controls Row with Signature BTT Playback Animation */}
          <div className="relative flex items-center justify-between px-2 pt-1">
            {/* SIGNATURE BTT PLAYBACK ANIMATION OVERLAY */}
            <BttPlaybackAnimation currentTrigger={bttTrigger} />

            <button
              onClick={toggleShuffle}
              className={`p-2.5 rounded-full transition active:scale-90 ${
                isShuffle
                  ? 'text-[#176B67] dark:text-[#C8F169] bg-[#C8F169]/20'
                  : 'text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white'
              }`}
              aria-label="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            {/* Previous Button with Tactile BTT Animation */}
            <button
              onClick={handlePrevClick}
              className={`p-3 rounded-full text-[#292820] dark:text-[#E8E9DD] hover:text-[#176B67] dark:hover:text-[#C8F169] transition-all duration-200 active:scale-75 ${
                activeBttButton === 'prev'
                  ? '-translate-x-2 text-[#C8F169] bg-[#C8F169]/20 shadow-[0_0_20px_rgba(200,241,105,0.6)]'
                  : ''
              }`}
              aria-label="Previous track"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>

            {/* Prominent Chartreuse Play/Pause Button with Signature BTT Tactile Animation */}
            <button
              onClick={handlePlayPauseClick}
              className={`w-18 h-18 rounded-full bg-[#C8F169] text-[#292820] flex items-center justify-center transition-all duration-300 shadow-[0_8px_28px_rgba(200,241,105,0.45)] select-none ${
                activeBttButton === 'play'
                  ? 'scale-115 ring-4 ring-[#C8F169]/70 shadow-[0_0_36px_rgba(200,241,105,0.9)]'
                  : isPlaying
                  ? 'ring-2 ring-[#C8F169]/40 hover:scale-105 active:scale-90 shadow-[0_0_24px_rgba(200,241,105,0.4)]'
                  : 'hover:scale-105 active:scale-90'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1" />
              )}
            </button>

            {/* Next Button with Tactile BTT Animation */}
            <button
              onClick={handleNextClick}
              className={`p-3 rounded-full text-[#292820] dark:text-[#E8E9DD] hover:text-[#176B67] dark:hover:text-[#C8F169] transition-all duration-200 active:scale-75 ${
                activeBttButton === 'next'
                  ? 'translate-x-2 text-[#C8F169] bg-[#C8F169]/20 shadow-[0_0_20px_rgba(200,241,105,0.6)]'
                  : ''
              }`}
              aria-label="Next track"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>

            <button
              onClick={cycleRepeatMode}
              className={`p-2.5 rounded-full transition active:scale-90 ${
                repeatMode !== 'off'
                  ? 'text-[#176B67] dark:text-[#C8F169] bg-[#C8F169]/20'
                  : 'text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white'
              }`}
              aria-label="Repeat"
            >
              {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </button>
          </div>

          {/* SIGNATURE FLOATING CIRCULAR VOLUME & BOOSTER DIAL (Pillar 5) */}
          <div className="pt-1 flex justify-center">
            <CircularVolumeDial />
          </div>
        </div>
      </div>

      {/* Drawers & Modals */}
      <AddToPlaylistModal
        isOpen={isAddToPlaylistOpen}
        onClose={() => setIsAddToPlaylistOpen(false)}
        track={currentTrack}
      />

      <QueueModal
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
      />

      <SmartMixDrawer
        isOpen={isSmartMixOpen}
        onClose={() => setIsSmartMixOpen(false)}
      />
    </div>
  );
};
