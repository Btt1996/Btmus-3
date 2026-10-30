import React, { useState } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Activity,
  Loader2,
  RefreshCw,
  ArrowUpCircle,
  Clock,
  Zap,
  Copy,
  Share2,
  Server,
  BarChart3,
  Database,
  Palette,
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { formatFileSize } from '../../utils/id3Parser';
import { exportLibraryBackup, importLibraryBackup, clearAllData, getAudioBlob } from '../../services/db';
import { findDuplicateTracks, DuplicateGroup } from '../../utils/duplicates';
import { DuplicatesModal } from '../common/DuplicatesModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { PWAInstallModal } from '../common/PWAInstallModal';
import { SpotDLInfoModal } from '../import/SpotDLInfoModal';
import { X2BenchmarkModal } from '../import/X2BenchmarkModal';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { APP_VERSION, APP_NAME, BUILD_DATE } from '../../constants/version';
import { CrossfadePreset } from '../../types/music';
import { VolumeControl } from '../player/VolumeControl';

export const SettingsScreen: React.FC = () => {
  const {
    settings,
    updateSettings,
    updateSmartMixConfig,
    batchAnalyzeTracks,
    trackAnalyses,
    storageStats,
    tracks,
    refreshLibrary,
    showToast,
    playerState,
    toggleVolumeBooster,
  } = useMusic();

  const { isInstalled } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const {
    currentVersion,
    remoteVersion,
    releaseNotes,
    status: updateStatus,
    lastCheckedAt,
    isUpdateAvailable,
    errorMessage: updateError,
    checkForUpdates,
    applyUpdate,
  } = useAppUpdate();

  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [backupFileInputRef] = useState(() => React.createRef<HTMLInputElement>());

  // Diagnostic Test State
  const [isTestingOffline, setIsTestingOffline] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  // X2 Engine & spotDL Modals State
  const [isSpotDLModalOpen, setIsSpotDLModalOpen] = useState(false);
  const [isBenchmarkModalOpen, setIsBenchmarkModalOpen] = useState(false);
  const [spotDLBridgeUrl, setSpotDLBridgeUrl] = useState(
    localStorage.getItem('btt_spotdl_bridge_url') || ''
  );

  // Duplicates State
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  const handleScanDuplicates = () => {
    const groups = findDuplicateTracks(tracks);
    setDuplicateGroups(groups);
    if (groups.length === 0) {
      showToast('No duplicate tracks found! Your library is clean.');
    } else {
      setIsDuplicatesModalOpen(true);
    }
  };

  const { smartMixConfig, isAnalyzing, analysisProgress } = playerState;

  const handleExportBackup = async (withAudio = false) => {
    try {
      const json = await exportLibraryBackup(withAudio);
      const blob = new Blob([json], { type: 'application/json' });
      const filename = `btmu-${withAudio ? 'vault' : 'db'}-${new Date().toISOString().slice(0, 10)}.json`;
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
      console.error('Export failed:', err);
      showToast('Failed to export backup');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await importLibraryBackup(text);
      await refreshLibrary();
      showToast(`Restored ${res.tracksRestored} songs and ${res.playlistsRestored} playlists!`);
    } catch (err) {
      console.error('Import error:', err);
      showToast('Invalid music database backup file');
    }
    e.target.value = '';
  };

  const runOfflineDiagnostic = async () => {
    setIsTestingOffline(true);
    setDiagnosticResult(null);

    try {
      if (tracks.length === 0) {
        setDiagnosticResult('Library is currently empty. Import a song to test offline playback.');
        setIsTestingOffline(false);
        return;
      }

      const firstTrack = tracks[0];
      const blob = await getAudioBlob(firstTrack.id);

      if (!blob || blob.size === 0) {
        setDiagnosticResult(`Error: Audio file for "${firstTrack.title}" is missing or empty.`);
        setIsTestingOffline(false);
        return;
      }

      const testUrl = URL.createObjectURL(blob);
      const audioTest = new Audio(testUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(testUrl);
          resolve();
        }, 3000);

        audioTest.onloadedmetadata = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(testUrl);
          resolve();
        };

        audioTest.onerror = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(testUrl);
          reject(new Error('Audio decoding failed'));
        };
      });

      setDiagnosticResult(
        `Verified! IndexedDB has ${tracks.length} track(s) cached. Track "${firstTrack.title}" (${formatFileSize(
          blob.size
        )}) decoded successfully offline without network.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Diagnostic failed';
      setDiagnosticResult(`Diagnostic issue: ${msg}`);
    } finally {
      setIsTestingOffline(false);
    }
  };

  const handleClearAll = async () => {
    await clearAllData();
    await refreshLibrary();
    setIsClearDataModalOpen(false);
    showToast('All local music and data cleared.');
  };

  const presets: { id: CrossfadePreset; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'short', label: '3s' },
    { id: 'balanced', label: '6s' },
    { id: 'long', label: '10s' },
    { id: 'custom', label: 'Custom' },
  ];

  const analyzedCount = Object.keys(trackAnalyses).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-notch pb-8 space-y-6 max-w-lg mx-auto w-full">
      {/* Hidden Backup File Input */}
      <input
        ref={backupFileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportBackup}
        className="hidden"
      />

      {/* Screen Title */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--btt-accent)] font-black font-mono">
          btmu by Ahmed
        </div>
        <h1 className="text-3xl font-extrabold text-[var(--btt-card-text)] tracking-tight font-display">Settings</h1>
        <p className="text-xs text-[var(--btt-card-subtext)] mt-1 font-sans">
          btmu preferences, updates, audio transitions, palette themes, and offline storage.
        </p>
      </div>

      {/* SECTION 1: CHECK FOR UPDATES */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[var(--btt-accent)] flex items-center gap-1.5">
          <ArrowUpCircle className="w-4 h-4 text-[var(--btt-accent)]" /> Application Updates
        </h3>

        <div className="p-5 rounded-3xl bg-[var(--btt-surface)] backdrop-blur-2xl border border-[var(--btt-border)] space-y-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-13 h-13 rounded-2xl overflow-hidden shadow-sm border border-[var(--btt-accent)]/30 bg-[var(--btt-surface)] shrink-0">
                <img
                  src="/app-logo.png"
                  alt="btmu Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[var(--btt-card-text)] font-display">btmu by Ahmed</h4>
                <p className="text-xs text-[var(--btt-card-subtext)] font-mono mt-0.5">
                  Version {currentVersion} • iOS Edition
                </p>
              </div>
            </div>

            <button
              onClick={checkForUpdates}
              disabled={updateStatus === 'checking'}
              className="px-3.5 py-2 rounded-xl bg-[var(--btt-accent)]/15 hover:bg-[var(--btt-accent)]/25 border border-[var(--btt-accent)]/25 disabled:opacity-50 text-xs font-bold text-[var(--btt-accent)] flex items-center gap-1.5 transition active:scale-95 shrink-0"
            >
              {updateStatus === 'checking' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check Updates</span>
                </>
              )}
            </button>
          </div>

          {/* Update Status Banner */}
          {updateStatus === 'latest' && (
            <div className="p-3 rounded-2xl bg-[var(--btt-accent)]/15 border border-[var(--btt-accent)]/30 flex items-center gap-2.5 text-xs text-[var(--btt-card-text)] font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--btt-accent)]" />
              <span>You are using the latest version of btmu (v{currentVersion}).</span>
            </div>
          )}

          {updateStatus === 'available' && (
            <div className="p-4 rounded-2xl bg-[var(--btt-accent)]/20 border border-[var(--btt-accent)]/40 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--btt-card-text)] flex items-center gap-1.5">
                  <ArrowUpCircle className="w-4 h-4 text-[var(--btt-accent)]" />
                  Update Available: v{remoteVersion}
                </span>
                <span className="text-[10px] text-[var(--btt-card-subtext)]">Ready to install</span>
              </div>
              {releaseNotes && (
                <p className="text-[11px] text-[var(--btt-card-text)] leading-relaxed bg-[var(--btt-bg)]/80 p-2.5 rounded-xl border border-[var(--btt-border)]">
                  {releaseNotes}
                </p>
              )}
              <button
                onClick={applyUpdate}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--btt-accent)] text-black font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <ArrowUpCircle className="w-4 h-4" />
                Update Now (Preserves all music)
              </button>
            </div>
          )}

          {updateStatus === 'offline' && (
            <div className="p-3 rounded-2xl bg-[var(--btt-surface)] text-xs text-[var(--btt-card-subtext)] flex items-center gap-2 border border-[var(--btt-border)]">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Device is currently offline. Connect to internet to verify updates.</span>
            </div>
          )}

          {lastCheckedAt && (
            <p className="text-[10px] text-[var(--btt-card-subtext)] text-right font-mono">
              Last checked: {new Date(lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </section>

      {/* SECTION: PALETTE COMBOS */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[var(--btt-accent)] flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-[var(--btt-accent)]" /> Palette Combos
        </h3>

        <div className="p-5 rounded-3xl bg-[var(--btt-surface)] backdrop-blur-2xl border border-[var(--btt-border)] space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--btt-card-subtext)]">
              Select your active color palette:
            </span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[var(--btt-accent)]/15 text-[var(--btt-accent)] font-bold">
              {settings.paletteCombo || 'signature'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {/* Signature Palette */}
            <button
              type="button"
              onClick={async () => {
                document.documentElement.setAttribute('data-palette', 'signature');
                await updateSettings({ paletteCombo: 'signature' });
                showToast('Palette switched to Signature (Navy/Gold/Cyan)');
              }}
              className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between ${
                (settings.paletteCombo || 'signature') === 'signature'
                  ? 'border-[var(--btt-accent)] bg-[var(--btt-accent)]/10 ring-1 ring-[var(--btt-accent)]'
                  : 'border-[var(--btt-border)] hover:border-[var(--btt-card-subtext)]/40 bg-[var(--btt-bg)]/40'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[var(--btt-card-text)] font-display">Signature</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--btt-accent)]/20 text-[var(--btt-accent)] font-semibold">DEFAULT</span>
                </div>
                <p className="text-[11px] text-[var(--btt-card-subtext)] leading-snug">
                  Signature Navy (#070E1A) with Gold (#D4AF37) accents and Cyan (#00E5FF) highlights.
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <span className="w-4 h-4 rounded-full bg-[#070E1A] border border-white/20" />
                <span className="w-4 h-4 rounded-full bg-[#D4AF37]" />
                <span className="w-4 h-4 rounded-full bg-[#00E5FF]" />
              </div>
            </button>

            {/* Mono Palette */}
            <button
              type="button"
              onClick={async () => {
                document.documentElement.setAttribute('data-palette', 'mono');
                await updateSettings({ paletteCombo: 'mono' });
                showToast('Palette switched to Mono (Pure Black & White)');
              }}
              className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between ${
                settings.paletteCombo === 'mono'
                  ? 'border-[var(--btt-accent)] bg-[var(--btt-accent)]/10 ring-1 ring-[var(--btt-accent)]'
                  : 'border-[var(--btt-border)] hover:border-[var(--btt-card-subtext)]/40 bg-[var(--btt-bg)]/40'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[var(--btt-card-text)] font-display">Mono</span>
                </div>
                <p className="text-[11px] text-[var(--btt-card-subtext)] leading-snug">
                  Pure black (#000000), crisp white (#FFFFFF), and silver (#E5E7EB) high-contrast minimalist.
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <span className="w-4 h-4 rounded-full bg-black border border-white/30" />
                <span className="w-4 h-4 rounded-full bg-white border border-black/30" />
                <span className="w-4 h-4 rounded-full bg-neutral-400" />
              </div>
            </button>

            {/* Legacy Palette */}
            <button
              type="button"
              onClick={async () => {
                document.documentElement.setAttribute('data-palette', 'legacy');
                await updateSettings({ paletteCombo: 'legacy' });
                showToast('Palette switched to Legacy (Sand/Forest/Chartreuse)');
              }}
              className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between ${
                settings.paletteCombo === 'legacy'
                  ? 'border-[var(--btt-accent)] bg-[var(--btt-accent)]/10 ring-1 ring-[var(--btt-accent)]'
                  : 'border-[var(--btt-border)] hover:border-[var(--btt-card-subtext)]/40 bg-[var(--btt-bg)]/40'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[var(--btt-card-text)] font-display">Legacy</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-500/20 text-[var(--btt-card-subtext)] font-semibold">v1.7</span>
                </div>
                <p className="text-[11px] text-[var(--btt-card-subtext)] leading-snug">
                  v1.7 champagne/sand (#F3EBDD), deep forest (#176B67), and chartreuse (#C8F169).
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <span className="w-4 h-4 rounded-full bg-[#176B67]" />
                <span className="w-4 h-4 rounded-full bg-[#C8F169]" />
                <span className="w-4 h-4 rounded-full bg-[#F3EBDD] border border-black/20" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 2: VOLUME BOOSTER & LOCK SCREEN */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[var(--btt-accent)] flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-[var(--btt-accent)]" /> Volume & Lock Screen Controls
        </h3>

        <div className="p-5 rounded-3xl bg-[var(--btt-surface)] backdrop-blur-2xl border border-[var(--btt-border)] space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-[var(--btt-card-text)] flex items-center gap-1.5">
                3x Audio Booster
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-mono font-bold">
                  Disabled
                </span>
              </span>
              <p className="text-xs text-[var(--btt-card-subtext)] mt-0.5">
                Disabled for background stability on iOS
              </p>
            </div>
            <button
              onClick={() => toggleVolumeBooster()}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 opacity-60 cursor-not-allowed bg-[var(--btt-surface)] text-[var(--btt-card-subtext)] border border-[var(--btt-border)]"
              title="Volume booster is disabled to ensure continuous background playback on iOS"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Disabled</span>
            </button>
          </div>

          <div className="pt-1">
            <VolumeControl showPresets={true} />
          </div>

          <div className="pt-2 border-t border-[var(--btt-border)] space-y-1.5 text-xs text-[var(--btt-card-subtext)]">
            <div className="flex items-start gap-2">
              <span className="text-[var(--btt-accent)] font-bold">📱</span>
              <span>
                <strong className="text-[var(--btt-card-text)]">AirPods & Lock Screen:</strong> Native iOS lock screen controls with track skip (⏮/⏭), seek, and continuous background audio.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--btt-accent)] font-bold">🎵</span>
              <span>
                <strong className="text-[var(--btt-card-text)]">Direct CoreAudio Output:</strong> Web Audio gain routing removed to guarantee uninterrupted playback when phone is locked or backgrounded.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: SMART MIX */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[var(--btt-accent)] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[var(--btt-accent)]" /> Smart Mix & Transitions
        </h3>

        <div className="p-5 rounded-3xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#292820]/10 dark:border-white/10 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD]">Btt Smart Mix</span>
              <p className="text-xs text-[#777267] dark:text-[#92998F]">
                Continuous DJ blending between consecutive songs
              </p>
            </div>
            <input
              type="checkbox"
              checked={smartMixConfig.enabled}
              onChange={(e) => updateSmartMixConfig({ enabled: e.target.checked })}
              className="w-5 h-5 rounded-md accent-[#176B67] dark:accent-[#C8F169] cursor-pointer"
            />
          </div>

          {/* Crossfade Preset Chips */}
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-semibold text-[#777267] dark:text-[#92998F]">Crossfade Duration:</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => updateSmartMixConfig({ preset: p.id })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    smartMixConfig.preset === p.id
                      ? 'bg-[#176B67] text-[#F3EBDD] dark:bg-[#C8F169] dark:text-[#080A09] shadow-sm'
                      : 'bg-[#E8DDC9] dark:bg-[#141815] text-[#777267] dark:text-[#92998F] hover:text-[#292820] dark:hover:text-[#E8E9DD] border border-[#292820]/10 dark:border-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Silence & Harmonic Toggles */}
          <div className="pt-2 border-t border-[#292820]/10 dark:border-white/10 space-y-2.5 text-xs text-[#292820] dark:text-[#E8E9DD]">
            <div className="flex items-center justify-between">
              <span>Trim Dead Silence (Intro/Outro)</span>
              <input
                type="checkbox"
                checked={smartMixConfig.trimSilence}
                onChange={(e) => updateSmartMixConfig({ trimSilence: e.target.checked })}
                className="w-4 h-4 rounded accent-[#176B67] dark:accent-[#C8F169]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span>Harmonic Matching (Camelot Keys)</span>
              <input
                type="checkbox"
                checked={smartMixConfig.useHarmonicMixing}
                onChange={(e) => updateSmartMixConfig({ useHarmonicMixing: e.target.checked })}
                className="w-4 h-4 rounded accent-[#176B67] dark:accent-[#C8F169]"
              />
            </div>
          </div>

          {/* Acoustic Analysis Runner */}
          <div className="pt-2 border-t border-[#292820]/10 dark:border-white/10 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#292820] dark:text-[#E8E9DD]">Acoustic Library Analysis</span>
              <p className="text-[10px] text-[#777267] dark:text-[#92998F] font-mono">
                {analyzedCount} of {tracks.length} songs analyzed
              </p>
            </div>
            <button
              onClick={() => batchAnalyzeTracks()}
              disabled={isAnalyzing || analyzedCount === tracks.length}
              className="px-3 py-1.5 rounded-xl bg-[#176B67] text-[#F3EBDD] dark:bg-[#C8F169] dark:text-[#080A09] disabled:opacity-40 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5" />
                  <span>Analyze Library</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 4: STORAGE & BACKUP */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#176B67] dark:text-[#C8F169] flex items-center gap-1.5">
          <HardDrive className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" /> Storage & Cache
        </h3>

        <div className="p-5 rounded-3xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#292820]/10 dark:border-white/10 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-[#777267] dark:text-[#92998F]">Audio Storage Used</span>
              <p className="text-xl font-extrabold text-[#292820] dark:text-[#E8E9DD] font-mono mt-0.5">
                {formatFileSize(storageStats.trackBytes)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#777267] dark:text-[#92998F]">Total Offline Songs</span>
              <p className="text-xl font-extrabold text-[#292820] dark:text-[#E8E9DD] font-mono mt-0.5">
                {storageStats.trackCount}
              </p>
            </div>
          </div>

          {/* Quota Meter */}
          {storageStats.quotaBytes > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[10px] text-[#777267] dark:text-[#92998F] font-mono">
                <span>Used: {formatFileSize(storageStats.usedBytes)}</span>
                <span>Available: {formatFileSize(storageStats.quotaBytes)}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#E8DDC9] dark:bg-[#141815] overflow-hidden border border-[#292820]/5 dark:border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-[#176B67] to-[#C8F169] rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(2, (storageStats.usedBytes / storageStats.quotaBytes) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Duplicate Track Cleaner */}
          <div className="pt-3 border-t border-[#292820]/10 dark:border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                <span>Duplicate Songs Cleaner</span>
              </div>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F] mt-0.5">
                Detect redundant song uploads and recover local storage
              </p>
            </div>
            <button
              onClick={handleScanDuplicates}
              className="py-1.5 px-3 rounded-xl border border-[#176B67]/30 dark:border-[#C8F169]/30 bg-[#176B67]/10 dark:bg-[#C8F169]/10 text-[#176B67] dark:text-[#C8F169] hover:bg-[#176B67] hover:text-[#F3EBDD] dark:hover:bg-[#C8F169] dark:hover:text-[#080A09] text-xs font-bold transition flex items-center gap-1 active:scale-95"
            >
              <span>Scan Duplicates</span>
            </button>
          </div>

          {/* Export / Import Database */}
          <div className="space-y-2 pt-2 border-t border-[#292820]/10 dark:border-white/10">
            <div className="text-[11px] font-bold text-[#777267] dark:text-[#92998F] uppercase tracking-wider font-mono">
              Database Backup & Sharing
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleExportBackup(false)}
                className="py-2.5 px-3 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/20 text-[#292820] dark:text-[#E8E9DD] border border-[#292820]/10 dark:border-white/10 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                Export DB (.json)
              </button>
              <button
                onClick={() => backupFileInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/20 text-[#292820] dark:text-[#E8E9DD] border border-[#292820]/10 dark:border-white/10 text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
                Restore DB File
              </button>
            </div>
            <button
              onClick={() => handleExportBackup(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#176B67] hover:bg-[#176B67]/90 text-[#F3EBDD] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm active:scale-98"
            >
              <Share2 className="w-3.5 h-3.5 text-[#C8F169]" />
              Export Complete Audio Vault (for sharing)
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 5: SPOTIFY ENGINE & X2 RETRIEVAL */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#176B67] dark:text-[#C8F169] flex items-center gap-1.5">
          <Server className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" /> Music Engines & Spotify Integration
        </h3>

        <div className="p-5 rounded-3xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#292820]/10 dark:border-white/10 space-y-4 shadow-sm">
          {/* Spotify Engine Active Status */}
          <div className="p-3.5 rounded-2xl bg-[#1DB954]/10 border border-[#1DB954]/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1DB954] animate-pulse" />
                <span className="text-xs font-bold text-[#1DB954] uppercase tracking-wider font-mono">
                  Spotify Search & Playlist Engine: Active
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] text-[10px] font-mono font-bold">
                Direct / No Token
              </span>
            </div>
            <p className="text-xs text-[#292820]/80 dark:text-[#E8E9DD]/80 leading-relaxed">
              Available in the Search tab. Resolves public Spotify track, playlist, and album links without requiring personal API keys or developer accounts.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-bold text-[#292820] dark:text-[#E8E9DD] flex items-center gap-1.5">
              Modular X2 Engine
              <span className="px-2 py-0.5 rounded-full bg-[#C8F169]/20 text-[#176B67] dark:text-[#C8F169] text-[10px] font-mono font-bold">
                Local Cache + Hub Active
              </span>
            </span>
            <p className="text-xs text-[#777267] dark:text-[#92998F] leading-relaxed">
              Prioritized audio resolution: checks your verified local IndexedDB cache first (0ms, 0 network cost), queries your Telegram Hub (inspired by @MusicsHuntersbot), then falls back to Jamendo Open Music, Internet Archive, and Free Music Archive.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => setIsBenchmarkModalOpen(true)}
              className="py-2.5 px-3 rounded-2xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/20 border border-[#292820]/10 dark:border-white/10 text-[#292820] dark:text-[#E8E9DD] text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
              <span>Real Track Benchmark</span>
            </button>
            <button
              onClick={() => setIsSpotDLModalOpen(true)}
              className="py-2.5 px-3 rounded-2xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/20 border border-[#292820]/10 dark:border-white/10 text-[#292820] dark:text-[#E8E9DD] text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Server className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
              <span>spotDL Evaluation</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 6: OFFLINE VERIFICATION & INSTALL */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#176B67] dark:text-[#C8F169] flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" /> Offline & Device Status
        </h3>

        <div className="p-5 rounded-3xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-2xl border border-[#292820]/10 dark:border-white/10 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">iPhone Installation</span>
              <p className="text-[11px] text-[#777267] dark:text-[#92998F]">
                {isInstalled
                  ? 'Running as installed Home Screen PWA'
                  : 'Running in browser tab'}
              </p>
            </div>

            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/20 border border-[#292820]/10 dark:border-white/10 text-[#292820] dark:text-[#E8E9DD] text-xs font-bold flex items-center gap-1"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#176B67] dark:text-[#C8F169]" />
              {isInstalled ? 'Instructions' : 'Install Guide'}
            </button>
          </div>

          <div className="pt-2 border-t border-[#292820]/10 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#292820] dark:text-[#E8E9DD]">Offline Playback Audit</span>
              <button
                onClick={runOfflineDiagnostic}
                disabled={isTestingOffline}
                className="px-3 py-1.5 rounded-xl bg-[#176B67] text-[#F3EBDD] dark:bg-[#C8F169] dark:text-[#080A09] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isTestingOffline ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Run Audit
              </button>
            </div>

            {diagnosticResult && (
              <div className="p-3 rounded-2xl bg-[#F3EBDD]/70 dark:bg-[#080A09]/70 border border-[#292820]/10 dark:border-white/10 text-[11px] text-[#292820] dark:text-[#E8E9DD] leading-relaxed font-mono">
                {diagnosticResult}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DANGER ZONE */}
      <section className="space-y-3 pt-2">
        <div className="p-4 rounded-3xl bg-[#E8DDC9]/70 dark:bg-[#141815]/80 backdrop-blur-2xl border border-red-500/20 dark:border-red-500/30 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Reset Local Data
            </span>
            <p className="text-[11px] text-[#777267] dark:text-[#92998F]">
              Clear all IndexedDB audio files and playlists.
            </p>
          </div>

          <button
            onClick={() => setIsClearDataModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold transition active:scale-95 shrink-0"
          >
            Clear Data
          </button>
        </div>
      </section>

      {/* Footer Branding */}
      <div className="text-center pt-2 pb-6 text-[11px] text-[#777267] dark:text-[#92998F] space-y-1">
        <p className="font-bold text-[var(--btt-accent)] font-mono">btmu by Ahmed</p>
        <p>{APP_NAME} v{APP_VERSION} • iOS Edition • Built {BUILD_DATE}</p>
      </div>

      {/* Modals */}
      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      <ConfirmModal
        isOpen={isClearDataModalOpen}
        title="Clear All Local Music & Data?"
        description="Are you sure? This will remove all downloaded songs, audio files, playlists, and settings from your device. This cannot be undone."
        confirmLabel="Clear Everything"
        isDestructive={true}
        onConfirm={handleClearAll}
        onCancel={() => setIsClearDataModalOpen(false)}
      />

      <DuplicatesModal
        isOpen={isDuplicatesModalOpen}
        onClose={() => setIsDuplicatesModalOpen(false)}
        duplicateGroups={duplicateGroups}
        onDuplicatesRemoved={() => {
          setDuplicateGroups([]);
        }}
      />

      <SpotDLInfoModal
        isOpen={isSpotDLModalOpen}
        onClose={() => setIsSpotDLModalOpen(false)}
        bridgeUrl={spotDLBridgeUrl}
        onSaveBridgeUrl={(url) => {
          setSpotDLBridgeUrl(url);
          localStorage.setItem('btt_spotdl_bridge_url', url);
          showToast('Updated spotDL bridge configuration');
        }}
      />

      <X2BenchmarkModal
        isOpen={isBenchmarkModalOpen}
        onClose={() => setIsBenchmarkModalOpen(false)}
        settings={{
          matchingThreshold: 70,
          enableJamendo: true,
          enableInternetArchive: true,
          enableFMA: true,
          enableTelegramMatch: true,
          enableSpotDLBridge: !!spotDLBridgeUrl,
          spotDLBridgeUrl,
          spotifyClientId: localStorage.getItem('btt_spotify_client_id') || '',
          spotifyClientSecret: localStorage.getItem('btt_spotify_client_secret') || '',
          requireConfirmationForMedium: true,
          preferLocalCache: true,
          maxRetries: 2,
        }}
      />
    </div>
  );
};
