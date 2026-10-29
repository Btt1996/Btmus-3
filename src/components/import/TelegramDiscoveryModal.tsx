import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  ShieldCheck,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileMusic,
  ExternalLink,
  Lock,
  Sparkles,
  Info,
  Radio,
  Check,
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import * as tgService from '../../services/telegramService';
import { TelegramSyncItem } from '../../types/music';
import { formatFileSize, formatDuration } from '../../utils/id3Parser';
import { saveTrack } from '../../services/db';
import { recordDownloadHistory } from '../../services/historyService';

interface TelegramDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Sample preview catalog for pre-connection scanning experience (Requirement 5.C)
const PREVIEW_PUBLIC_CHANNELS = [
  {
    channel: '@ElectronicMusicHub',
    title: 'Neon Nights (Original Mix)',
    artist: 'CyberSound',
    duration: 214,
    size: 5120000,
    genre: 'Synthwave / Electronic',
  },
  {
    channel: '@ClassicalMasterpieces',
    title: 'Clair de Lune (Solo Piano)',
    artist: 'Claude Debussy',
    duration: 302,
    size: 7240000,
    genre: 'Classical / Ambient',
  },
  {
    channel: '@IndieVaultRadio',
    title: 'Autumn Breezes (Acoustic)',
    artist: 'The Wanderers',
    duration: 188,
    size: 4500000,
    genre: 'Indie Folk',
  },
  {
    channel: '@LoFiStudyStation',
    title: 'Coffee in Kyoto (Beat Tape)',
    artist: 'Quiet Hours',
    duration: 154,
    size: 3800000,
    genre: 'Lo-Fi Chillhop',
  },
];

export const TelegramDiscoveryModal: React.FC<TelegramDiscoveryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { settings, updateSettings, showToast, refreshLibrary } = useMusic();

  const [activeTab, setActiveTab] = useState<'preview' | 'connect' | 'active_hub'>('preview');
  const [tokenInput, setTokenInput] = useState(settings.telegramBotToken || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [botInfo, setBotInfo] = useState<tgService.TelegramBotInfo | null>(null);
  const [discoveredTracks, setDiscoveredTracks] = useState<TelegramSyncItem[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings.telegramBotToken) {
      setTokenInput(settings.telegramBotToken);
      verifyToken(settings.telegramBotToken, true);
    }
  }, [settings.telegramBotToken]);

  const verifyToken = async (token: string, silent = false) => {
    if (!token.trim()) return;
    setIsVerifying(true);
    setErrorMsg(null);
    try {
      const info = await tgService.verifyTelegramBot(token.trim());
      setBotInfo(info);
      setActiveTab('active_hub');
      await updateSettings({ telegramBotToken: token.trim() });
      if (!silent) showToast(`Connected to @${info.username}!`);
      scanBotUpdates(token.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bot verification failed';
      setErrorMsg(msg);
      if (!silent) showToast(`Error: ${msg}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const scanBotUpdates = async (token = tokenInput) => {
    if (!token.trim()) return;
    setIsScanning(true);
    try {
      const items = await tgService.fetchTelegramAudioTracks(token.trim());
      setDiscoveredTracks(items);
      showToast(`Found ${items.length} audio files in Telegram bot updates`);
    } catch (err: unknown) {
      console.warn('Telegram scan warning:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDownloadItem = async (item: TelegramSyncItem) => {
    if (downloadingIds.has(item.fileId) || downloadedIds.has(item.fileId)) return;

    setDownloadingIds((prev) => new Set(prev).add(item.fileId));
    showToast(`Downloading "${item.title || item.fileName}" from Telegram...`);

    try {
      const savedTrack = await tgService.downloadTelegramAudio(tokenInput, item);

      await recordDownloadHistory({
        title: savedTrack.title,
        artist: savedTrack.artist,
        source: 'telegram',
        status: 'completed',
        localTrackId: savedTrack.id,
        durationSeconds: savedTrack.duration,
        fileSizeBytes: savedTrack.fileSize,
      });

      setDownloadedIds((prev) => new Set(prev).add(item.fileId));
      showToast(`Saved "${savedTrack.title}" to local library!`);
      await refreshLibrary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      showToast(`Telegram download error: ${msg}`);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.fileId);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-3xl bg-[#F3EBDD]/95 dark:bg-[#080A09]/95 border border-[#176B67]/20 dark:border-[#C8F169]/20 shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#292820]/10 dark:border-white/10 flex items-center justify-between shrink-0 bg-[#E8DDC9]/50 dark:bg-[#141815]/50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#292820] dark:text-[#E8E9DD] tracking-tight">
                Telegram Music Sync Hub
              </h2>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F] font-mono">
                Optional audio sync inspired by @MusicsHuntersbot
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#292820]/5 dark:bg-white/5 text-[#292820] dark:text-[#E8E9DD] active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="p-3 border-b border-[#292820]/10 dark:border-white/10 flex gap-2">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
              activeTab === 'preview'
                ? 'bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09]'
                : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F]'
            }`}
          >
            Pre-Connection Preview
          </button>
          <button
            onClick={() => setActiveTab('connect')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
              activeTab === 'connect'
                ? 'bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09]'
                : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F]'
            }`}
          >
            {botInfo ? `@${botInfo.username}` : 'Connect Bot'}
          </button>
          {botInfo && (
            <button
              onClick={() => setActiveTab('active_hub')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
                activeTab === 'active_hub'
                  ? 'bg-[#176B67] text-white dark:bg-[#C8F169] dark:text-[#080A09]'
                  : 'bg-[#292820]/5 dark:bg-white/5 text-[#777267] dark:text-[#92998F]'
              }`}
            >
              Bot Audio Files ({discoveredTracks.length})
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: PRE-CONNECTION SCANNING EXPERIENCE */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#02ABB0]/10 border border-[#02ABB0]/20 text-[#292820] dark:text-[#E8E9DD]">
                <div className="flex items-center gap-2 text-[#02ABB0] font-bold text-xs uppercase tracking-wider mb-1">
                  <Sparkles className="w-4 h-4" />
                  Pre-Connection Scanning Experience
                </div>
                <p className="text-xs text-[#777267] dark:text-[#92998F]">
                  You can browse, inspect metadata, and preview audio before configuring a Telegram bot token. Connecting a bot is 100% optional and only needed if you want to stream or download audio files directly from your personal Telegram chats.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#777267] dark:text-[#92998F] mb-2 font-bold">
                  Discoverable Public Audio Samples
                </h4>
                <div className="space-y-2">
                  {PREVIEW_PUBLIC_CHANNELS.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-white/70 dark:bg-[#141815]/70 border border-[#292820]/10 dark:border-white/10 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#02ABB0]/15 text-[#02ABB0] flex items-center justify-center font-bold text-xs shrink-0">
                          <FileMusic className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">
                            {item.title}
                          </h5>
                          <p className="text-[11px] text-[#777267] dark:text-[#92998F]">
                            {item.artist} • <span className="font-mono text-[#02ABB0]">{item.channel}</span>
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#777267] font-mono">
                            <span>{formatDuration(item.duration)}</span>
                            <span>• {formatFileSize(item.size)}</span>
                            <span>• {item.genre}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveTab('connect')}
                        className="px-3 py-1.5 rounded-xl bg-[#292820]/5 dark:bg-white/5 hover:bg-[#02ABB0]/20 text-[#02ABB0] text-xs font-semibold transition active:scale-95 shrink-0"
                      >
                        Connect Bot to Sync
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONNECT BOT STEP */}
          {activeTab === 'connect' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/70 border border-[#292820]/10 dark:border-white/10">
                <div className="flex items-center gap-2 text-xs font-bold text-[#292820] dark:text-[#E8E9DD] mb-1">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  Secure Architecture Notice
                </div>
                <p className="text-xs text-[#777267] dark:text-[#92998F] leading-relaxed">
                  Your Telegram Bot token is proxied solely through the local Express server on port 3000 to overcome iOS Safari CORS restrictions. Tokens are never transmitted to external analytics or third parties.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] block">
                  Telegram Bot Token
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/70 dark:bg-[#141815]/70 border border-[#292820]/15 dark:border-white/15 text-xs font-mono text-[#292820] dark:text-[#E8E9DD] placeholder:text-[#777267] focus:outline-none focus:border-[#02ABB0]"
                  />
                  <button
                    onClick={() => verifyToken(tokenInput)}
                    disabled={isVerifying || !tokenInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#02ABB0] text-white text-xs font-bold active:scale-95 transition shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Connect</span>
                      </>
                    )}
                  </button>
                </div>

                {errorMsg && (
                  <p className="text-xs text-red-500 font-mono flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
                  </p>
                )}
              </div>

              {botInfo && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold">Connected: @{botInfo.username}</h5>
                    <p className="text-[11px] opacity-80">Bot ID: {botInfo.id}</p>
                  </div>
                  <button
                    onClick={() => scanBotUpdates(tokenInput)}
                    disabled={isScanning}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold active:scale-95 transition flex items-center gap-1"
                  >
                    {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                    <span>Scan Music</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DISCOVERED BOT AUDIO FILES */}
          {activeTab === 'active_hub' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#777267] dark:text-[#92998F] font-mono">
                  {discoveredTracks.length} audio files found
                </span>
                <button
                  onClick={() => scanBotUpdates(tokenInput)}
                  disabled={isScanning}
                  className="px-3 py-1 rounded-xl bg-[#292820]/5 dark:bg-white/5 text-xs font-semibold text-[#02ABB0] flex items-center gap-1 active:scale-95 transition"
                >
                  <Loader2 className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {discoveredTracks.length === 0 ? (
                <div className="p-8 text-center text-[#777267] dark:text-[#92998F] text-xs">
                  No audio tracks found in recent bot updates. Send MP3 files to your bot on Telegram and tap Refresh.
                </div>
              ) : (
                <div className="space-y-2">
                  {discoveredTracks.map((item) => {
                    const isDownloading = downloadingIds.has(item.fileId);
                    const isDownloaded = downloadedIds.has(item.fileId);

                    return (
                      <div
                        key={item.fileId}
                        className="p-3 rounded-2xl bg-white/70 dark:bg-[#141815]/70 border border-[#292820]/10 dark:border-white/10 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#02ABB0]/15 text-[#02ABB0] flex items-center justify-center font-bold text-xs shrink-0">
                            <FileMusic className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] truncate">
                              {item.title || item.fileName}
                            </h5>
                            <p className="text-[11px] text-[#777267] dark:text-[#92998F] truncate">
                              {item.performer || 'Telegram Audio'} • <span className="font-mono text-[#02ABB0]">{item.chatTitle}</span>
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-[#777267] font-mono">
                              <span>{formatDuration(item.duration || 0)}</span>
                              <span>• {formatFileSize(item.fileSize)}</span>
                            </div>
                          </div>
                        </div>

                        {isDownloaded ? (
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1 shrink-0">
                            <Check className="w-3.5 h-3.5" /> In Library
                          </span>
                        ) : isDownloading ? (
                          <span className="px-3 py-1.5 rounded-xl bg-[#02ABB0]/20 text-[#02ABB0] text-xs font-mono font-bold flex items-center gap-1 shrink-0">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDownloadItem(item)}
                            className="px-3 py-1.5 rounded-xl bg-[#02ABB0] text-white text-xs font-bold active:scale-95 transition flex items-center gap-1 shrink-0 shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
