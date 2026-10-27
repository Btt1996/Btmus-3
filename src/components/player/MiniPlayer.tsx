import React, { useState } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { BttPlaybackAnimation, BttAnimationTrigger } from './BttPlaybackAnimation';

export const MiniPlayer: React.FC = () => {
  const { playerState, togglePlayPause, nextTrack, setIsFullScreenPlayerOpen } = useMusic();
  const { currentTrack, isPlaying, currentTime, duration, isLoading, isSmartMixBlending } = playerState;
  const [bttTrigger, setBttTrigger] = useState<BttAnimationTrigger | null>(null);

  if (!currentTrack) return null;

  const activeDuration = duration > 0 ? duration : currentTrack.duration || 180;
  const progressPercent = activeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / activeDuration) * 100)) : 0;

  const handleMiniPlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlayPause();
    setBttTrigger({ id: Date.now(), type: 'play' });
  };

  const handleMiniNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    nextTrack();
    setBttTrigger({ id: Date.now(), type: 'next' });
  };

  return (
    <div
      className="fixed bottom-[calc(4.4rem+max(env(safe-area-inset-bottom,0px),0.5rem))] left-3.5 right-3.5 z-30 max-w-md mx-auto pointer-events-auto select-none"
      onClick={() => setIsFullScreenPlayerOpen(true)}
    >
      <div className="relative overflow-hidden rounded-[1.8rem] bg-[#E8DDC9]/90 dark:bg-[#141815]/95 backdrop-blur-3xl border border-[#176B67]/25 dark:border-[#C8F169]/30 shadow-[0_12px_36px_rgba(23,107,103,0.18)] dark:shadow-[0_14px_44px_rgba(0,0,0,0.75)] p-2.5 flex items-center gap-3.5 cursor-pointer active:scale-[0.98] transition-all">
        {/* Specular Liquid Top Highlight */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#C8F169]/40 dark:via-[#C8F169]/50 to-transparent pointer-events-none" />

        {/* BTT signature micro-interaction animation overlay */}
        <BttPlaybackAnimation currentTrigger={bttTrigger} />

        {/* Bottom Micro Scrubber Progress Line in Electric Chartreuse & Teal */}
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#292820]/10 dark:bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-[#176B67] to-[#C8F169] transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Small Album Artwork */}
        <div className="w-12 h-12 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] shrink-0 overflow-hidden relative shadow-sm border border-[#176B67]/20 dark:border-[#C8F169]/30 flex items-center justify-center">
          {currentTrack.artworkUrl ? (
            <img
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <img
              src="/app-logo.png"
              alt="BttM"
              className="w-full h-full object-cover"
            />
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-[#C8F169] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Track Title and Artist */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-[#292820] dark:text-[#E8E9DD] truncate leading-snug">
              {currentTrack.title}
            </h4>
            {isSmartMixBlending && (
              <span className="px-1.5 py-0.2 rounded bg-[#C8F169]/25 text-[#176B67] dark:text-[#C8F169] text-[9px] font-mono font-bold shrink-0">
                Mix
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#777267] dark:text-[#92998F] font-medium truncate mt-0.5">
            {currentTrack.artist || 'Unknown Artist'}
          </p>
        </div>

        {/* Mini Controls */}
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleMiniPlayPause}
            className="w-10 h-10 flex items-center justify-center text-[#176B67] dark:text-[#C8F169] transition rounded-full hover:bg-[#C8F169]/20 active:scale-90"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={handleMiniNext}
            className="p-2.5 text-[#777267] hover:text-[#176B67] dark:text-[#92998F] dark:hover:text-[#C8F169] transition rounded-full active:scale-95"
            aria-label="Next track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
