import React, { useState, useRef } from 'react';
import { Send, FolderPlus, Sparkles, Loader2, Database, UploadCloud } from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { SAMPLE_AUDIO_PRESETS, createToneAudioBlob } from '../../utils/sampleTracks';
import { saveTrack, savePlaylist, importLibraryBackup } from '../../services/db';
import { Track, Playlist } from '../../types/music';

interface OnboardingViewProps {
  onGoToSync: () => void;
  onTriggerFileInput: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onGoToSync, onTriggerFileInput }) => {
  const { refreshLibrary, showToast } = useMusic();
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [isRestoringDb, setIsRestoringDb] = useState(false);
  const dbFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLoadSampleBundle = async () => {
    setIsLoadingSamples(true);
    try {
      const generatedTrackIds: string[] = [];

      for (let i = 0; i < SAMPLE_AUDIO_PRESETS.length; i++) {
        const preset = SAMPLE_AUDIO_PRESETS[i];
        const audioBlob = createToneAudioBlob({
          frequency: preset.frequency,
          durationSeconds: preset.duration,
          type: preset.type,
        });

        const trackId = `sample_${Date.now()}_${i}`;
        generatedTrackIds.push(trackId);

        const track: Track = {
          id: trackId,
          title: preset.title,
          artist: preset.artist,
          album: preset.album,
          duration: preset.duration,
          fileSize: audioBlob.size,
          mimeType: 'audio/wav',
          fileName: `${preset.title}.wav`,
          downloadDate: Date.now() - (SAMPLE_AUDIO_PRESETS.length - i) * 60000,
          isFavorite: i === 0,
          playCount: 0,
          telegramSource: {
            chatTitle: 'Telegram Demo Vault',
            topicName: preset.topic,
            sourceType: 'sample',
          },
        };

        await saveTrack(track, audioBlob);
      }

      const samplePlaylist: Playlist = {
        id: `pl_sample_${Date.now()}`,
        name: 'Demo Playlist',
        description: 'Auto-generated playlist for testing offline playback',
        sourceType: 'telegram',
        telegramChatTitle: 'Telegram Demo Vault',
        telegramTopic: 'Demo Music',
        trackIds: generatedTrackIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await savePlaylist(samplePlaylist);

      await refreshLibrary();
      showToast('Loaded 3 offline sample tracks!');
    } catch (err) {
      console.error('Failed to load sample tracks:', err);
      showToast('Could not generate sample tracks');
    } finally {
      setIsLoadingSamples(false);
    }
  };

  const handleDbFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoringDb(true);
    try {
      const text = await file.text();
      const res = await importLibraryBackup(text);
      await refreshLibrary();
      showToast(
        `Database imported: ${res.tracksRestored} songs, ${res.playlistsRestored} playlists!`
      );
    } catch (err) {
      console.error('Failed to import database:', err);
      showToast('Invalid music database backup file');
    } finally {
      setIsRestoringDb(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 pt-notch pb-8 text-center max-w-md mx-auto my-auto space-y-5">
      {/* Hidden DB backup file input */}
      <input
        ref={dbFileInputRef}
        type="file"
        accept=".json,.btt,application/json"
        onChange={handleDbFileSelected}
        className="hidden"
      />

      {/* Official App Logo Crest */}
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-xl border-2 border-[var(--btt-accent)]/40 bg-[var(--btt-surface)] flex items-center justify-center">
          <img
            src="/app-logo.png"
            alt="btmu Logo"
            className="w-full h-full object-cover"
          />
        </div>
        <span className="absolute -bottom-1 -right-1 px-2.5 py-0.5 rounded-full bg-[var(--btt-accent)] text-black text-[10px] font-extrabold shadow-md font-mono">
          v1.8.0
        </span>
      </div>

      <div>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <span className="text-xs font-black tracking-widest uppercase text-[var(--btt-accent)] font-mono">
            btmu by Ahmed
          </span>
          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.2 rounded-md">
            iOS PWA
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white tracking-tight font-display">
          Personal Music Player for iPhone
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Zero subscriptions, zero tracking. Real offline playback, background audio, Telegram sync, and Smart Mix DJ crossfading.
        </p>
      </div>

      {/* 4 Upload & Music Source Options */}
      <div className="w-full space-y-2.5 text-left">
        {/* Option 1: Telegram Sync */}
        <button
          onClick={onGoToSync}
          className="w-full p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#024E5B]/15 border border-zinc-200 dark:border-[#02ABB0]/20 hover:border-[#02ABB0] transition flex items-center gap-3.5 group active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-[#035A69]/10 dark:bg-[#02ABB0]/15 text-[#02ABB0] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Send className="w-5 h-5 ml-0.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-black dark:text-white font-serif">
              1. Sync from Telegram
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
              Connect your Bot, channel, or topics to download audio directly to iPhone.
            </p>
          </div>
        </button>

        {/* Option 2: Local Audio Files */}
        <button
          onClick={onTriggerFileInput}
          className="w-full p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#024E5B]/15 border border-zinc-200 dark:border-[#02ABB0]/20 hover:border-[#02ABB0] transition flex items-center gap-3.5 group active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-[#035A69]/10 dark:bg-[#02ABB0]/15 text-[#02ABB0] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-black dark:text-white font-serif">
              2. Import Audio Files
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
              Choose MP3, M4A, AAC, or FLAC files from your iPhone Files or iCloud Drive.
            </p>
          </div>
        </button>

        {/* Option 3: Instant Demo Tracks */}
        <button
          onClick={handleLoadSampleBundle}
          disabled={isLoadingSamples}
          className="w-full p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#024E5B]/15 border border-zinc-200 dark:border-[#02ABB0]/20 hover:border-[#02ABB0] transition flex items-center gap-3.5 group active:scale-[0.99] disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-xl bg-[#035A69]/10 dark:bg-[#02ABB0]/15 text-[#02ABB0] flex items-center justify-center shrink-0">
            {isLoadingSamples ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-black dark:text-white font-serif">
              {isLoadingSamples ? 'Generating Sample Tracks...' : '3. Load Instant Demo Music Pack'}
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
              Test background playback, lock-screen controls, and playlists right away!
            </p>
          </div>
        </button>

        {/* Option 4: New Fourth Option — Import Music Database from Files App */}
        <button
          onClick={() => dbFileInputRef.current?.click()}
          disabled={isRestoringDb}
          className="w-full p-3.5 rounded-2xl bg-zinc-50 dark:bg-[#024E5B]/20 border border-[#02ABB0]/40 hover:border-[#02ABB0] transition flex items-center gap-3.5 group active:scale-[0.99] disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-xl bg-[#02ABB0] text-black flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md shadow-[#02ABB0]/20">
            {isRestoringDb ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Database className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-black dark:text-white font-serif">
                {isRestoringDb ? 'Restoring Music Database...' : '4. Restore Database from Files App'}
              </h4>
              <span className="px-1.5 py-0.2 rounded-full bg-[#02ABB0] text-black text-[9px] font-black uppercase">
                New
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
              Import a complete music DB backup (.btt / .json) shared from another device.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};
