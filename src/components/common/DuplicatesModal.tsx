import React, { useState } from 'react';
import { Trash2, X, CheckCircle2, AlertTriangle, Music, Sparkles, HardDrive, ShieldCheck } from 'lucide-react';
import { DuplicateGroup, removeDuplicates } from '../../utils/duplicates';
import { formatFileSize, formatDuration } from '../../utils/id3Parser';
import { useMusic } from '../../context/MusicContext';

interface DuplicatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  duplicateGroups: DuplicateGroup[];
  onDuplicatesRemoved: () => void;
}

export const DuplicatesModal: React.FC<DuplicatesModalProps> = ({
  isOpen,
  onClose,
  duplicateGroups,
  onDuplicatesRemoved,
}) => {
  const { playlists, showToast, refreshLibrary } = useMusic();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const totalDuplicatesCount = duplicateGroups.reduce(
    (acc, g) => acc + g.duplicateTracks.length,
    0
  );
  const totalWastedBytes = duplicateGroups.reduce(
    (acc, g) => acc + g.wastedBytes,
    0
  );

  const handleCleanAll = async () => {
    setIsDeleting(true);
    try {
      const result = await removeDuplicates(duplicateGroups, playlists);
      await refreshLibrary();
      showToast(
        `Cleaned ${result.removedCount} duplicate track${result.removedCount !== 1 ? 's' : ''} (saved ${formatFileSize(result.freedBytes)})!`
      );
      onDuplicatesRemoved();
      onClose();
    } catch (err) {
      console.error('Failed to clean duplicates:', err);
      showToast('Error removing duplicates');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div className="bg-white dark:bg-[#030708] border border-[#02ABB0]/30 rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#02ABB0]/15 text-[#02ABB0] flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-black dark:text-white">
                Duplicate Song Cleaner
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Identify and remove redundant audio tracks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-black dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Storage Recovery Summary Card */}
        <div className="px-6 py-4 bg-[#035A69]/10 dark:bg-[#024E5B]/20 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-[#02ABB0]" />
            <div>
              <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Reclaimable Storage
              </div>
              <div className="text-base font-extrabold text-[#02ABB0]">
                {formatFileSize(totalWastedBytes)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Duplicates Found
            </div>
            <div className="text-base font-extrabold text-black dark:text-white">
              {totalDuplicatesCount} track{totalDuplicatesCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Duplicate Groups List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-[#02ABB0] mx-auto" />
              <h4 className="text-base font-bold text-black dark:text-white">
                Your Library is Clean!
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No duplicate tracks or redundant audio files were found.
              </p>
            </div>
          ) : (
            duplicateGroups.map((group, idx) => (
              <div
                key={group.groupKey || idx}
                className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5"
              >
                {/* Song title & artist */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-bold text-black dark:text-white truncate">
                      {group.songTitle}
                    </h5>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {group.artistName}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#02ABB0]/15 text-[#02ABB0] text-[10px] font-bold shrink-0">
                    +{group.duplicateTracks.length} copy
                  </span>
                </div>

                {/* Primary version kept */}
                <div className="p-2 rounded-xl bg-white dark:bg-black border border-[#02ABB0]/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-[#02ABB0] text-black font-extrabold text-[9px] uppercase">
                      Keep
                    </span>
                    <span className="truncate text-black dark:text-white font-medium">
                      {group.primaryTrack.fileName || group.primaryTrack.title}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 shrink-0 ml-2">
                    {formatFileSize(group.primaryTrack.fileSize)}
                  </span>
                </div>

                {/* Duplicate versions to be removed */}
                <div className="space-y-1 pl-2 border-l-2 border-red-500/40">
                  {group.duplicateTracks.map((dup) => (
                    <div
                      key={dup.id}
                      className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 py-0.5"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Trash2 className="w-3 h-3 text-red-500 shrink-0" />
                        <span className="truncate">
                          {dup.fileName || dup.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono shrink-0 ml-2">
                        {formatFileSize(dup.fileSize)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Cancel
          </button>
          {duplicateGroups.length > 0 && (
            <button
              onClick={handleCleanAll}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl bg-[#02ABB0] hover:bg-[#01A4BD] text-black text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow-md shadow-[#02ABB0]/20 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {isDeleting
                  ? 'Cleaning...'
                  : `Remove ${totalDuplicatesCount} Duplicates`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
