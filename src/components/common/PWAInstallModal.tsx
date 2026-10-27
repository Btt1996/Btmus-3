import React from 'react';
import { Share, PlusSquare, Check, X, Shield, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-black dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 shrink-0">
            <img
              src="/app-logo.png"
              alt="Btt Music Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-extrabold text-black dark:text-white">Btt Music</h3>
              <span className="px-1.5 py-0.2 rounded-md bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white text-[10px] font-bold">
                iOS
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Add to iPhone Home Screen</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-center space-y-2 my-2">
            <div className="w-10 h-10 rounded-full bg-black text-white dark:bg-white dark:text-black mx-auto flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-black dark:text-white">Installed on Home Screen!</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Btt Music is running in standalone mode with notch & Dynamic Island safe area support.
            </p>
          </div>
        ) : isInstallable ? (
          <div className="space-y-4 my-2">
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Install Btt Music onto your device for standalone offline playback, full notch clearance, and lock-screen media controls.
            </p>
            <button
              onClick={async () => {
                await install();
                onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-black text-white dark:bg-white dark:text-black font-bold text-sm transition shadow-md flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Install Application
            </button>
          </div>
        ) : (
          <div className="space-y-4 my-2">
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              To install <strong>Btt Music</strong> on your <strong>iPhone</strong> with full notch and Dynamic Island support:
            </p>
            <ol className="space-y-3 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-950 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <li className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-black dark:text-white font-bold">
                  1
                </div>
                <span>
                  Tap the <strong className="text-black dark:text-white inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 inline" /> Share</strong> button in Safari toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-black dark:text-white font-bold">
                  2
                </div>
                <span>
                  Scroll down and tap <strong className="text-black dark:text-white inline-flex items-center gap-1"><PlusSquare className="w-3.5 h-3.5 inline" /> Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-black dark:text-white font-bold">
                  3
                </div>
                <span>
                  Tap <strong className="text-black dark:text-white">Add</strong> in the top-right corner.
                </span>
              </li>
            </ol>
            <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
              <div className="flex items-center gap-1.5 text-black dark:text-white font-semibold">
                <Shield className="w-3.5 h-3.5" />
                <span>iPhone Notch & Dynamic Island Ready</span>
              </div>
              <p className="leading-tight">
                When opened from the Home Screen, Btt Music automatically expands into a standalone app without browser bars, keeping all controls clearly below the notch and above the home swipe indicator.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold text-black dark:text-white transition"
        >
          Got It
        </button>
      </div>
    </div>
  );
};
