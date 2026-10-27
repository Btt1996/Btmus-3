import React, { useState } from 'react';
import {
  X,
  Server,
  Terminal,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Cpu,
  HelpCircle,
  FileText,
  Lock,
  Radio,
  Zap,
} from 'lucide-react';
import { checkSpotDLBridgeStatus, SpotDLBridgeStatus } from '../../services/playlistImport/spotdlBridge';

interface SpotDLInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  bridgeUrl: string;
  onSaveBridgeUrl: (url: string) => void;
}

export const SpotDLInfoModal: React.FC<SpotDLInfoModalProps> = ({
  isOpen,
  onClose,
  bridgeUrl,
  onSaveBridgeUrl,
}) => {
  const [urlInput, setUrlInput] = useState(bridgeUrl || '');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<SpotDLBridgeStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'evaluation' | 'hosting' | 'connect'>('evaluation');

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await checkSpotDLBridgeStatus(urlInput.trim());
      setStatus(res);
      if (res.isOnline) {
        onSaveBridgeUrl(urlInput.trim());
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-white/95 dark:bg-[#080d10]/95 border border-zinc-200 dark:border-white/10 shadow-[0_20px_60px_0_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/50 dark:bg-black/30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black tracking-widest text-[#02ABB0] uppercase font-mono">
                  X2 EVALUATION
                </span>
                <span className="text-[10px] text-zinc-400">• spotDL Investigation</span>
              </div>
              <h3 className="text-base font-extrabold text-black dark:text-white leading-none mt-0.5">
                spotDL Architecture & Feasibility
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

        {/* Tab switcher */}
        <div className="flex border-b border-zinc-200 dark:border-white/10 px-4 pt-2 gap-2 text-xs font-bold bg-zinc-50 dark:bg-black/20 shrink-0">
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`pb-2.5 px-2 border-b-2 transition ${
              activeTab === 'evaluation'
                ? 'border-[#02ABB0] text-[#02ABB0]'
                : 'border-transparent text-zinc-400 hover:text-black dark:hover:text-white'
            }`}
          >
            6-Point Evaluation
          </button>
          <button
            onClick={() => setActiveTab('hosting')}
            className={`pb-2.5 px-2 border-b-2 transition ${
              activeTab === 'hosting'
                ? 'border-[#02ABB0] text-[#02ABB0]'
                : 'border-transparent text-zinc-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Lowest-Cost Hosting
          </button>
          <button
            onClick={() => setActiveTab('connect')}
            className={`pb-2.5 px-2 border-b-2 transition ${
              activeTab === 'connect'
                ? 'border-[#02ABB0] text-[#02ABB0]'
                : 'border-transparent text-zinc-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Bridge Connection
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* TAB 1: 6-POINT EVALUATION OF spotDL */}
          {activeTab === 'evaluation' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Executive Technical Verdict</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  <strong>spotDL cannot run inside Safari or client-side JavaScript.</strong> It is a Python command-line utility requiring external binaries (FFmpeg & yt-dlp). The GitHub repository hosts source code, not a public cloud service.
                </p>
              </div>

              {/* Six Key Evaluation Points */}
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center text-[10px]">1</span>
                    <span>Can it handle extracted Spotify tracks?</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5.5">
                    <strong>Yes.</strong> spotDL accepts Spotify track, album, and playlist URLs or queries (Title, Artist, Duration, ISRC). It parses metadata via Spotify Web API or embed scrapers.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center text-[10px]">2</span>
                    <span>Actual supported audio sources</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5.5">
                    <strong>YouTube Music, YouTube, SoundCloud, and Bandcamp.</strong> spotDL does <em>not</em> download from Spotify directly because Spotify streams are protected with FairPlay/Widevine DRM.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center text-[10px]">3</span>
                    <span>Is a separate Python service required?</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5.5">
                    <strong>Yes, strictly required.</strong> Python 3.8+ and the spotDL package must run on an external machine. Browser JavaScript (Safari) has no native process spawning or FFmpeg audio encoding capabilities.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center text-[10px]">4</span>
                    <span>How to retrieve resulting audio files</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5.5">
                    When executed, spotDL writes an MP3/M4A file with tagged album art to the server's disk. A microservice wrapper (such as FastAPI or Express) streams the file back as an HTTP download blob into IndexedDB.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center text-[10px]">5</span>
                    <span>Hosting and dependencies</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5.5">
                    Requires Python, `spotdl`, and FFmpeg installed in system PATH. Note: Public cloud server IPs (AWS/GCP) are frequently IP-blocked by YouTube scrapers, requiring residential proxies or local home network execution.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#02ABB0]/20 text-[#02ABB0] flex items-center justify-center text-[10px]">6</span>
                    <span>Are the intended downloads authorized?</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 pl-5.5">
                    <strong>No for commercial tracks.</strong> Ripping commercial songs from YouTube violates both YouTube's Terms of Service and Spotify's Terms. Legally authorized audio is only available for Creative Commons, public domain, or user-owned audio synchronized via personal Telegram storage.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LOWEST-COST HOSTING & IPHONE COMPATIBILITY */}
          {activeTab === 'hosting' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-[11px] leading-relaxed">
                As an iPhone user, you need a solution with <strong>lowest cost</strong> and <strong>zero maintenance</strong>. Here are the practical deployment options:
              </div>

              <div className="space-y-2">
                <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-black dark:text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#02ABB0]" /> 1. Telegram Sync Hub (Musics Hunter Model)
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold text-[10px]">
                      Recommended • Free
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Uses Telegram bot/cloud storage as an audio synchronizer. You can forward music files or bot links directly to your private bot or channel; Btt Music downloads and stores them offline in IndexedDB with 0 server costs.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-black dark:text-white flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-cyan-500" /> 2. Home PC / Mac / Raspberry Pi Docker
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-500 font-bold text-[10px]">
                      100% Free
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-mono text-[10px]">
                    docker run -d -p 8080:8080 spotdl-bridge
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Runs on your home Wi-Fi network. iPhone connects to `http://192.168.1.X:8080`. Immune to YouTube cloud IP blocks.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-black dark:text-white flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-purple-400" /> 3. Free Hugging Face Docker Space
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-bold text-[10px]">
                      Free Tier
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    A free public Docker Space with Python 3.10 and FFmpeg. Enter your space URL in the Bridge Connection tab.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONNECT & TEST USER BRIDGE */}
          {activeTab === 'connect' && (
            <div className="space-y-3.5">
              <p className="text-zinc-500 text-[11px]">
                If you have deployed a spotDL HTTP bridge microservice, enter its URL below to connect it to the X2 pipeline.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#02ABB0]" />
                  Custom spotDL Bridge URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="http://192.168.1.10:8080 or https://..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs text-black dark:text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#02ABB0]"
                  />
                  <button
                    onClick={handleTest}
                    disabled={testing || !urlInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition disabled:opacity-40 active:scale-95 shrink-0"
                  >
                    {testing ? 'Probing...' : 'Test & Save'}
                  </button>
                </div>

                {status && (
                  <div
                    className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                      status.isOnline
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {status.isOnline ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Connected: {status.version}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{status.errorMessage}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between shrink-0 bg-zinc-50 dark:bg-black/20">
          <span>Official spotDL GitHub Evaluation</span>
          <button
            onClick={() => {
              if (urlInput.trim()) onSaveBridgeUrl(urlInput.trim());
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-[#02ABB0] text-black font-extrabold text-xs active:scale-95 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
