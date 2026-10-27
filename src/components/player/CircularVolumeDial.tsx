import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Volume1, Zap, Sliders, X, Sparkles, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusic } from '../../context/MusicContext';

interface CircularVolumeDialProps {
  className?: string;
}

export const CircularVolumeDial: React.FC<CircularVolumeDialProps> = ({ className = '' }) => {
  const { playerState, setVolume, setVolumeBooster, toggleVolumeBooster } = useMusic();
  const { volume, volumeBooster, isBoosterActive, isMuted } = playerState;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Close on tap outside the modal card (only when not actively dragging a slider)
  const handleBackdropClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (isDraggingSlider) return;
    if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
      setIsExpanded(false);
    }
  };

  // Calculations for Semicircle Arcs
  // Upper semicircle: 180 degrees (from 180° to 360° / PI to 2PI)
  // Lower semicircle: 180 degrees (from 0° to 180° / 0 to PI)
  const radius = 28;
  const circumference = Math.PI * radius; // length of half circle arc ≈ 87.96

  // Volume arc (upper half)
  const effectiveVol = isMuted ? 0 : volume;
  const volDashoffset = circumference * (1 - effectiveVol);

  // Booster arc (lower half)
  // Booster goes from 1.0 to 3.0 (0 to 100% of boost capability)
  const boosterRatio = isBoosterActive ? Math.min(1, Math.max(0, (volumeBooster - 1.0) / 2.0)) : 0;
  const boosterDashoffset = circumference * (1 - boosterRatio);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* COLLAPSED STATE: Physical Liquid Glass Circular Audio Dial */}
      <motion.button
        type="button"
        onClick={() => setIsExpanded(true)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className="relative w-18 h-18 rounded-full p-1 bg-[#E8DDC9]/80 dark:bg-[#141815]/90 backdrop-blur-3xl border border-[#176B67]/25 dark:border-[#C8F169]/30 shadow-[0_8px_32px_rgba(23,107,103,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.7)] flex items-center justify-center cursor-pointer select-none group"
        title="Tap to adjust Volume & Audio Booster"
        aria-label="Audio dial - tap to expand"
      >
        {/* Specular glass gloss highlight */}
        <div className="absolute inset-1 rounded-full bg-gradient-to-tr from-[#C8F169]/20 via-transparent to-white/20 pointer-events-none" />

        {/* Semicircle SVG Arcs */}
        <svg className="w-16 h-16 -rotate-90 pointer-events-none" viewBox="0 0 72 72">
          {/* Upper Semicircle Track (Volume Background) */}
          <path
            d="M 36,8 A 28,28 0 0,1 36,64"
            fill="none"
            stroke="currentColor"
            className="text-[#292820]/15 dark:text-white/10"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Upper Semicircle Active (Volume Value) */}
          <path
            d="M 36,8 A 28,28 0 0,1 36,64"
            fill="none"
            stroke="#C8F169"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={volDashoffset}
            strokeLinecap="round"
            className="transition-all duration-200"
          />

          {/* Lower Semicircle Track (Booster Background) */}
          <path
            d="M 36,64 A 28,28 0 0,1 36,8"
            fill="none"
            stroke="currentColor"
            className="text-[#292820]/15 dark:text-white/10"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Lower Semicircle Active (Booster Value) */}
          <path
            d="M 36,64 A 28,28 0 0,1 36,8"
            fill="none"
            stroke={isBoosterActive ? '#62D8C8' : '#777267'}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={boosterDashoffset}
            strokeLinecap="round"
            className="transition-all duration-200"
          />
        </svg>

        {/* Center Glass Core with Numerical Display & Icon */}
        <div className="absolute inset-3.5 rounded-full bg-[#F3EBDD]/95 dark:bg-[#080A09]/95 border border-[#176B67]/20 dark:border-white/10 shadow-inner flex flex-col items-center justify-center text-center">
          {isBoosterActive && volumeBooster > 1.05 ? (
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10px] font-mono font-black text-[#176B67] dark:text-[#62D8C8]">
                {volumeBooster.toFixed(1)}x
              </span>
              <span className="text-[7.5px] font-mono font-bold text-[#176B67] dark:text-[#C8F169] mt-0.5">
                BOOST
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10.5px] font-mono font-black text-[#292820] dark:text-[#E8E9DD]">
                {Math.round(effectiveVol * 100)}%
              </span>
              <span className="text-[7.5px] font-mono font-bold text-[#777267] dark:text-[#92998F] mt-0.5">
                VOL
              </span>
            </div>
          )}
        </div>
      </motion.button>

      {/* EXPANDED INTERACTIVE MENU (Rendered via React Portal directly into body) */}
      {/* Solves issue 1: never clipped by overflow-hidden, safe-area aware, perfectly visible & scrollable */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleBackdropClick}
                className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center items-center bg-black/60 dark:bg-black/75 backdrop-blur-md p-3 sm:p-6 pb-[max(env(safe-area-inset-bottom,0px),1rem)] select-none"
              >
                <motion.div
                  ref={cardRef}
                  initial={{ opacity: 0, y: 50, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 40, scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm rounded-[2.2rem] bg-[#F3EBDD]/95 dark:bg-[#141815]/95 backdrop-blur-3xl border border-[#176B67]/30 dark:border-[#C8F169]/35 shadow-[0_24px_64px_rgba(0,0,0,0.4)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.85)] p-4 sm:p-5 space-y-4 max-h-[82vh] overflow-y-auto"
                >
                  {/* Header with Title and Close Button */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#292820]/10 dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-[#C8F169] text-[#292820] flex items-center justify-center font-bold shadow-xs">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black tracking-wide uppercase text-[#292820] dark:text-[#E8E9DD] font-mono">
                          Audio Dial & Booster
                        </div>
                        <p className="text-[10px] text-[#176B67] dark:text-[#C8F169] font-medium">
                          Master gain with limiter protection
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsExpanded(false)}
                      className="p-1.5 rounded-full bg-[#E8DDC9] dark:bg-[#080A09] hover:bg-black/10 dark:hover:bg-white/10 text-[#292820] dark:text-[#E8E9DD] transition active:scale-90"
                      aria-label="Close menu"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* UPPER SECTION: PRIMARY VOLUME (0 to 100%) */}
                  <div className="p-3 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#080A09]/60 border border-[#292820]/10 dark:border-white/10 space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">
                      <span className="flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" />
                        <span>Master Volume</span>
                      </span>
                      <span className="font-mono text-xs font-black text-[#176B67] dark:text-[#C8F169]">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>

                    {/* Slider Track with Custom styling */}
                    <div className="relative py-1 flex items-center">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(volume * 100)}
                        onMouseDown={() => setIsDraggingSlider(true)}
                        onTouchStart={() => setIsDraggingSlider(true)}
                        onMouseUp={() => setIsDraggingSlider(false)}
                        onTouchEnd={() => setIsDraggingSlider(false)}
                        onChange={(e) => setVolume(Number(e.target.value) / 100)}
                        className="w-full h-3 rounded-full appearance-none cursor-pointer bg-[#292820]/15 dark:bg-white/15 accent-[#C8F169]"
                      />
                    </div>
                  </div>

                  {/* LOWER SECTION: 3X AUDIO BOOSTER STAGE */}
                  <div className="p-3 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#080A09]/60 border border-[#292820]/10 dark:border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">
                          <Zap className="w-4 h-4 text-[#176B67] dark:text-[#62D8C8]" />
                          <span>Hardware Booster</span>
                        </div>
                        <span className="text-[10px] text-[#777267] dark:text-[#92998F]">
                          Web Audio studio compressor prevents clipping
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleVolumeBooster()}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 active:scale-95 ${
                          isBoosterActive
                            ? 'bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] shadow-sm'
                            : 'bg-[#292820]/10 dark:bg-white/10 text-[#777267] dark:text-[#92998F]'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>{isBoosterActive ? 'Active' : 'Off'}</span>
                      </button>
                    </div>

                    {/* Booster Intensity Slider */}
                    {isBoosterActive && (
                      <div className="space-y-1 pt-1 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center text-[11px] font-mono">
                          <span className="text-[#777267] dark:text-[#92998F]">Booster Multiplier:</span>
                          <span className="font-bold text-[#176B67] dark:text-[#62D8C8]">
                            {volumeBooster.toFixed(1)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1.0}
                          max={3.0}
                          step={0.1}
                          value={volumeBooster}
                          onMouseDown={() => setIsDraggingSlider(true)}
                          onTouchStart={() => setIsDraggingSlider(true)}
                          onMouseUp={() => setIsDraggingSlider(false)}
                          onTouchEnd={() => setIsDraggingSlider(false)}
                          onChange={(e) => setVolumeBooster(Number(e.target.value))}
                          className="w-full h-3 rounded-full appearance-none cursor-pointer bg-[#292820]/15 dark:bg-white/15 accent-[#62D8C8]"
                        />
                      </div>
                    )}

                    {/* Quick Presets */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      {[1.0, 1.5, 2.0, 3.0].map((preset) => {
                        const isActive =
                          preset === 1.0
                            ? !isBoosterActive || volumeBooster <= 1.05
                            : isBoosterActive && Math.abs(volumeBooster - preset) < 0.1;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              if (preset === 1.0) {
                                setVolume(1.0);
                                setVolumeBooster(1.0);
                              } else {
                                setVolume(1.0);
                                setVolumeBooster(preset);
                                if (!isBoosterActive) toggleVolumeBooster(true);
                              }
                            }}
                            className={`flex-1 py-1.5 rounded-xl text-[10.5px] font-mono font-bold transition active:scale-95 ${
                              isActive
                                ? 'bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] shadow-sm'
                                : 'bg-[#292820]/10 dark:bg-white/10 text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-[#E8E9DD]'
                            }`}
                          >
                            {preset === 3.0 ? '3.0x MAX' : `${preset.toFixed(1)}x`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Collapse / Done Button */}
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="w-full py-2.5 rounded-2xl bg-[#176B67] text-[#E8DDC9] dark:bg-[#C8F169] dark:text-[#080A09] font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Done & Save Settings</span>
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
