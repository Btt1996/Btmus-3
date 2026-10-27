import React, { useState } from 'react';
import {
  X,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Download,
  ShieldAlert,
  Sparkles,
  BarChart3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  X2BenchmarkReport,
  ImportSettings,
} from '../../types/playlistImport';
import { runX2Benchmark } from '../../services/playlistImport/x2Benchmark';

interface X2BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ImportSettings;
}

export const X2BenchmarkModal: React.FC<X2BenchmarkModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<{
    current: number;
    total: number;
    trackName: string;
  } | null>(null);
  const [report, setReport] = useState<X2BenchmarkReport | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleStartBenchmark = async () => {
    setIsRunning(true);
    setReport(null);
    setCurrentProgress({ current: 0, total: 6, trackName: 'Initializing live providers...' });

    try {
      const result = await runX2Benchmark(settings, (current, total, trackName) => {
        setCurrentProgress({ current, total, trackName });
      });
      setReport(result);
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsRunning(false);
      setCurrentProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-white/95 dark:bg-[#080d10]/95 border border-zinc-200 dark:border-white/10 shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/50 dark:bg-black/30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black tracking-widest text-[#02ABB0] uppercase font-mono">
                  REQUIREMENT 6
                </span>
                <span className="text-[10px] text-zinc-400">• Real Track Benchmark</span>
              </div>
              <h3 className="text-base font-extrabold text-black dark:text-white leading-none mt-0.5">
                X2 Audio Retrieval Diagnostic
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition active:scale-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
            <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#02ABB0]" />
              <span>Real Track Testing (Zero Mocks)</span>
            </div>
            <p>
              Tests a representative sample of Spotify tracks (commercial hits like The Weeknd and Miley Cyrus, alongside Creative Commons and public domain music). It executes genuine live queries and reports <strong>Search Success</strong>, <strong>Match Quality</strong>, <strong>Authorized Download Availability</strong>, and <strong>Import Success</strong> separately.
            </p>
          </div>

          {/* Running State */}
          {isRunning && currentProgress && (
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 text-center">
              <div className="flex items-center justify-center gap-2 font-bold text-black dark:text-white">
                <Loader2 className="w-4 h-4 animate-spin text-[#02ABB0]" />
                <span>Testing Track {currentProgress.current} of {currentProgress.total}</span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono truncate">
                {currentProgress.trackName}
              </p>
              <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#02ABB0] transition-all duration-300"
                  style={{ width: `${(currentProgress.current / currentProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Benchmark Results */}
          {report && (
            <div className="space-y-4">
              {/* Summary Metrics Grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Search Success</div>
                  <div className="text-base font-extrabold text-[#02ABB0] font-mono mt-0.5">
                    {report.searchSuccessRate}%
                  </div>
                </div>
                <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Avg Quality</div>
                  <div className="text-base font-extrabold text-black dark:text-white font-mono mt-0.5">
                    {report.avgMatchQuality}%
                  </div>
                </div>
                <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Authorized Stream</div>
                  <div className="text-base font-extrabold text-amber-500 font-mono mt-0.5">
                    {report.authorizedDownloadRate}%
                  </div>
                </div>
                <div className="p-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Import Verified</div>
                  <div className="text-base font-extrabold text-emerald-500 font-mono mt-0.5">
                    {report.importSuccessRate}%
                  </div>
                </div>
              </div>

              {/* Remaining Limitations Analysis */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-[11px] space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Documentation of Remaining Limitations</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Commercial Copyright Barrier:</strong> Major label commercial music (e.g. The Weeknd, Miley Cyrus) is legally protected and absent from open catalogs (Jamendo, Archive.org). In compliance with copyright law, X2 does not fabricate fake streams.
                </p>
                <p className="leading-relaxed">
                  To retrieve commercial tracks, use your <strong>Telegram Audio Hub</strong> (Musics Hunter model) or connect a <strong>self-hosted spotDL microservice</strong> in Settings.
                </p>
              </div>

              {/* Track-by-track breakdown */}
              <div className="space-y-2">
                <div className="font-bold text-black dark:text-white flex items-center justify-between">
                  <span>Track Breakdown & Live Match Scores</span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {report.results.length} Tested
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {report.results.map((r, idx) => {
                    const isExpanded = expandedIndex === idx;
                    return (
                      <div
                        key={r.track.id}
                        className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5 transition"
                      >
                        <div
                          onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                          className="flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-black dark:text-white truncate">
                              {r.track.title}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              {r.track.artist} • <span className="uppercase">{r.track.category.replace('_', ' ')}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {r.importSuccess ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                100% Imported
                              </span>
                            ) : r.searchSuccess ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                                {r.matchQuality}% Match
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 text-[10px] font-medium">
                                0 Match (Protected)
                              </span>
                            )}
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
                          </div>
                        </div>

                        {/* Diagnostics Details */}
                        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-1.5">
                          {r.diagnosticNotes}
                        </div>

                        {isExpanded && r.attempts && (
                          <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 space-y-1 text-[10px] font-mono">
                            <div className="text-zinc-400 font-sans font-bold">Provider Attempt History:</div>
                            {r.attempts.map((att, aIdx) => (
                              <div key={aIdx} className="flex justify-between items-center text-zinc-500">
                                <span>{att.providerName}</span>
                                <span>
                                  {att.status === 'matched' ? '✓ Hit' : att.status === 'skipped' ? '⊘ Skipped' : '✕ No match'}
                                  {att.latencyMs ? ` (${att.latencyMs}ms)` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between shrink-0 bg-zinc-50 dark:bg-black/20">
          <span>Real live queries • Zero synthetic responses</span>

          <div className="flex gap-2">
            <button
              onClick={handleStartBenchmark}
              disabled={isRunning}
              className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-extrabold text-xs active:scale-95 transition disabled:opacity-40 flex items-center gap-1.5"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#02ABB0]" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{report ? 'Rerun Benchmark' : 'Run Live Benchmark'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
