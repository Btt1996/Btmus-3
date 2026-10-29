import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Search,
  ListMusic,
  Download,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Play,
  CheckCircle2,
  Copy,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileMusic,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UnifiedHistoryRecord,
  HistoryType,
} from '../../types/unifiedSearch';
import * as historyService from '../../services/historyService';
import { formatDuration } from '../../utils/id3Parser';
import { useMusic } from '../../context/MusicContext';
import { resolveAndDownloadSingleTrack } from '../../services/playlistImport/x2Engine';
import { DEFAULT_IMPORT_SETTINGS } from '../../types/playlistImport';

interface MusicHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSearch?: (query: string) => void;
  onSelectPlaylistUrl?: (url: string) => void;
}

export const MusicHistoryModal: React.FC<MusicHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectSearch,
  onSelectPlaylistUrl,
}) => {
  const { playTrack, tracks, showToast, refreshLibrary } = useMusic();
  const [activeFilter, setActiveFilter] = useState<HistoryType>('all');
  const [records, setRecords] = useState<UnifiedHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await historyService.getAllHistory();
      setRecords(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm(`Clear ${activeFilter === 'all' ? 'all history' : `${activeFilter} history`}?`)) {
      await historyService.clearHistoryByType(activeFilter);
      await loadHistory();
      showToast('History cleared');
    }
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await historyService.deleteHistoryRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRetryFailed = async (record: UnifiedHistoryRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!record.retryPayload) return;

    setRetryingId(record.id);
    showToast(`Retrying import: "${record.title}"...`);

    try {
      const result = await resolveAndDownloadSingleTrack(
        {
          title: record.retryPayload.title,
          artist: record.retryPayload.artist,
          album: record.retryPayload.album,
          durationMs: record.retryPayload.durationMs,
          isrc: record.retryPayload.isrc,
          source: record.retryPayload.source,
        },
        DEFAULT_IMPORT_SETTINGS
      );

      if (result.success) {
        showToast(`Successfully imported "${record.title}"!`);
        await historyService.deleteHistoryRecord(record.id);
        await refreshLibrary();
        await loadHistory();
      } else {
        showToast(`Retry failed: ${result.error || 'No audio match found'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      showToast(`Error: ${msg}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handlePlayDownloaded = (record: UnifiedHistoryRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.localTrackId) {
      const local = tracks.find((t) => t.id === record.localTrackId);
      if (local) {
        playTrack(local);
        showToast(`Playing "${local.title}"`);
        onClose();
        return;
      }
    }
    showToast('Local track not found in library');
  };

  if (!isOpen) return null;

  const filteredRecords = records.filter((r) => {
    if (activeFilter === 'all') return true;
    return r.type === activeFilter;
  });

  const filterTabs: { id: HistoryType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'all', label: 'All History', icon: History },
    { id: 'search', label: 'Searches', icon: Search },
    { id: 'playlist', label: 'Playlists', icon: ListMusic },
    { id: 'download', label: 'Downloads', icon: Download },
    { id: 'failed_import', label: 'Failed Retries', icon: AlertTriangle },
    { id: 'duplicate', label: 'Duplicates', icon: Copy },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-3xl bg-[#F3EBDD]/95 dark:bg-[#080A09]/95 border border-[#176B67]/20 dark:border-[#C8F169]/20 shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#292820]/10 dark:border-white/10 flex items-center justify-between shrink-0 bg-[#E8DDC9]/50 dark:bg-[#141815]/50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#176B67]/20 text-[#176B67] dark:bg-[#C8F169]/20 dark:text-[#C8F169] flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#292820] dark:text-[#E8E9DD] tracking-tight">
                Music & Import History
              </h2>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F] font-mono">
                Persistent log across searches, playlists & downloads
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {filteredRecords.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="p-2 rounded-xl text-[#777267] dark:text-[#92998F] hover:text-red-500 active:scale-95 transition"
                title="Clear filtered history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#292820]/5 dark:bg-white/5 text-[#292820] dark:text-[#E8E9DD] active:scale-95 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="p-3 border-b border-[#292820]/10 dark:border-white/10 overflow-x-auto scrollbar-none flex gap-2">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const count = records.filter((r) => (tab.id === 'all' ? true : r.type === tab.id)).length;
            const isActive = activeFilter === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09] shadow-sm'
                    : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? 'bg-black/20 text-white dark:bg-black/20 dark:text-[#080A09]'
                      : 'bg-black/5 dark:bg-white/10 text-inherit'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Records List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="p-12 text-center text-[#777267] dark:text-[#92998F] text-xs font-mono">
              Loading persistent history...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-12 text-center select-none">
              <History className="w-8 h-8 text-[#777267]/50 dark:text-[#92998F]/50 mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#292820] dark:text-[#E8E9DD]">
                No history in this category
              </p>
              <p className="text-xs text-[#777267] dark:text-[#92998F] mt-1">
                Your searches, playlists, downloads, and retries will appear here.
              </p>
            </div>
          ) : (
            filteredRecords.map((item) => {
              const isSearch = item.type === 'search';
              const isPlaylist = item.type === 'playlist';
              const isFailed = item.type === 'failed_import';
              const isDownload = item.type === 'download';
              const isDup = item.type === 'duplicate';

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isSearch && item.query && onSelectSearch) {
                      onSelectSearch(item.query);
                      onClose();
                    } else if (isPlaylist && item.playlistUrl && onSelectPlaylistUrl) {
                      onSelectPlaylistUrl(item.playlistUrl);
                      onClose();
                    }
                  }}
                  className={`group relative p-3 rounded-2xl bg-white/60 dark:bg-[#141815]/60 border border-[#292820]/10 dark:border-white/10 transition-all duration-200 flex items-center justify-between gap-3 ${
                    isSearch || isPlaylist ? 'cursor-pointer hover:border-[#176B67] dark:hover:border-[#C8F169]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Icon or Artwork */}
                    {item.artworkUrl ? (
                      <img
                        src={item.artworkUrl}
                        alt=""
                        className="w-11 h-11 rounded-xl object-cover border border-[#292820]/10 shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                          isFailed
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : isDownload
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : isPlaylist
                            ? 'bg-[#176B67]/10 text-[#176B67] dark:text-[#C8F169] border-[#176B67]/20'
                            : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F] border-transparent'
                        }`}
                      >
                        {isFailed ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : isDownload ? (
                          <Download className="w-5 h-5" />
                        ) : isPlaylist ? (
                          <ListMusic className="w-5 h-5" />
                        ) : isDup ? (
                          <Copy className="w-5 h-5" />
                        ) : (
                          <Search className="w-5 h-5" />
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                          {item.title}
                        </h4>
                        {item.source && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[#176B67]/10 dark:bg-[#C8F169]/20 text-[#176B67] dark:text-[#C8F169] uppercase font-bold shrink-0">
                            {item.source}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate mt-0.5">
                        {item.subtitle || new Date(item.timestamp).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[#777267]/80 dark:text-[#92998F]/80 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {item.durationSeconds && <span>• {formatDuration(item.durationSeconds)}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Retry button for failed imports */}
                    {isFailed && item.retryPayload && (
                      <button
                        onClick={(e) => handleRetryFailed(item, e)}
                        disabled={retryingId === item.id}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-1 active:scale-95 transition"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                        <span>Retry</span>
                      </button>
                    )}

                    {/* Play button for downloaded tracks */}
                    {isDownload && item.localTrackId && (
                      <button
                        onClick={(e) => handlePlayDownloaded(item, e)}
                        className="p-2 rounded-xl bg-[#176B67]/15 dark:bg-[#C8F169]/20 text-[#176B67] dark:text-[#C8F169] active:scale-95 transition"
                        title="Play downloaded audio"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                    )}

                    {/* Reopen search arrow */}
                    {isSearch && (
                      <span className="p-2 text-[#777267] dark:text-[#92998F] group-hover:text-[#176B67] dark:group-hover:text-[#C8F169] transition">
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    )}

                    {/* Delete item */}
                    <button
                      onClick={(e) => handleDeleteItem(item.id, e)}
                      className="p-1.5 rounded-lg text-[#777267] dark:text-[#92998F] hover:text-red-500 opacity-60 hover:opacity-100 transition active:scale-90"
                      title="Remove record"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
