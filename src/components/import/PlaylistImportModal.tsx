import React, { useState, useRef } from 'react';
import {
  X,
  Music,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  ExternalLink,
  Play,
  Pause,
  Download,
  ListMusic,
  Info,
  Server,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  BarChart3,
  RefreshCw,
  Database,
  Radio,
  Send,
} from 'lucide-react';
import {
  NormalizedPlaylist,
  NormalizedTrackMetadata,
  TrackImportProgressItem,
  ImportSummary,
  ImportSettings,
  AudioCandidateMatch,
} from '../../types/playlistImport';
import { fetchSpotifyPlaylist, parseSpotifyPlaylistId } from '../../services/playlistImport/x1Spotify';
import {
  executeX2Import,
  downloadAndValidateAudio,
  retryIndividualTrack,
} from '../../services/playlistImport/x2Engine';
import { saveTrack, savePlaylist } from '../../services/db';
import { Track, Playlist } from '../../types/music';
import { useMusic } from '../../context/MusicContext';
import { SpotDLInfoModal } from './SpotDLInfoModal';
import { X2BenchmarkModal } from './X2BenchmarkModal';

interface PlaylistImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaylistCreated?: (playlistId: string) => void;
}

type Step = 'input' | 'preview' | 'processing' | 'summary';

export const PlaylistImportModal: React.FC<PlaylistImportModalProps> = ({
  isOpen,
  onClose,
  onPlaylistCreated,
}) => {
  const { refreshLibrary, showToast } = useMusic();

  const [step, setStep] = useState<Step>('input');
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingX1, setIsLoadingX1] = useState(false);
  const [x1Error, setX1Error] = useState<string | null>(null);

  // Spotify Credentials Drawer inside Modal
  const [showSpotifyCredentials, setShowSpotifyCredentials] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState(
    localStorage.getItem('btt_spotify_client_id') || ''
  );
  const [spotifyClientSecret, setSpotifyClientSecret] = useState(
    localStorage.getItem('btt_spotify_client_secret') || ''
  );

  // Normalized X1 Output
  const [normalizedPlaylist, setNormalizedPlaylist] = useState<NormalizedPlaylist | null>(null);

  // Modular X2 Settings
  const [settings, setSettings] = useState<ImportSettings>({
    matchingThreshold: 70,
    enableJamendo: true,
    enableInternetArchive: true,
    enableFMA: true,
    enableTelegramMatch: true,
    enableSpotDLBridge: false,
    preferLocalCache: true,
    spotDLBridgeUrl: localStorage.getItem('btt_spotdl_bridge_url') || '',
    spotifyClientId: localStorage.getItem('btt_spotify_client_id') || '',
    spotifyClientSecret: localStorage.getItem('btt_spotify_client_secret') || '',
    requireConfirmationForMedium: true,
    maxRetries: 2,
  });

  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [isSpotDLInfoOpen, setIsSpotDLInfoOpen] = useState(false);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);

  // X2 Engine Progress State
  const [importProgress, setImportProgress] = useState<Record<string, TrackImportProgressItem>>({});
  const [summary, setSummary] = useState<ImportSummary>({
    total: 0,
    completed: 0,
    alreadyLocal: 0,
    reviewRequired: 0,
    unavailable: 0,
    failed: 0,
  });
  const [isExecutingX2, setIsExecutingX2] = useState(false);
  const [createdPlaylist, setCreatedPlaylist] = useState<Playlist | null>(null);
  const isCancelledRef = useRef(false);

  // Audio Preview Player
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  const togglePreview = (url: string, matchId: string) => {
    if (previewTrackId === matchId) {
      previewAudioRef.current?.pause();
      setPreviewTrackId(null);
      return;
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.onended = () => setPreviewTrackId(null);
    }
    previewAudioRef.current.src = url;
    previewAudioRef.current.play().catch(() => {});
    setPreviewTrackId(matchId);
  };

  const handleResolvePlaylist = async () => {
    setX1Error(null);
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setX1Error('Please enter a Spotify playlist link.');
      return;
    }

    // Spotify Resolution
    const spotifyId = parseSpotifyPlaylistId(trimmed);
    if (!spotifyId) {
      setX1Error('Unrecognized URL format. Please enter a valid Spotify playlist link.');
      return;
    }

    setIsLoadingX1(true);
    try {
      const result = await fetchSpotifyPlaylist(trimmed, {
        clientId: spotifyClientId.trim() || undefined,
        clientSecret: spotifyClientSecret.trim() || undefined,
      });

      if (!result.tracks || result.tracks.length === 0) {
        throw new Error('Playlist resolved, but no playable tracks were returned.');
      }

      setNormalizedPlaylist(result);
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch playlist metadata.';
      setX1Error(msg);
    } finally {
      setIsLoadingX1(false);
    }
  };

  const handleStartX2Import = async () => {
    if (!normalizedPlaylist) return;
    setStep('processing');
    setIsExecutingX2(true);
    isCancelledRef.current = false;

    // Reset progress map
    const initialMap: Record<string, TrackImportProgressItem> = {};
    normalizedPlaylist.tracks.forEach((t, idx) => {
      initialMap[`item_${idx}`] = {
        id: `item_${idx}`,
        track: t,
        status: 'pending',
        candidateMatches: [],
        downloadProgress: 0,
      };
    });
    setImportProgress(initialMap);

    try {
      const res = await executeX2Import({
        tracks: normalizedPlaylist.tracks,
        playlistTitle: normalizedPlaylist.playlistTitle,
        playlistDescription: normalizedPlaylist.playlistDescription,
        playlistCoverUrl: normalizedPlaylist.playlistCoverUrl,
        settings: {
          ...settings,
          spotifyClientId,
          spotifyClientSecret,
        },
        onItemUpdate: (item) => {
          setImportProgress((prev) => ({ ...prev, [item.id]: item }));
        },
        onSummaryUpdate: (s) => setSummary(s),
        isCancelledRef,
      });

      setCreatedPlaylist(res.createdPlaylist);
      await refreshLibrary();
      setStep('summary');
    } catch (err: unknown) {
      showToast('Import interrupted: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsExecutingX2(false);
    }
  };

  // Individual Track Retry (Requirement 4)
  const handleRetryTrack = async (item: TrackImportProgressItem) => {
    showToast(`Retrying "${item.track.title}"...`);
    const result = await retryIndividualTrack(
      item,
      settings,
      (updated) => {
        setImportProgress((prev) => ({ ...prev, [updated.id]: updated }));
      },
      createdPlaylist?.id
    );

    if (result.success) {
      setSummary((prev) => ({
        ...prev,
        completed: prev.completed + 1,
        unavailable: Math.max(0, prev.unavailable - 1),
        failed: Math.max(0, prev.failed - 1),
      }));
      await refreshLibrary();
      showToast(`Saved "${item.track.title}"!`);
    } else {
      showToast(`Retry failed: ${result.error || 'Unavailable'}`);
    }
  };

  const handleManualConfirmMatch = async (itemId: string, match: AudioCandidateMatch) => {
    const item = importProgress[itemId];
    if (!item) return;

    setImportProgress((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], status: 'downloading', selectedMatch: match, downloadProgress: 0 },
    }));

    try {
      const { blob, mimeType } = await downloadAndValidateAudio(match.downloadUrl, (p) => {
        setImportProgress((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], downloadProgress: p },
        }));
      });

      const trackId = `manual_match_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newTrack: Track = {
        id: trackId,
        title: item.track.title,
        artist: item.track.artists.join(', ') || match.artist,
        album: item.track.album || normalizedPlaylist?.playlistTitle || 'Imported Playlist',
        duration: match.durationSeconds || Math.round(item.track.durationMs / 1000) || 0,
        fileSize: blob.size,
        mimeType: mimeType,
        fileName: `${item.track.title}.mp3`,
        downloadDate: Date.now(),
        isFavorite: false,
        playCount: 0,
        artworkUrl: item.track.artworkUrl || normalizedPlaylist?.playlistCoverUrl,
        telegramSource: {
          chatTitle: `Import: ${normalizedPlaylist?.playlistTitle || 'Web'}`,
          topicName: match.provider.toUpperCase(),
          sourceType: 'manual',
        },
      };

      await saveTrack(newTrack, blob);

      if (createdPlaylist) {
        const updated = {
          ...createdPlaylist,
          trackIds: Array.from(new Set([...createdPlaylist.trackIds, trackId])),
          updatedAt: Date.now(),
        };
        await savePlaylist(updated);
        setCreatedPlaylist(updated);
      }

      setImportProgress((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], status: 'completed', savedTrackId: trackId },
      }));

      setSummary((prev) => ({
        ...prev,
        completed: prev.completed + 1,
        reviewRequired: Math.max(0, prev.reviewRequired - 1),
      }));

      await refreshLibrary();
      showToast(`Added "${item.track.title}" to library!`);
    } catch (err: unknown) {
      setImportProgress((prev) => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Download failed',
        },
      }));
    }
  };

  const saveCredentials = () => {
    localStorage.setItem('btt_spotify_client_id', spotifyClientId.trim());
    localStorage.setItem('btt_spotify_client_secret', spotifyClientSecret.trim());
    showToast('Saved Spotify API credentials');
    setShowSpotifyCredentials(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-white/95 dark:bg-[#070b0e]/95 border border-zinc-200 dark:border-white/10 shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Top Glass Bar */}
        <div className="p-4 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/50 dark:bg-black/30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#02ABB0] text-black flex items-center justify-center font-bold">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black tracking-widest text-[#02ABB0] uppercase font-mono">
                  X1 / X2 ARCHITECTURE
                </span>
                <span className="text-[10px] text-zinc-400">• Modular Audio Engine</span>
              </div>
              <h2 className="text-base font-extrabold text-black dark:text-white leading-none mt-0.5">
                Spotify Import & Audio Retrieval
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsBenchmarkOpen(true)}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[#02ABB0] transition active:scale-90"
              title="Run Real Track Benchmark"
            >
              <BarChart3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (previewAudioRef.current) previewAudioRef.current.pause();
                isCancelledRef.current = true;
                onClose();
              }}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition active:scale-90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STEP 1: INPUT PLAYLIST URL */}
        {step === 'input' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5 mb-1.5">
                <Music className="w-3.5 h-3.5 text-[#02ABB0]" />
                Enter Spotify Playlist URL
              </label>
              <div className="space-y-2">
                <input
                  type="url"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:border-[#02ABB0] font-mono transition"
                />

                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                      Keyless Resolver Active
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#176B67]/15 text-[#176B67] dark:text-[#C8F169] text-[10px] font-semibold">
                      SoundCloud Ready
                    </span>
                  </div>

                  <button
                    onClick={() => setShowSpotifyCredentials(!showSpotifyCredentials)}
                    className="text-zinc-500 hover:text-black dark:hover:text-white font-medium flex items-center gap-1 text-[10px]"
                  >
                    API Keys {showSpotifyCredentials ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Optional Spotify Developer Credentials Drawer */}
            {showSpotifyCredentials && (
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#02ABB0]" /> Custom Developer Keys (Optional)
                  </span>
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[#02ABB0] hover:underline flex items-center gap-0.5"
                  >
                    Spotify Dashboard <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Keyless resolution handles public playlists. Custom credentials are only needed if you wish to import private personal playlists.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Spotify Client ID"
                    value={spotifyClientId}
                    onChange={(e) => setSpotifyClientId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
                  />
                  <input
                    type="password"
                    placeholder="Spotify Client Secret"
                    value={spotifyClientSecret}
                    onChange={(e) => setSpotifyClientSecret(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-black border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
                  />
                  <button
                    onClick={saveCredentials}
                    className="w-full py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition active:scale-95"
                  >
                    Save Credentials
                  </button>
                </div>
              </div>
            )}

            {/* Error banner */}
            {x1Error && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Resolution Error</span>
                </div>
                <p className="leading-relaxed text-[11px]">{x1Error}</p>
              </div>
            )}

            {/* Benchmark Quick Action Card */}
            <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-[#024E5B]/20 border border-zinc-200 dark:border-[#02ABB0]/30 flex items-center justify-between">
              <div>
                <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[#02ABB0]" />
                  <span>Test Real Tracks (Requirement 6)</span>
                </div>
                <p className="text-[10px] text-zinc-500">Live benchmark across commercial & CC tracks without fake data</p>
              </div>
              <button
                onClick={() => setIsBenchmarkOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-bold text-[11px] active:scale-95 transition"
              >
                Run Diagnostic
              </button>
            </div>

            {/* Modular X2 Audio Providers Config Accordion */}
            <div className="border border-zinc-200 dark:border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-black dark:text-white bg-zinc-50 dark:bg-zinc-900/60"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#02ABB0]" />
                  <span>Modular X2 Audio Adapters</span>
                </div>
                {showSettingsDrawer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showSettingsDrawer && (
                <div className="p-4 space-y-3.5 bg-white dark:bg-black text-xs border-t border-zinc-200 dark:border-zinc-800">
                  {/* Matching Threshold */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-black dark:text-white">
                        Match Confidence Threshold: {settings.matchingThreshold}%
                      </span>
                      <span className="text-zinc-500">
                        {settings.matchingThreshold >= 80 ? 'Strict' : 'Balanced'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={95}
                      value={settings.matchingThreshold}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          matchingThreshold: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full accent-[#02ABB0]"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Matches above threshold download automatically. Medium matches pause for review.
                    </p>
                  </div>

                  {/* Provider Toggles */}
                  <div className="space-y-2.5 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-semibold text-black dark:text-white flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-[#02ABB0]" />
                          <span>Local Library Cache (Priority 1)</span>
                        </div>
                        <div className="text-[10px] text-zinc-500">Reuses existing audio blobs with 0 network usage</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.preferLocalCache}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, preferLocalCache: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[#02ABB0]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-semibold text-black dark:text-white flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-[#02ABB0]" />
                          <span>Telegram Audio Hub</span>
                        </div>
                        <div className="text-[10px] text-zinc-500">Matches from connected Telegram bot & sync library</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.enableTelegramMatch}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, enableTelegramMatch: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[#02ABB0]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-semibold text-black dark:text-white">Jamendo Open Music (Fallback)</div>
                        <div className="text-[10px] text-zinc-500">Legal Creative Commons indie catalog</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.enableJamendo}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, enableJamendo: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[#02ABB0]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-semibold text-black dark:text-white">Internet Archive (Fallback)</div>
                        <div className="text-[10px] text-zinc-500">Public domain & Live Music Archive recordings</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.enableInternetArchive}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            enableInternetArchive: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-[#02ABB0]"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-semibold text-black dark:text-white">Free Music Archive (FMA)</div>
                        <div className="text-[10px] text-zinc-500">Open archive audio catalog</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.enableFMA}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            enableFMA: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-[#02ABB0]"
                      />
                    </label>

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <div className="font-semibold text-black dark:text-white flex items-center gap-1.5">
                          <span>spotDL Bridge</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              settings.spotDLBridgeUrl
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                            }`}
                          >
                            {settings.spotDLBridgeUrl ? 'Configured' : 'Needs Host'}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500">Requires self-hosted Python microservice</div>
                      </div>

                      <button
                        onClick={() => setIsSpotDLInfoOpen(true)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white text-[11px] font-semibold border border-zinc-300 dark:border-zinc-700"
                      >
                        Architecture
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Resolve Button */}
            <button
              onClick={handleResolvePlaylist}
              disabled={isLoadingX1 || !urlInput.trim()}
              className="w-full py-3.5 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              {isLoadingX1 ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#02ABB0]" />
                  <span>Fetching Playlist Metadata via Official API...</span>
                </>
              ) : (
                <>
                  <Music className="w-4 h-4" />
                  <span>Fetch Playlist Metadata</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 2: PREVIEW RESOLVED X1 METADATA */}
        {step === 'preview' && normalizedPlaylist && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Playlist Header Card */}
            <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-[#024E5B]/20 border border-zinc-200 dark:border-[#02ABB0]/30 flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-2xl bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 shadow-md">
                {normalizedPlaylist.playlistCoverUrl ? (
                  <img
                    src={normalizedPlaylist.playlistCoverUrl}
                    alt={normalizedPlaylist.playlistTitle}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <ListMusic className="w-8 h-8" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-[#02ABB0] text-black text-[9px] font-black uppercase font-mono">
                    {normalizedPlaylist.source.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {normalizedPlaylist.totalTracks} Tracks Resolved
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-black dark:text-white truncate mt-0.5">
                  {normalizedPlaylist.playlistTitle}
                </h3>
                {normalizedPlaylist.playlistDescription && (
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {normalizedPlaylist.playlistDescription}
                  </p>
                )}
              </div>
            </div>

            {/* Resolved Tracks Preview List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-black dark:text-white">
                <span>Normalized Track Metadata</span>
                <span className="text-zinc-500 text-[11px] font-mono">
                  Order Preserved
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {normalizedPlaylist.tracks.map((t) => (
                  <div
                    key={t.position}
                    className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-5 text-center text-[10px] font-mono text-zinc-400">
                        {t.position + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-black dark:text-white truncate">
                          {t.title}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {t.artists.join(', ')} • {t.album}
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-zinc-400 shrink-0">
                      {Math.floor(t.durationMs / 60000)}:
                      {String(Math.floor((t.durationMs % 60000) / 1000)).padStart(2, '0')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setStep('input')}
                className="py-3 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white font-bold text-xs active:scale-95 transition"
              >
                Change Link
              </button>
              <button
                onClick={handleStartX2Import}
                className="flex-1 py-3 rounded-2xl bg-[#02ABB0] hover:bg-[#01A4BD] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-[#02ABB0]/20 active:scale-95 transition"
              >
                <Download className="w-4 h-4" />
                <span>Start Audio Matching & Download</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PROCESSING X2 LIVE PIPELINE */}
        {step === 'processing' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Live Progress Bar & Stats */}
            <div className="p-4 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-black dark:text-white flex items-center gap-1.5">
                  {isExecutingX2 ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#02ABB0]" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  <span>Retrieving Audio Recordings...</span>
                </span>
                <span className="font-mono text-zinc-500 text-[11px]">
                  {summary.completed + summary.unavailable + summary.failed} / {summary.total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#02ABB0] transition-all duration-300"
                  style={{
                    width: `${
                      summary.total > 0
                        ? Math.min(100, Math.round(((summary.completed + summary.alreadyLocal) / summary.total) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>

              {/* Metric Chips */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] text-center font-bold">
                <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {summary.completed} Saved
                </div>
                <div className="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  {summary.alreadyLocal} Local
                </div>
                <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {summary.reviewRequired} Review
                </div>
                <div className="p-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-500">
                  {summary.unavailable} Unavail
                </div>
              </div>
            </div>

            {/* Live Track List with Action Cards & Individual Retry */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {Object.values(importProgress).map((item) => {
                const isReview = item.status === 'review_required';
                const canRetry = item.status === 'unavailable' || item.status === 'failed';
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border transition text-xs space-y-2 ${
                      item.status === 'completed'
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : item.status === 'already_local'
                        ? 'bg-cyan-500/5 border-cyan-500/30'
                        : isReview
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : item.status === 'unavailable'
                        ? 'bg-zinc-100/60 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800'
                        : item.status === 'failed'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-black dark:text-white truncate">
                          {item.track.title}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {item.track.artists.join(', ')}
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="shrink-0 flex items-center gap-1.5">
                        {item.status === 'completed' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                            Saved
                          </span>
                        )}
                        {item.status === 'already_local' && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-bold">
                            Cached
                          </span>
                        )}
                        {item.status === 'downloading' && (
                          <span className="px-2 py-0.5 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] text-[10px] font-bold">
                            {item.downloadProgress}%
                          </span>
                        )}
                        {item.status === 'searching' && (
                          <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 text-[10px] font-bold">
                            Searching
                          </span>
                        )}
                        {item.status === 'unavailable' && (
                          <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 text-[10px] font-medium">
                            No Match
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 text-[10px] font-bold">
                            Error
                          </span>
                        )}

                        {/* Individual Retry Button (Requirement 4) */}
                        {canRetry && !isExecutingX2 && (
                          <button
                            onClick={() => handleRetryTrack(item)}
                            className="p-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-[#02ABB0] hover:text-black transition active:scale-95"
                            title="Retry this track individually"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Diagnostic error note if unavailable or failed */}
                    {(item.status === 'unavailable' || item.status === 'failed') && item.errorMessage && (
                      <div className="text-[10px] text-zinc-500 italic">
                        {item.errorMessage}
                      </div>
                    )}

                    {/* Review Confirmation Card for Ambiguous Matches */}
                    {isReview && item.selectedMatch && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-black border border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            Confidence: {item.selectedMatch.confidenceScore}% • {item.selectedMatch.provider.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {item.selectedMatch.matchReason}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-700 dark:text-zinc-300">
                          Candidate: <strong>{item.selectedMatch.title}</strong> by {item.selectedMatch.artist}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            onClick={() =>
                              togglePreview(
                                item.selectedMatch!.downloadUrl,
                                item.selectedMatch!.providerTrackId
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white text-[10px] font-bold flex items-center gap-1 active:scale-95"
                          >
                            {previewTrackId === item.selectedMatch.providerTrackId ? (
                              <>
                                <Pause className="w-3 h-3 fill-current" /> Pause Preview
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current" /> Listen Preview
                              </>
                            )}
                          </button>

                          <button
                            onClick={() =>
                              handleManualConfirmMatch(item.id, item.selectedMatch!)
                            }
                            className="px-3 py-1 rounded-lg bg-amber-500 text-black text-[10px] font-extrabold active:scale-95 transition"
                          >
                            Confirm & Download
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cancel or Finish */}
            <div className="pt-2 flex justify-end">
              {!isExecutingX2 ? (
                <button
                  onClick={() => setStep('summary')}
                  className="px-5 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-bold active:scale-95"
                >
                  View Final Report
                </button>
              ) : (
                <button
                  onClick={() => {
                    isCancelledRef.current = true;
                    showToast('Stopping remaining downloads...');
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold"
                >
                  Stop Import
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: FINAL SUMMARY REPORT */}
        {step === 'summary' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="p-5 rounded-3xl bg-zinc-100 dark:bg-[#024E5B]/20 border border-zinc-200 dark:border-[#02ABB0]/30 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-500 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-extrabold text-black dark:text-white">
                Import Complete!
              </h3>
              <p className="text-xs text-zinc-500">
                Created playlist <strong>"{createdPlaylist?.name || normalizedPlaylist?.playlistTitle}"</strong> with {createdPlaylist?.trackIds.length || summary.completed} songs.
              </p>
            </div>

            {/* Detailed Categorized Breakdown */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-black dark:text-white">Import Summary Report:</h4>

              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">Total Requested Tracks:</span>
                  <span className="font-mono font-bold text-black dark:text-white">{summary.total}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                  <span>Downloaded & Saved:</span>
                  <span className="font-mono font-bold">+{summary.completed - summary.alreadyLocal}</span>
                </div>
                <div className="flex justify-between items-center text-cyan-600 dark:text-cyan-400">
                  <span>Reused from Verified Local Cache:</span>
                  <span className="font-mono font-bold">{summary.alreadyLocal}</span>
                </div>
                {summary.reviewRequired > 0 && (
                  <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                    <span>Awaiting User Review:</span>
                    <span className="font-mono font-bold">{summary.reviewRequired}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Unavailable on Open/Permitted Providers:</span>
                  <span className="font-mono font-bold">{summary.unavailable}</span>
                </div>
                {summary.failed > 0 && (
                  <div className="flex justify-between items-center text-rose-500">
                    <span>Failed Downloads:</span>
                    <span className="font-mono font-bold">{summary.failed}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Remaining Limitations Notice */}
            <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 leading-relaxed space-y-1">
              <div className="font-semibold text-black dark:text-white">Remaining Limitations:</div>
              <p>
                Commercial recordings cannot be legally acquired from Jamendo or Internet Archive. For any unavailable tracks, you can forward audio files to your Telegram Hub or configure a self-hosted spotDL runner.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  setStep('input');
                  setUrlInput('');
                }}
                className="py-3 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white font-bold text-xs active:scale-95 transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Import Another</span>
              </button>

              <button
                onClick={() => {
                  if (createdPlaylist && onPlaylistCreated) {
                    onPlaylistCreated(createdPlaylist.id);
                  }
                  onClose();
                }}
                className="flex-1 py-3 rounded-2xl bg-[#02ABB0] text-black font-extrabold text-xs active:scale-95 transition shadow-md shadow-[#02ABB0]/20"
              >
                Open Playlist in Library &rarr;
              </button>
            </div>
          </div>
        )}

        {/* SpotDL Info & Architecture Modal */}
        <SpotDLInfoModal
          isOpen={isSpotDLInfoOpen}
          onClose={() => setIsSpotDLInfoOpen(false)}
          bridgeUrl={settings.spotDLBridgeUrl || ''}
          onSaveBridgeUrl={(url) => {
            setSettings((prev) => ({
              ...prev,
              spotDLBridgeUrl: url,
              enableSpotDLBridge: !!url,
            }));
            localStorage.setItem('btt_spotdl_bridge_url', url);
            showToast('Updated spotDL bridge configuration');
          }}
        />

        {/* Real Track Benchmark Modal (Requirement 6) */}
        <X2BenchmarkModal
          isOpen={isBenchmarkOpen}
          onClose={() => setIsBenchmarkOpen(false)}
          settings={settings}
        />
      </div>
    </div>
  );
};
