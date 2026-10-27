import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] pointer-events-none transition-all duration-300">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 text-black dark:text-white shadow-2xl backdrop-blur-md text-xs sm:text-sm font-semibold">
        <CheckCircle2 className="w-4 h-4 text-black dark:text-white shrink-0" />
        <span className="truncate">{message}</span>
      </div>
    </div>
  );
};
