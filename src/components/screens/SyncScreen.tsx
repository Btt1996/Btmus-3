import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Download,
  AlertCircle,
  FolderPlus,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Info,
  Loader2,
  FileMusic,
  Check,
  Play,
  Database,
  Share2,
  UploadCloud,
  FileText,
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import {
  TelegramSyncItem,
  DownloadTask,
  Track,
  Playlist,
} from '../../types/music';
import * as tgService from '../../services/telegramService';
import { saveTrack, savePlaylist, exportLibraryBackup, importLibraryBackup } from '../../services/db';
import { parseAudioMetadata, formatFileSize } from '../../utils/id3Parser';
import { SAMPLE_AUDIO_PRESETS, createToneAudioBlob } from '../../utils/sampleTracks';
import { PlaylistImportModal } from '../import/PlaylistImportModal';

interface SyncScreenProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export const SyncScreen: React.FC<SyncScreenProps> = ({ fileInputRef }) => {
  const {
    settings,
    updateSettings,
    refreshLibrary,
    showToast,
    playlists,
    tracks,
    playTrack,
    storageStats,
  } = useMusic();

  const [activeTab, setActiveTab] = useState<'import' | 'bot' | 'manual' | 'database' | 'guide'>('import');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportingDb, setIsExportingDb] = useState(false);
  const [isImportingDb, setIsImportingDb] = useState(false);
  const dbFileRef = React.useRef<HTMLInputElement | null>(null);

  // Telegram Bot API State
  const [botToken, setBotToken] = useState(settings.telegramBotToken || '');
  const [botInfo, setBotInfo] = useState<tgService.TelegramBotInfo | null>(null);
  const [isVerifyingBot, setIsVerifyingBot] = useState(false);
  const [isScanningUpdates, setIsScanningUpdates] = useState(false);
  const [discoveredTracks, setDiscoveredTracks] = useState<TelegramSyncItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Download Queue State
  const [downloadTasks, setDownloadTasks] = useState<Record<string, DownloadTask>>({});
  const [isDownloading, setIsDownloading] = useState(false);

  // Manual Import State
  const [manualSourceTag, setManualSourceTag] = useState('Telegram Audio');
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  // Sample Generator State
  const [isGeneratingSamples, setIsGeneratingSamples] = useState(false);

  useEffect(() => {
    if (settings.telegramBotToken && !botInfo) {
      setBotToken(settings.telegramBotToken);
      verifyToken(settings.telegramBotToken, true);
    }
  }, [settings.telegramBotToken]);

  const verifyToken = async (tokenToVerify: string, silent = false) => {
    if (!tokenToVerify.trim()) return;
    setIsVerifyingBot(true);
    try {
      const info = await tgService.verifyTelegramBot(tokenToVerify.trim());
      setBotInfo(info);
      await updateSettings({ telegramBotToken: tokenToVerify.trim() });
      if (!silent) showToast(`Connected to Telegram Bot: @${info.username}`);
      scanForMusic(tokenToVerify.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect bot';
      if (!silent) showToast(`Bot error: ${msg}`);
      setBotInfo(null);
    } finally {
      setIsVerifyingBot(false);
    }
  };

  const scanForMusic = async (token = botToken) => {
    if (!token.trim()) return;
    setIsScanningUpdates(true);
    try {
      const items = await tgService.fetchTelegramAudioTracks(token.trim());
      setDiscoveredTracks(items);
      const newIds = new Set<string>();
      items.forEach((item) => {
        if (!item.isAlreadyImported) newIds.add(item.fileId);
      });
      setSelectedItemIds(newIds);
      const newCount = Array.from(newIds).length;
      showToast(
        `Found ${items.length} track${items.length !== 1 ? 's' : ''} (${newCount} new to download)`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan error';
      showToast(msg);
    } finally {
      setIsScanningUpdates(false);
    }
  };

  const toggleSelectTrack = (fileId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const selectAllTracks = () => {
    setSelectedItemIds(new Set(discoveredTracks.map((t) => t.fileId)));
  };

  const deselectAllTracks = () => {
    setSelectedItemIds(new Set());
  };

  const handleDownloadSelected = async () => {
    const itemsToDownload = discoveredTracks.filter((t) => selectedItemIds.has(t.fileId));
    if (itemsToDownload.length === 0) {
      showToast('Select at least one track to download');
      return;
    }

    setIsDownloading(true);
    let successCount = 0;
    let failedCount = 0;

    const importedBySource: Record<string, string[]> = {};

    for (const item of itemsToDownload) {
      const taskId = item.fileId;
      setDownloadTasks((prev) => ({
        ...prev,
        [taskId]: {
          id: taskId,
          fileId: item.fileId,
          title: item.title || item.fileName,
          artist: item.performer || 'Unknown Artist',
          fileName: item.fileName,
          sourceName: item.topicName || item.chatTitle,
          totalBytes: item.fileSize,
          downloadedBytes: 0,
          status: 'downloading',
        },
      }));

      try {
        const track = await tgService.downloadTelegramAudio(botToken, item, (bytes, total) => {
          setDownloadTasks((prev) => {
            if (!prev[taskId]) return prev;
            return {
              ...prev,
              [taskId]: {
                ...prev[taskId],
                downloadedBytes: bytes,
                totalBytes: total,
                status: bytes >= total ? 'parsing' : 'downloading',
              },
            };
          });
        });

        successCount++;

        const sourceName = item.topicName || item.chatTitle || 'Telegram Audio';
        if (!importedBySource[sourceName]) importedBySource[sourceName] = [];
        importedBySource[sourceName].push(track.id);

        setDownloadTasks((prev) => ({
          ...prev,
          [taskId]: {
            ...prev[taskId],
            status: 'completed',
          },
        }));

        setDiscoveredTracks((prev) =>
          prev.map((t) => (t.fileId === item.fileId ? { ...t, isAlreadyImported: true } : t))
        );

        await refreshLibrary();
      } catch (err: unknown) {
        failedCount++;
        let msg = err instanceof Error ? err.message : 'Download failed';
        if (msg.includes('too big') || (item.fileSize && item.fileSize > 20 * 1024 * 1024)) {
          msg = 'File exceeds Telegram Bot 20MB limit. Use Manual Import.';
        }
        setDownloadTasks((prev) => ({
          ...prev,
          [taskId]: {
            ...prev[taskId],
            status: 'failed',
            error: msg,
          },
        }));
      }
    }

    if (settings.autoCreatePlaylists && Object.keys(importedBySource).length > 0) {
      for (const [sourceName, trackIds] of Object.entries(importedBySource)) {
        const existingPl = playlists.find(
          (pl) => pl.sourceType === 'telegram' && pl.name.toLowerCase() === sourceName.toLowerCase()
        );
        if (existingPl) {
          const merged = Array.from(new Set([...existingPl.trackIds, ...trackIds]));
          await savePlaylist({ ...existingPl, trackIds: merged, updatedAt: Date.now() });
        } else {
          const newPl: Playlist = {
            id: `pl_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: sourceName,
            description: `Auto-generated from Telegram: ${sourceName}`,
            sourceType: 'telegram',
            telegramChatTitle: sourceName,
            telegramTopic: sourceName,
            trackIds,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await savePlaylist(newPl);
        }
      }
    }

    await refreshLibrary();
    setIsDownloading(false);

    if (failedCount > 0 && successCount > 0) {
      showToast(`Downloaded ${successCount} track(s). ${failedCount} failed.`);
    } else if (failedCount > 0) {
      showToast(`Download failed. Check file sizes or bot permissions.`);
    } else {
      showToast(`Successfully downloaded ${successCount} track${successCount !== 1 ? 's' : ''}!`);
    }
  };

  // Manual Files handler
  const handleManualFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);
    let successCount = 0;
    const importedTrackIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const meta = await parseAudioMetadata(file, file.name);
        const trackId = `local_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

        const track: Track = {
          id: trackId,
          title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: meta.artist || 'Unknown Artist',
          album: meta.album || manualSourceTag || 'My Files',
          duration: meta.duration || 0,
          fileSize: file.size,
          mimeType: file.type || 'audio/mpeg',
          fileName: file.name,
          downloadDate: Date.now(),
          isFavorite: false,
          playCount: 0,
          artworkUrl: meta.artworkUrl,
          telegramSource: manualSourceTag
            ? {
                chatTitle: manualSourceTag,
                topicName: manualSourceTag,
                sourceType: 'manual',
              }
            : undefined,
        };

        await saveTrack(track, file);
        importedTrackIds.push(trackId);
        successCount++;
      } catch (err) {
        console.warn('Error processing audio file:', file.name, err);
      }
    }

    if (manualSourceTag && importedTrackIds.length > 0 && settings.autoCreatePlaylists) {
      const existingPl = playlists.find(
        (pl) => pl.name.toLowerCase() === manualSourceTag.toLowerCase()
      );
      if (existingPl) {
        const merged = Array.from(new Set([...existingPl.trackIds, ...importedTrackIds]));
        await savePlaylist({ ...existingPl, trackIds: merged, updatedAt: Date.now() });
      } else {
        const newPl: Playlist = {
          id: `pl_manual_${Date.now()}`,
          name: manualSourceTag,
          description: `Imported audio from ${manualSourceTag}`,
          sourceType: 'manual',
          trackIds: importedTrackIds,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await savePlaylist(newPl);
      }
    }

    await refreshLibrary();
    setIsProcessingFiles(false);
    showToast(`Successfully imported ${successCount} audio file${successCount !== 1 ? 's' : ''}!`);
    e.target.value = '';
  };

  const handleExportDatabase = async (withAudio = false) => {
    setIsExportingDb(true);
    try {
      const json = await exportLibraryBackup(withAudio);
      const filename = `btt-music-${withAudio ? 'vault' : 'db'}-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([json], { type: 'application/json' });

      // If Web Share API is available (iOS Share sheet)
      if (
        navigator.canShare &&
        navigator.canShare({ files: [new File([blob], filename, { type: 'application/json' })] })
      ) {
        try {
          await navigator.share({
            files: [new File([blob], filename, { type: 'application/json' })],
            title: 'Btt Music Database',
            text: 'Here is my Btt Music library backup.',
          });
          showToast('Shared database successfully!');
          return;
        } catch {
          // fall through to direct download
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${withAudio ? 'full database with audio' : 'database metadata'}!`);
    } catch (err) {
      console.error('Export DB error:', err);
      showToast('Failed to export music database');
    } finally {
      setIsExportingDb(false);
    }
  };

  const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingDb(true);
    try {
      const text = await file.text();
      const res = await importLibraryBackup(text);
      await refreshLibrary();
      showToast(
        `Restored ${res.tracksRestored} songs and ${res.playlistsRestored} playlists!`
      );
    } catch (err) {
      console.error('Import DB error:', err);
      showToast('Invalid music database backup format');
    } finally {
      setIsImportingDb(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-notch pb-8 space-y-5 max-w-lg mx-auto w-full select-none">
      {/* Hidden file input for audio tracks */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
        onChange={handleManualFiles}
        className="hidden"
      />

      {/* Hidden file input for music database backup */}
      <input
        ref={dbFileRef}
        type="file"
        accept=".json,.btt,application/json"
        onChange={handleImportDatabase}
        className="hidden"
      />

      {/* Screen Title */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[#02ABB0] font-black font-serif">
          bttm By Ahmed Taboubi
        </div>
        <h1 className="text-2xl font-extrabold text-black dark:text-white tracking-tight font-serif">Sync & Import</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-serif">
          Import playlists from Spotify, sync music from Telegram, or manage your offline database.
        </p>
      </div>

      {/* Sub Tabs: 5 Options with Liquid Pill Feel */}
      <div className="grid grid-cols-5 rounded-2xl bg-zinc-100 dark:bg-[#024E5B]/20 p-1 border border-zinc-200 dark:border-[#02ABB0]/20 text-[10.5px]">
        <button
          onClick={() => setActiveTab('import')}
          className={`py-2 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
            activeTab === 'import'
              ? 'bg-[#02ABB0] text-black shadow-sm font-bold'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="truncate">Playlist</span>
        </button>
        <button
          onClick={() => setActiveTab('bot')}
          className={`py-2 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
            activeTab === 'bot'
              ? 'bg-[#02ABB0] text-black shadow-sm font-bold'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span className="truncate">Telegram</span>
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`py-2 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
            activeTab === 'manual'
              ? 'bg-[#02ABB0] text-black shadow-sm font-bold'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span className="truncate">Files</span>
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`py-2 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
            activeTab === 'database'
              ? 'bg-[#02ABB0] text-black shadow-sm font-bold'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span className="truncate">Backup</span>
        </button>
        <button
          onClick={() => setActiveTab('guide')}
          className={`py-2 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
            activeTab === 'guide'
              ? 'bg-[#02ABB0] text-black shadow-sm font-bold'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="truncate">Guide</span>
        </button>
      </div>

      {/* TAB 0: PLAYLIST IMPORT (SPOTIFY / X1 / X2) */}
      {activeTab === 'import' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-5 rounded-3xl bg-zinc-100 dark:bg-[#024E5B]/20 border border-zinc-200 dark:border-[#02ABB0]/30 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#02ABB0] text-black flex items-center justify-center font-bold shrink-0 shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-widest uppercase text-[#02ABB0] font-serif">
                    X1 / X2 PIPELINE
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[9px]">
                    Keyless (No Keys Needed)
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-black dark:text-white font-serif mt-0.5">
                  Import Spotify & Web Playlists
                </h3>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Paste any public Spotify playlist URL to instantly obtain its complete track list with zero API keys or user credentials required, then automatically locate matching audio recordings via <strong>Jamendo</strong> and the <strong>Internet Archive</strong>.
            </p>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-black/60 border border-zinc-200 dark:border-zinc-800 text-[11px] space-y-1.5 text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-black dark:text-white">
                <span>Architecture Compliance</span>
                <span className="text-[#02ABB0]">Strict Standards</span>
              </div>
              <p>• <strong>X1 Source:</strong> Keyless Spotify embed metadata resolver. Automatically resolves titles, artists, duration, and order with 0 API keys.</p>
              <p>• <strong>Anghami:</strong> Isolated interface cleanly marked unavailable due to lack of public keyless API.</p>
              <p>• <strong>X2 Audio:</strong> Real downloadable audio from Jamendo & Internet Archive, with duplicate skipping and confidence score confirmation.</p>
            </div>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="w-full py-3.5 rounded-2xl bg-[#02ABB0] hover:bg-[#01A4BD] text-black text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-[#02ABB0]/25 transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Launch Playlist Import Wizard</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: TELEGRAM BOT SYNC */}
      {activeTab === 'bot' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Telegram Bot Connection
              </span>
              {botInfo && (
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white border border-zinc-300 dark:border-zinc-700 text-[10px] font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Connected
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Enter Bot Token from @BotFather"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white font-mono"
                />
                <button
                  onClick={() => verifyToken(botToken)}
                  disabled={isVerifyingBot || !botToken.trim()}
                  className="px-4 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  {isVerifyingBot ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Connect
                </button>
              </div>

              {botInfo && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <p>
                    Bot: <strong className="text-black dark:text-white">@{botInfo.username}</strong> ({botInfo.first_name})
                  </p>
                  <button
                    onClick={() => scanForMusic()}
                    disabled={isScanningUpdates}
                    className="text-black dark:text-white hover:underline font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningUpdates ? 'animate-spin' : ''}`} />
                    Check Updates
                  </button>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              <strong>How it works:</strong> Create a bot with @BotFather on Telegram. Add your bot as an admin to your music channel/chat, or forward music to your bot. Btt Music reads the audio updates and downloads them straight into your iPhone local storage!
            </div>
          </div>

          {/* Discovered Music List */}
          {discoveredTracks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white">Discovered Telegram Tracks</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>{discoveredTracks.length} found</span>
                    <span>•</span>
                    <button
                      onClick={selectAllTracks}
                      className="text-black dark:text-white hover:underline font-semibold"
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      onClick={deselectAllTracks}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-medium"
                    >
                      Clear ({selectedItemIds.size})
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleDownloadSelected}
                  disabled={isDownloading || selectedItemIds.size === 0}
                  className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 shadow-md transition active:scale-95"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download ({selectedItemIds.size})
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {discoveredTracks.map((item) => {
                  const isSelected = selectedItemIds.has(item.fileId);
                  const task = downloadTasks[item.fileId];
                  const existingTrack = tracks.find(
                    (t) =>
                      t.telegramSource?.fileId === item.fileId ||
                      (t.fileHash && t.fileHash === item.fileUniqueId) ||
                      t.fileName === item.fileName
                  );
                  const isCurrentlyInLibrary = !!existingTrack;

                  return (
                    <div
                      key={item.fileId}
                      onClick={() => toggleSelectTrack(item.fileId)}
                      className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-200 dark:bg-zinc-800 border-black dark:border-white'
                          : 'bg-zinc-100/70 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200/60 dark:hover:bg-zinc-850'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0">
                          <FileMusic className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-black dark:text-white truncate">
                            {item.title || item.fileName}
                          </h4>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-mono">
                            {item.performer || item.chatTitle}{' '}
                            {item.topicName ? `• #${item.topicName}` : ''} • {formatFileSize(item.fileSize)}
                          </p>
                          {task && task.status === 'failed' && (
                            <p className="text-[10px] text-red-500 flex items-center gap-1 mt-1 font-medium font-sans">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span className="truncate">{task.error}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {task && task.status === 'downloading' ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-black dark:text-white font-mono font-bold">
                              {task.totalBytes > 0
                                ? `${Math.round((task.downloadedBytes / task.totalBytes) * 100)}%`
                                : 'Downloading...'}
                            </span>
                            <div className="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-black dark:bg-white transition-all duration-150"
                                style={{
                                  width: `${
                                    task.totalBytes > 0
                                      ? (task.downloadedBytes / task.totalBytes) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : isCurrentlyInLibrary ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playTrack(existingTrack);
                              }}
                              className="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white text-[10px] font-bold flex items-center gap-1 transition active:scale-95"
                            >
                              <Play className="w-3 h-3 fill-current ml-0.5" />
                              Play
                            </button>
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                                isSelected
                                  ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                  : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                              isSelected
                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL AUDIO IMPORT */}
      {activeTab === 'manual' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-5 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white mx-auto flex items-center justify-center border border-zinc-300 dark:border-zinc-700">
              <FolderPlus className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-bold text-black dark:text-white">Import Music Files</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                Select MP3, M4A, AAC, WAV, or FLAC files directly from your iPhone Files app or iCloud Drive. ID3 tags and album artwork are extracted automatically.
              </p>
            </div>

            <div className="text-left space-y-1.5 max-w-sm mx-auto">
              <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                Channel / Source Name (Optional):
              </label>
              <input
                type="text"
                value={manualSourceTag}
                onChange={(e) => setManualSourceTag(e.target.value)}
                placeholder="e.g. My Music Channel, Lo-Fi Vault"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-xs text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white"
              />
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                A dedicated playlist with this source name will be created automatically.
              </p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFiles}
              className="w-full max-w-sm mx-auto py-3.5 px-4 rounded-2xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
            >
              {isProcessingFiles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Audio & ID3 Tags...</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  <span>Choose Audio Files from iPhone</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Offline Sample Pack Button */}
          <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Instant Offline Demo Pack
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Generate 3 offline synthwave & lofi tracks instantly.
              </p>
            </div>

            <button
              onClick={async () => {
                setIsGeneratingSamples(true);
                try {
                  const generatedIds: string[] = [];
                  for (let i = 0; i < SAMPLE_AUDIO_PRESETS.length; i++) {
                    const preset = SAMPLE_AUDIO_PRESETS[i];
                    const blob = createToneAudioBlob({
                      frequency: preset.frequency,
                      durationSeconds: preset.duration,
                      type: preset.type,
                    });
                    const trackId = `sample_${Date.now()}_${i}`;
                    generatedIds.push(trackId);

                    const track: Track = {
                      id: trackId,
                      title: preset.title,
                      artist: preset.artist,
                      album: preset.album,
                      duration: preset.duration,
                      fileSize: blob.size,
                      mimeType: 'audio/wav',
                      fileName: `${preset.title}.wav`,
                      downloadDate: Date.now() - i * 10000,
                      isFavorite: i === 0,
                      playCount: 0,
                      telegramSource: {
                        chatTitle: 'Demo Channel',
                        topicName: preset.topic,
                        sourceType: 'sample',
                      },
                    };
                    await saveTrack(track, blob);
                  }
                  await refreshLibrary();
                  showToast('Generated 3 sample tracks for offline testing!');
                } finally {
                  setIsGeneratingSamples(false);
                }
              }}
              disabled={isGeneratingSamples}
              className="px-3.5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-bold shrink-0 transition"
            >
              {isGeneratingSamples ? 'Generating...' : 'Load Demo'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: DATABASE (IMPORT / EXPORT TO OTHERS / FILES APP) */}
      {activeTab === 'database' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Card 1: Import DB from Files App */}
          <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-[#024E5B]/20 border border-zinc-200 dark:border-[#02ABB0]/30 space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-black dark:text-white font-serif">
                  Import Music Database
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Restore tracks and playlists from Files App or AirDrop (.btt / .json)
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5 text-zinc-600 dark:text-zinc-400">
              <p>• Seamlessly merges or restores all songs, playlists, and SmartMix metadata.</p>
              <p>• Works with backups created on this or other devices.</p>
            </div>

            <button
              onClick={() => dbFileRef.current?.click()}
              disabled={isImportingDb}
              className="w-full py-3 rounded-2xl bg-[#02ABB0] hover:bg-[#01A4BD] text-black text-xs font-bold transition flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-[#02ABB0]/20 disabled:opacity-50"
            >
              {isImportingDb ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Restoring Music Database...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Choose Database Backup File</span>
                </>
              )}
            </button>
          </div>

          {/* Card 2: Export & Share DB */}
          <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-[#024E5B]/20 border border-zinc-200 dark:border-[#02ABB0]/30 space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#035A69]/20 text-[#01A4BD] flex items-center justify-center shrink-0">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-black dark:text-white font-serif">
                  Export & Share Database
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Share your library with others or save a backup to Files App
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
              <div>
                <div className="font-bold text-black dark:text-white">Current Library</div>
                <div className="text-[11px] text-zinc-500">{tracks.length} songs • {playlists.length} playlists</div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#02ABB0]/15 text-[#02ABB0] text-[10px] font-bold">
                {formatFileSize(storageStats.trackBytes)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleExportDatabase(false)}
                disabled={isExportingDb}
                className="py-2.5 px-3 rounded-xl bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 text-black dark:text-white hover:border-[#02ABB0] text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-[#02ABB0]" />
                <span>Export Metadata (.json)</span>
              </button>

              <button
                onClick={() => handleExportDatabase(true)}
                disabled={isExportingDb}
                className="py-2.5 px-3 rounded-xl bg-[#024E5B] text-white hover:bg-[#035A69] text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm disabled:opacity-50"
              >
                <Share2 className="w-4 h-4 text-[#01A4BD]" />
                <span>Share Full Vault (with Audio)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY, PRIVACY & DOCS */}
      {activeTab === 'guide' && (
        <div className="space-y-4 animate-in fade-in duration-150 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center gap-2 text-black dark:text-white font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>Privacy & Telegram Architecture</span>
            </div>
            <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
              Btt Music was architected with privacy and iOS offline-first capabilities as top priorities:
            </p>
            <ul className="space-y-2 list-disc list-inside text-zinc-700 dark:text-zinc-300">
              <li>
                <strong>No Third-Party Servers:</strong> Your songs and bot tokens stay 100% inside your iPhone's local IndexedDB. They are never sent to external servers or ad networks.
              </li>
              <li>
                <strong>Bot API Security:</strong> Full Telegram Client APIs require phone number authentication and session hosting. The Telegram Bot API allows you to safely forward music without risking your personal Telegram credentials.
              </li>
              <li>
                <strong>100% Offline Playback:</strong> Once downloaded, Telegram is never contacted again. The app functions completely offline in Airplane mode and in the background.
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <h4 className="font-bold text-black dark:text-white flex items-center gap-1.5">
              <Info className="w-4 h-4" /> iOS PWA Best Practices
            </h4>
            <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
              IndexedDB on iOS supports hundreds of gigabytes depending on your iPhone's free storage. To keep music cached permanently:
            </p>
            <ol className="space-y-1.5 list-decimal list-inside text-zinc-700 dark:text-zinc-300">
              <li>Add Btt Music to your Home Screen from Safari.</li>
              <li>Open the app periodically to keep Safari’s persistent storage flag active.</li>
              <li>Check the Settings screen to monitor storage usage and export library metadata backups anytime.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Playlist Import Modal */}
      <PlaylistImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};
