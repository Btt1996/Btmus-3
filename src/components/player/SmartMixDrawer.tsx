import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Sliders,
  Activity,
  Check,
  Music,
  ListMusic,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { CrossfadePreset } from '../../types/music';

interface SmartMixDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playlistId?: string;
}

export const SmartMixDrawer: React.FC<SmartMixDrawerProps> = ({ isOpen, onClose, playlistId }) => {
  const {
    playerState,
    updateSmartMixConfig,
    trackAnalyses,
    tracks,
    playlists,
    batchAnalyzeTracks,
    optimizePlaylistHarmonically,
    reorderPlaylistTracks,
    showToast,
  } = useMusic();

  const { smartMixConfig, currentTrack, activeAnalysis, isAnalyzing, analysisProgress } = playerState;

  const [previewOptimizedIds, setPreviewOptimizedIds] = useState<string[] | null>(null);
  const [previewAvgScore, setPreviewAvgScore] = useState<number>(0);
  const [isOptimizing, setIsOptimizing] = useState(false);

  if (!isOpen) return null;

  const currentPlaylist = playlistId
    ? playlists.find((p) => p.id === playlistId)
    : playlists[0];

  const presets: { id: CrossfadePreset; label: string; desc: string }[] = [
    { id: 'off', label: 'Off', desc: 'Standard track change' },
    { id: 'short', label: 'Short (3s)', desc: 'Quick blend' },
    { id: 'balanced', label: 'Balanced (6s)', desc: 'Natural blend' },
    { id: 'long', label: 'Long (10s)', desc: 'Immersive fade' },
    { id: 'custom', label: 'Custom', desc: 'Manual second control' },
  ];

  const handlePresetSelect = (preset: CrossfadePreset) => {
    updateSmartMixConfig({ preset });
  };

  const handleOptimizePlaylist = async () => {
    if (!currentPlaylist || currentPlaylist.trackIds.length <= 1) {
      showToast('Playlist must have at least 2 tracks to optimize');
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await optimizePlaylistHarmonically(currentPlaylist.id);
      if (res) {
        setPreviewOptimizedIds(res.optimizedTrackIds);
        setPreviewAvgScore(res.averageScore);
      }
    } finally {
      setIsOptimizing(false);
    }
  };

  const applyOptimizedOrder = async () => {
    if (!currentPlaylist || !previewOptimizedIds) return;
    await reorderPlaylistTracks(currentPlaylist.id, previewOptimizedIds);
    setPreviewOptimizedIds(null);
    showToast(`Applied Smart Order to "${currentPlaylist.name}"!`);
  };

  const totalAnalyzedCount = Object.keys(trackAnalyses).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 pb-[max(calc(env(safe-area-inset-bottom,0px)+1.5rem),2rem)] shadow-2xl max-h-[88vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-black text-white dark:bg-white dark:text-black flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-black dark:text-white">Btt Smart Mix</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Intelligent song transitions & DJ flow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-black dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Toggle */}
        <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-black dark:text-white">Enable Smart Mix</span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Crossfades consecutive songs seamlessly
            </p>
          </div>
          <button
            onClick={() => updateSmartMixConfig({ enabled: !smartMixConfig.enabled })}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              smartMixConfig.enabled ? 'bg-black dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-800'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white dark:bg-black transition-transform ${
                smartMixConfig.enabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Transition Presets */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" /> Crossfade Duration
          </label>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const isSelected = smartMixConfig.preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePresetSelect(p.id)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{p.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <p className="text-[10px] opacity-75 mt-0.5">{p.desc}</p>
                </button>
              );
            })}
          </div>

          {smartMixConfig.preset === 'custom' && (
            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5 mt-2">
              <div className="flex justify-between text-xs text-black dark:text-white font-semibold">
                <span>Custom Duration:</span>
                <span className="font-mono">{smartMixConfig.duration}s</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={smartMixConfig.duration}
                onChange={(e) => updateSmartMixConfig({ duration: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-zinc-300 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-black dark:accent-white"
              />
            </div>
          )}
        </div>

        {/* Intelligent Options */}
        <div className="space-y-2.5 pt-1">
          <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Harmonic & Silence Controls
          </label>

          <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-black dark:text-white">Trim Intro/Outro Silence</span>
                <p className="text-[10px] text-zinc-500">
                  Skips silence at the start and end of tracks
                </p>
              </div>
              <input
                type="checkbox"
                checked={smartMixConfig.trimSilence}
                onChange={(e) => updateSmartMixConfig({ trimSilence: e.target.checked })}
                className="w-4 h-4 rounded accent-black dark:accent-white"
              />
            </div>

            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-2.5">
              <div>
                <span className="text-xs font-semibold text-black dark:text-white">Harmonic Match Preference</span>
                <p className="text-[10px] text-zinc-500">
                  Uses Camelot keys & BPM alignment when transitioning
                </p>
              </div>
              <input
                type="checkbox"
                checked={smartMixConfig.useHarmonicMixing}
                onChange={(e) => updateSmartMixConfig({ useHarmonicMixing: e.target.checked })}
                className="w-4 h-4 rounded accent-black dark:accent-white"
              />
            </div>
          </div>
        </div>

        {/* Current Song Acoustic Analysis */}
        {activeAnalysis && currentTrack && (
          <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-black dark:text-white flex items-center gap-1">
                <Music className="w-3.5 h-3.5" /> Now Playing Analysis
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white border border-zinc-300 dark:border-zinc-700">
                Camelot {activeAnalysis.camelot}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center pt-1 font-mono">
              <div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[9px] text-zinc-500 block">TEMPO</span>
                <span className="text-xs font-bold text-black dark:text-white">{activeAnalysis.bpm} BPM</span>
              </div>
              <div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[9px] text-zinc-500 block">KEY</span>
                <span className="text-xs font-bold text-black dark:text-white truncate block">{activeAnalysis.key}</span>
              </div>
              <div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[9px] text-zinc-500 block">ENERGY</span>
                <span className="text-xs font-bold text-black dark:text-white">{Math.round(activeAnalysis.energy * 100)}%</span>
              </div>
              <div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[9px] text-zinc-500 block">LOUDNESS</span>
                <span className="text-xs font-bold text-black dark:text-white">{activeAnalysis.loudnessDb} dB</span>
              </div>
            </div>
          </div>
        )}

        {/* Offline Audio Analysis Scanner */}
        <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-black dark:text-white">Local Track Analysis</span>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {totalAnalyzedCount} of {tracks.length} songs analyzed offline
              </p>
            </div>
            <button
              onClick={() => batchAnalyzeTracks()}
              disabled={isAnalyzing || totalAnalyzedCount === tracks.length}
              className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40 text-xs font-semibold text-black dark:text-white flex items-center gap-1.5 transition"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{totalAnalyzedCount === tracks.length ? 'Analyzed' : 'Analyze All'}</span>
                </>
              )}
            </button>
          </div>

          {analysisProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>Analyzing acoustic features...</span>
                <span>{analysisProgress.current} / {analysisProgress.total}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black dark:bg-white transition-all duration-150"
                  style={{
                    width: `${Math.round((analysisProgress.current / analysisProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Smart Order Playlist Optimizer */}
        {currentPlaylist && currentPlaylist.trackIds.length > 1 && (
          <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                  <ListMusic className="w-4 h-4" /> Smart Order: {currentPlaylist.name}
                </span>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Arranges tracks for optimal harmonic key progression & smooth BPM flow
                </p>
              </div>

              <button
                onClick={handleOptimizePlaylist}
                disabled={isOptimizing}
                className="px-3 py-1.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold flex items-center gap-1 shadow-sm transition shrink-0"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Optimize
              </button>
            </div>

            {previewOptimizedIds && (
              <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-black dark:text-white">
                    Optimized Flow Score: {previewAvgScore}% Match
                  </span>
                  <button
                    onClick={() => setPreviewOptimizedIds(null)}
                    className="text-zinc-400 hover:text-black dark:hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                  Calculated sequence harmonically aligns adjacent tracks. Apply to reorder this playlist?
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={applyOptimizedOrder}
                    className="flex-1 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition shadow-sm"
                  >
                    Apply Smart Order
                  </button>
                  <button
                    onClick={() => setPreviewOptimizedIds(null)}
                    className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white text-xs font-semibold"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
