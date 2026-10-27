import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type BttAnimType = 'play' | 'next' | 'previous' | null;

export interface BttAnimationTrigger {
  id: number;
  type: 'play' | 'next' | 'previous';
}

interface BttPlaybackAnimationProps {
  currentTrigger: BttAnimationTrigger | null;
  className?: string;
}

export const BttPlaybackAnimation: React.FC<BttPlaybackAnimationProps> = ({
  currentTrigger,
  className = '',
}) => {
  if (!currentTrigger) return null;

  const isPlay = currentTrigger.type === 'play';
  const isNext = currentTrigger.type === 'next';
  const isPrev = currentTrigger.type === 'previous';

  return (
    <div className={`pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-visible z-20 ${className}`}>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={currentTrigger.id}
          initial={
            isPlay
              ? { opacity: 0, scale: 0.6, y: 5 }
              : isNext
              ? { opacity: 0, scale: 0.7, x: -12 }
              : { opacity: 0, scale: 0.7, x: 12 }
          }
          animate={
            isPlay
              ? {
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, 1.18, 1.05, 0.9],
                  y: [5, -22, -32, -42],
                }
              : isNext
              ? {
                  opacity: [0, 1, 1, 0],
                  scale: [0.7, 1.15, 1.0, 0.85],
                  x: [-12, 18, 42, 64],
                }
              : {
                  opacity: [0, 1, 1, 0],
                  scale: [0.7, 1.15, 1.0, 0.85],
                  x: [12, -18, -42, -64],
                }
          }
          transition={{
            duration: 0.55,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="flex items-center justify-center"
        >
          {/* Liquid Glass Badge with BTT Letters */}
          <div className="px-3.5 py-1 rounded-2xl bg-[#E8DDC9]/90 dark:bg-[#141815]/95 backdrop-blur-2xl border border-[#C8F169]/50 shadow-[0_4px_24px_rgba(200,241,105,0.45)] dark:shadow-[0_4px_28px_rgba(200,241,105,0.6)] flex items-center gap-1">
            <span className="font-mono font-black text-sm tracking-widest text-[#176B67] dark:text-[#C8F169] drop-shadow-xs">
              BTT
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#C8F169] animate-pulse" />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
