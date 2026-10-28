import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  Track,
  Playlist,
  PlayerState,
  RepeatMode,
  AppSettings,
  TrackAnalysis,
  SmartMixConfig,
  CrossfadePreset,
} from '../types/music';
import * as db from '../services/db';
import { analyzeTrackAudio, optimizePlaylistOrder } from '../services/audioAnalysis';

interface StorageStats {
  usedBytes: number;
  quotaBytes: number;
  trackCount: number;
  trackBytes: number;
}

interface MusicContextType {
  tracks: Track[];
  playlists: Playlist[];
  playerState: PlayerState;
  storageStats: StorageStats;
  isFullScreenPlayerOpen: boolean;
  settings: AppSettings;
  toastMessage: string | null;
  trackAnalyses: Record<string, TrackAnalysis>;
  refreshLibrary: () => Promise<void>;
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  setVolume: (val: number) => void;
  setVolumeBooster: (multiplier: number) => void;
  toggleVolumeBooster: (enabled?: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  toggleFavorite: (trackId: string) => Promise<void>;
  deleteTrack: (trackId: string) => Promise<void>;
  deleteTracks: (trackIds: string[]) => Promise<void>;
  createPlaylist: (name: string, description?: string, trackIds?: string[]) => Promise<Playlist>;
  updatePlaylist: (playlist: Playlist) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, newTrackIds: string[]) => Promise<void>;
  addToQueue: (track: Track) => void;
  playNextInQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  setIsFullScreenPlayerOpen: (open: boolean) => void;
  showToast: (msg: string) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  updateSmartMixConfig: (config: Partial<SmartMixConfig>) => Promise<void>;
  analyzeTrackById: (trackId: string) => Promise<TrackAnalysis | null>;
  batchAnalyzeTracks: (trackIds?: string[]) => Promise<void>;
  optimizePlaylistHarmonically: (playlistId: string) => Promise<{
    optimizedTrackIds: string[];
    averageScore: number;
  } | null>;
}

const MusicContext = createContext<MusicContextType | null>(null);

const DEFAULT_SMART_MIX: SmartMixConfig = {
  enabled: true,
  preset: 'balanced',
  duration: 6,
  style: 'smooth',
  trimSilence: true,
  useHarmonicMixing: true,
};

const DEFAULT_SETTINGS: AppSettings = {
  defaultShuffle: false,
  defaultRepeat: 'off',
  rememberPosition: true,
  defaultPlaybackRate: 1.0,
  telegramBotToken: '',
  autoCreatePlaylists: true,
  skipDuplicates: true,
  smartMix: DEFAULT_SMART_MIX,
  volumeBooster: 1.0,
  isBoosterActive: false,
};

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trackAnalyses, setTrackAnalyses] = useState<Record<string, TrackAnalysis>>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [storageStats, setStorageStats] = useState<StorageStats>({
    usedBytes: 0,
    quotaBytes: 0,
    trackCount: 0,
    trackBytes: 0,
  });

  const [isFullScreenPlayerOpen, setIsFullScreenPlayerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Player State
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1.0,
    repeatMode: 'off',
    isShuffle: false,
    queue: [],
    queueIndex: -1,
    error: null,
    smartMixConfig: DEFAULT_SMART_MIX,
    isSmartMixBlending: false,
    activeAnalysis: null,
    isAnalyzing: false,
    analysisProgress: null,
    volumeBooster: 1.0,
    isBoosterActive: false,
  });

  // Dual-Deck Audio Architecture
  // Deck A is the rock-solid primary deck that retains iOS background media authorization.
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');

  const activeUrlARef = useRef<string | null>(null);
  const activeUrlBRef = useRef<string | null>(null);

  // Stable References for iOS Lock Screen & Remote Command Handlers
  // This solves stale closures when phone is locked.
  const playerStateRef = useRef<PlayerState>(playerState);
  playerStateRef.current = playerState;

  const nextTrackRef = useRef<() => void>(() => {});
  const prevTrackRef = useRef<() => void>(() => {});
  const togglePlayPauseRef = useRef<() => void>(() => {});
  const seekToRef = useRef<(seconds: number) => void>(() => {});
  const playTrackRef = useRef<(track: Track, newQueue?: Track[]) => Promise<void>>((() => Promise.resolve()) as any);

  // Crossfade timer
  const crossfadeTimerRef = useRef<number | null>(null);
  const isCrossfadingRef = useRef(false);
  const originalQueueRef = useRef<Track[]>([]);

  // Web Audio for iOS In-App Volume & 3x Booster
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const deckGainARef = useRef<GainNode | null>(null);
  const deckGainBRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const isWebAudioSetupRef = useRef(false);

  // Pre-cached ObjectURLs for instantaneous lock-screen AirPod next/previous track switching
  const preloadedUrlsRef = useRef<Map<string, string>>(new Map());

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  }, []);

  // Initialize or resume Web Audio Graph
  const ensureWebAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const masterGain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        
        // Studio-grade zero-clipping limiter settings
        compressor.threshold.setValueAtTime(-10, ctx.currentTime);
        compressor.knee.setValueAtTime(24, ctx.currentTime);
        compressor.ratio.setValueAtTime(12, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);

        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
        masterGainRef.current = masterGain;
        compressorRef.current = compressor;

        if (deckARef.current && !deckGainARef.current) {
          try {
            const srcA = ctx.createMediaElementSource(deckARef.current);
            const gainA = ctx.createGain();
            gainA.gain.setValueAtTime(1.0, ctx.currentTime);
            srcA.connect(gainA);
            gainA.connect(masterGain);
            deckGainARef.current = gainA;
          } catch (e) {
            console.warn('Could not connect deckA to WebAudio:', e);
          }
        }

        if (deckBRef.current && !deckGainBRef.current) {
          try {
            const srcB = ctx.createMediaElementSource(deckBRef.current);
            const gainB = ctx.createGain();
            gainB.gain.setValueAtTime(0.0, ctx.currentTime);
            srcB.connect(gainB);
            gainB.connect(masterGain);
            deckGainBRef.current = gainB;
          } catch (e) {
            console.warn('Could not connect deckB to WebAudio:', e);
          }
        }

        isWebAudioSetupRef.current = true;
      }

      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(console.warn);
      }
    } catch (e) {
      console.warn('Web Audio init exception:', e);
    }
  }, []);

  // Calculate and apply gain to master Web Audio node
  const applyMasterGain = useCallback(
    (vol?: number, booster?: number, isBooster?: boolean, muted?: boolean) => {
      if (!masterGainRef.current || !audioCtxRef.current) return;
      const v = vol !== undefined ? vol : playerStateRef.current.volume;
      const b = booster !== undefined ? booster : playerStateRef.current.volumeBooster;
      const active = isBooster !== undefined ? isBooster : playerStateRef.current.isBoosterActive;
      const isM = muted !== undefined ? muted : playerStateRef.current.isMuted;

      const effectiveMultiplier = active ? Math.max(1.0, Math.min(3.0, b)) : 1.0;
      const targetGain = isM ? 0 : v * effectiveMultiplier;

      try {
        const now = audioCtxRef.current.currentTime;
        masterGainRef.current.gain.cancelScheduledValues(now);
        masterGainRef.current.gain.setTargetAtTime(targetGain, now, 0.02);
      } catch (e) {
        console.warn('Error setting master gain:', e);
      }
    },
    []
  );

  // Initialize Audio Elements
  useEffect(() => {
    const deckA = new Audio();
    const deckB = new Audio();

    deckA.preload = 'auto';
    deckB.preload = 'auto';

    deckARef.current = deckA;
    deckBRef.current = deckB;

    const attachDeckListeners = (deck: HTMLAudioElement, deckId: 'A' | 'B') => {
      const handleTimeUpdate = () => {
        // Only the actively designated deck feeds the UI scrubber to avoid sync jump during crossfades
        if (activeDeckRef.current !== deckId) return;

        const dur = deck.duration && !isNaN(deck.duration) && isFinite(deck.duration) ? deck.duration : 0;
        setPlayerState((prev) => ({
          ...prev,
          currentTime: deck.currentTime,
          duration: dur > 0 ? dur : prev.duration,
        }));

        updateMediaSessionPosition(deck);
      };

      const handleLoadedMetadata = () => {
        if (activeDeckRef.current === deckId) {
          const dur = deck.duration && !isNaN(deck.duration) && isFinite(deck.duration) ? deck.duration : 0;
          setPlayerState((prev) => ({
            ...prev,
            isLoading: false,
            duration: dur > 0 ? dur : prev.duration,
          }));
        }
      };

      const handleWaiting = () => {
        if (activeDeckRef.current === deckId) {
          setPlayerState((prev) => ({ ...prev, isLoading: true }));
        }
      };

      const handleCanPlay = () => {
        if (activeDeckRef.current === deckId) {
          setPlayerState((prev) => ({ ...prev, isLoading: false }));
        }
      };

      const handlePlay = () => {
        if (activeDeckRef.current === deckId) {
          setPlayerState((prev) => ({ ...prev, isPlaying: true }));
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        }
      };

      const handlePause = () => {
        if (activeDeckRef.current === deckId && !isCrossfadingRef.current) {
          setPlayerState((prev) => ({ ...prev, isPlaying: false }));
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        }
      };

      const handleError = () => {
        if (activeDeckRef.current === deckId) {
          console.warn('Audio playback error on deck', deckId, deck.error);
          setPlayerState((prev) => ({
            ...prev,
            isPlaying: false,
            isLoading: false,
            error: 'Playback error or unsupported format',
          }));
        }
      };

      const handleEnded = () => {
        // Never trigger next track if crossfading or if not active deck!
        if (isCrossfadingRef.current || activeDeckRef.current !== deckId) {
          return;
        }
        nextTrackRef.current();
      };

      deck.addEventListener('timeupdate', handleTimeUpdate);
      deck.addEventListener('loadedmetadata', handleLoadedMetadata);
      deck.addEventListener('waiting', handleWaiting);
      deck.addEventListener('canplay', handleCanPlay);
      deck.addEventListener('play', handlePlay);
      deck.addEventListener('pause', handlePause);
      deck.addEventListener('error', handleError);
      deck.addEventListener('ended', handleEnded);

      return () => {
        deck.removeEventListener('timeupdate', handleTimeUpdate);
        deck.removeEventListener('loadedmetadata', handleLoadedMetadata);
        deck.removeEventListener('waiting', handleWaiting);
        deck.removeEventListener('canplay', handleCanPlay);
        deck.removeEventListener('play', handlePlay);
        deck.removeEventListener('pause', handlePause);
        deck.removeEventListener('error', handleError);
        deck.removeEventListener('ended', handleEnded);
      };
    };

    const cleanupA = attachDeckListeners(deckA, 'A');
    const cleanupB = attachDeckListeners(deckB, 'B');

    // iOS PWA Background Resilience:
    // When returning from background or lock screen, resume Web Audio if suspended and resync
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(console.warn);
        }
        const activeDeck = activeDeckRef.current === 'A' ? deckA : deckB;
        if (activeDeck && !activeDeck.paused) {
          updateMediaSessionPosition(activeDeck);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanupA();
      cleanupB();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      deckA.pause();
      deckB.pause();
      if (activeUrlARef.current) URL.revokeObjectURL(activeUrlARef.current);
      if (activeUrlBRef.current) URL.revokeObjectURL(activeUrlBRef.current);
      preloadedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      preloadedUrlsRef.current.clear();
      if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
    };
  }, []);

  // Media Session Setup
  // IPHONE LOCK SCREEN CONTROLS REQUIREMENT:
  // Show Next (⏭) and Previous (⏮) controls on iPhone lock screen / screen off, NOT +10 and -10.
  // In iOS WebKit/Safari, registering 'seekbackward' or 'seekforward' forces iOS to display
  // +10 and -10 skip buttons instead of track skip buttons.
  // We explicitly clear seekbackward and seekforward to null, and use mutable refs for action
  // handlers so lock-screen interactions always invoke the freshest queue logic.
  const setupMediaSession = useCallback((track: Track) => {
    if (!('mediaSession' in navigator)) return;

    const artwork = track.artworkUrl
      ? [{ src: track.artworkUrl, sizes: '512x512', type: 'image/png' }]
      : [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'Btt Music',
      artwork,
    });

    navigator.mediaSession.playbackState = 'playing';

    // Stable Ref Delegation for Lock Screen Actions
    navigator.mediaSession.setActionHandler('play', () => {
      const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (activeDeck && activeDeck.paused) {
        activeDeck.play().catch(console.warn);
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      activeDeck?.pause();
    });

    // CRITICAL iOS Lock Screen Requirement:
    // When seekbackward or seekforward are registered, iOS replaces ⏭ and ⏮ with 10s skip buttons.
    // Explicitly setting them to null forces iOS to display the native Previous (⏮) and Next (⏭) controls!
    try {
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
    } catch {
      // ignore
    }

    // Previous Track on Lock Screen & AirPods
    try {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        prevTrackRef.current();
      });
    } catch {
      // ignore
    }

    // Next Track on Lock Screen & AirPods
    try {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        nextTrackRef.current();
      });
    } catch {
      // ignore
    }

    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seekToRef.current(details.seekTime);
        }
      });
    } catch {
      // ignore
    }
  }, []);

  const updateMediaSessionPosition = (audio: HTMLAudioElement) => {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(audio.currentTime, audio.duration),
          });
        } catch {
          // ignore transient edge cases
        }
      }
    }
  };

  // Preload next and previous tracks into memory ObjectURLs for instant AirPod skipping
  const preloadQueueTracks = useCallback(async (currentIndex: number, queue: Track[]) => {
    if (!queue || queue.length === 0) return;
    const indicesToPreload: number[] = [];
    if (currentIndex + 1 < queue.length) indicesToPreload.push(currentIndex + 1);
    else if (queue.length > 1) indicesToPreload.push(0); // loop
    if (currentIndex - 1 >= 0) indicesToPreload.push(currentIndex - 1);

    const neededIds = new Set(indicesToPreload.map((i) => queue[i]?.id).filter(Boolean));
    if (queue[currentIndex]?.id) neededIds.add(queue[currentIndex].id);

    // Evict old URLs not in needed set to prevent memory leaks
    for (const [id, url] of preloadedUrlsRef.current.entries()) {
      if (!neededIds.has(id)) {
        URL.revokeObjectURL(url);
        preloadedUrlsRef.current.delete(id);
      }
    }

    // Preload next & prev tracks into memory
    for (const idx of indicesToPreload) {
      const track = queue[idx];
      if (!track || preloadedUrlsRef.current.has(track.id)) continue;
      try {
        const blob = await db.getAudioBlob(track.id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          preloadedUrlsRef.current.set(track.id, url);
        }
      } catch (err) {
        console.warn('Preload audio error for', track.id, err);
      }
    }
  }, []);

  // Play a specific track
  const playTrack = useCallback(
    async (track: Track, newQueue?: Track[]) => {
      // Abort any ongoing crossfade immediately
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
        isCrossfadingRef.current = false;
      }

      ensureWebAudio();
      applyMasterGain();

      // Prime Deck B on user gesture so iOS allows Smart Mix to play Deck B without gesture
      if (deckBRef.current && !deckBRef.current.dataset.primed) {
        deckBRef.current.dataset.primed = 'true';
        deckBRef.current.muted = true;
        deckBRef.current.play().then(() => {
          deckBRef.current?.pause();
          if (deckBRef.current) deckBRef.current.muted = false;
        }).catch(() => {});
      }

      // Anchor standard playback onto Deck A
      activeDeckRef.current = 'A';
      const activeDeck = deckARef.current;
      const inactiveDeck = deckBRef.current;

      if (!activeDeck) return;
      if (inactiveDeck) {
        inactiveDeck.pause();
        inactiveDeck.currentTime = 0;
      }

      // Reset individual deck gains
      if (deckGainARef.current && audioCtxRef.current) {
        deckGainARef.current.gain.setValueAtTime(1.0, audioCtxRef.current.currentTime);
      }
      if (deckGainBRef.current && audioCtxRef.current) {
        deckGainBRef.current.gain.setValueAtTime(0.0, audioCtxRef.current.currentTime);
      }

      setPlayerState((prev) => ({
        ...prev,
        isLoading: true,
        isSmartMixBlending: false,
        error: null,
      }));

      try {
        let objectUrl = preloadedUrlsRef.current.get(track.id) || null;
        if (!objectUrl) {
          if (track.previewUrl) {
            objectUrl = track.previewUrl;
          } else {
            const blob = await db.getAudioBlob(track.id);
            if (!blob) {
              throw new Error('Audio file is missing from offline storage.');
            }
            objectUrl = URL.createObjectURL(blob);
            preloadedUrlsRef.current.set(track.id, objectUrl);
          }
        }

        // Revoke prior ObjectURL on Deck A if different
        if (activeUrlARef.current && activeUrlARef.current !== objectUrl) {
          // keep managed by preloadedUrlsRef
        }
        activeUrlARef.current = objectUrl;
        activeDeck.src = objectUrl;

        const currentVol = playerStateRef.current.isMuted ? 0 : playerStateRef.current.volume;
        activeDeck.volume = currentVol;
        activeDeck.playbackRate = playerStateRef.current.playbackRate;
        activeDeck.currentTime = 0;

        await activeDeck.play();

        // Increment play count & update last played
        const updatedTrack: Track = {
          ...track,
          playCount: (track.playCount || 0) + 1,
          lastPlayedAt: Date.now(),
        };
        try {
          await db.updateTrackMetadata(updatedTrack);
        } catch {
          // Might not be in local db yet (e.g. streaming preview)
        }
        setTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));

        // Determine queue
        let finalQueue = playerStateRef.current.queue;
        let finalIndex = 0;

        if (newQueue && newQueue.length > 0) {
          originalQueueRef.current = newQueue;
          finalQueue = playerStateRef.current.isShuffle ? shuffleArray([...newQueue], updatedTrack) : newQueue;
          finalIndex = finalQueue.findIndex((t) => t.id === track.id);
        } else if (playerStateRef.current.queue.length > 0) {
          finalIndex = playerStateRef.current.queue.findIndex((t) => t.id === track.id);
          if (finalIndex === -1) {
            finalQueue = [...playerStateRef.current.queue, updatedTrack];
            finalIndex = finalQueue.length - 1;
          }
        } else {
          finalQueue = [updatedTrack];
          finalIndex = 0;
        }

        const analysis = trackAnalyses[track.id] || null;

        setPlayerState((prev) => ({
          ...prev,
          currentTrack: updatedTrack,
          isPlaying: true,
          isLoading: false,
          currentTime: 0,
          duration: track.duration || 0,
          queue: finalQueue,
          queueIndex: finalIndex >= 0 ? finalIndex : 0,
          activeAnalysis: analysis,
          error: null,
        }));

        setupMediaSession(updatedTrack);
        preloadQueueTracks(finalIndex >= 0 ? finalIndex : 0, finalQueue);

        // Auto-analyze track in background if not already analyzed
        if (!analysis) {
          db.getAudioBlob(track.id).then((blob) => {
            if (blob) {
              analyzeTrackAudio(blob, track.id)
                .then(async (result) => {
                  await db.saveTrackAnalysis(result);
                  setTrackAnalyses((prev) => ({ ...prev, [track.id]: result }));
                  setPlayerState((prev) =>
                    prev.currentTrack?.id === track.id ? { ...prev, activeAnalysis: result } : prev
                  );
                })
                .catch(() => {});
            }
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to play audio';
        console.error('Play track failed:', err);
        setPlayerState((prev) => ({
          ...prev,
          isLoading: false,
          isPlaying: false,
          error: msg,
        }));
        showToast(msg);
      }
    },
    [applyMasterGain, ensureWebAudio, preloadQueueTracks, setupMediaSession, showToast, trackAnalyses]
  );

  playTrackRef.current = playTrack;

  // Next Track with Instant Synchronous Execution for AirPods / Lock Screen Double-Tap
  const nextTrack = useCallback(() => {
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
      isCrossfadingRef.current = false;
    }

    const { queue, queueIndex, repeatMode } = playerStateRef.current;
    if (queue.length === 0) return;

    ensureWebAudio();

    const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
    if (!activeDeck) return;

    if (repeatMode === 'one') {
      activeDeck.currentTime = 0;
      activeDeck.play().catch(console.warn);
      return;
    }

    const nextIndex = queueIndex + 1;
    let nextTrackToPlay: Track | null = null;
    let finalIdx = nextIndex;

    if (nextIndex < queue.length) {
      nextTrackToPlay = queue[nextIndex];
    } else if (repeatMode === 'all') {
      nextTrackToPlay = queue[0];
      finalIdx = 0;
    } else {
      // End of queue reached
      activeDeck.pause();
      activeDeck.currentTime = 0;
      setPlayerState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      return;
    }

    if (!nextTrackToPlay) return;

    // Synchronous execution for AirPods / Lock Screen:
    const cachedUrl = preloadedUrlsRef.current.get(nextTrackToPlay.id);
    if (cachedUrl) {
      activeDeck.src = cachedUrl;
      activeDeck.currentTime = 0;
      activeDeck.playbackRate = playerStateRef.current.playbackRate;
      activeDeck.play().catch(console.warn);

      const targetTrack = nextTrackToPlay;
      setPlayerState((prev) => ({
        ...prev,
        currentTrack: targetTrack,
        queueIndex: finalIdx,
        isPlaying: true,
        isLoading: false,
        currentTime: 0,
        duration: targetTrack.duration || 0,
        activeAnalysis: trackAnalyses[targetTrack.id] || null,
        error: null,
      }));

      setupMediaSession(targetTrack);
      applyMasterGain();

      db.updateTrackMetadata({
        ...targetTrack,
        playCount: (targetTrack.playCount || 0) + 1,
        lastPlayedAt: Date.now(),
      }).catch(() => {});

      preloadQueueTracks(finalIdx, queue);
      return;
    }

    // Fallback if not yet in cache
    playTrackRef.current(nextTrackToPlay);
  }, [applyMasterGain, ensureWebAudio, preloadQueueTracks, setupMediaSession, trackAnalyses]);

  nextTrackRef.current = nextTrack;

  // Previous Track with Instant Synchronous Execution for AirPods / Lock Screen Triple-Tap
  const prevTrack = useCallback(() => {
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
      isCrossfadingRef.current = false;
    }

    ensureWebAudio();

    const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
    if (!activeDeck) return;

    // Standard player behavior: If >3 seconds into song, triple tap restarts track
    if (activeDeck.currentTime > 3) {
      activeDeck.currentTime = 0;
      activeDeck.play().catch(console.warn);
      return;
    }

    const { queue, queueIndex } = playerStateRef.current;
    if (queue.length === 0) return;

    const prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      activeDeck.currentTime = 0;
      activeDeck.play().catch(console.warn);
      return;
    }

    const prevTrackToPlay = queue[prevIndex];
    const cachedUrl = preloadedUrlsRef.current.get(prevTrackToPlay.id);
    if (cachedUrl) {
      activeDeck.src = cachedUrl;
      activeDeck.currentTime = 0;
      activeDeck.playbackRate = playerStateRef.current.playbackRate;
      activeDeck.play().catch(console.warn);

      setPlayerState((prev) => ({
        ...prev,
        currentTrack: prevTrackToPlay,
        queueIndex: prevIndex,
        isPlaying: true,
        isLoading: false,
        currentTime: 0,
        duration: prevTrackToPlay.duration || 0,
        activeAnalysis: trackAnalyses[prevTrackToPlay.id] || null,
        error: null,
      }));

      setupMediaSession(prevTrackToPlay);
      applyMasterGain();

      preloadQueueTracks(prevIndex, queue);
      return;
    }

    playTrackRef.current(prevTrackToPlay);
  }, [applyMasterGain, ensureWebAudio, preloadQueueTracks, setupMediaSession, trackAnalyses]);

  prevTrackRef.current = prevTrack;

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    ensureWebAudio();
    applyMasterGain();

    const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
    if (!activeDeck) return;

    if (!playerStateRef.current.currentTrack) {
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
      }
      return;
    }

    if (playerStateRef.current.isPlaying) {
      activeDeck.pause();
    } else {
      activeDeck.play().catch((err) => {
        console.warn('Audio resume error:', err);
        showToast('Could not resume audio');
      });
    }
  }, [applyMasterGain, ensureWebAudio, playTrack, showToast, tracks]);

  togglePlayPauseRef.current = togglePlayPause;

  // Seeking
  const seekTo = useCallback((seconds: number) => {
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
      isCrossfadingRef.current = false;
    }

    const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
    if (activeDeck && isFinite(seconds) && !isNaN(seconds)) {
      const clamped = Math.max(0, Math.min(seconds, activeDeck.duration || 9999));
      activeDeck.currentTime = clamped;
      setPlayerState((prev) => ({
        ...prev,
        currentTime: clamped,
        isSmartMixBlending: false,
      }));
      updateMediaSessionPosition(activeDeck);
    }
  }, []);

  seekToRef.current = seekTo;

  // Playback Rate
  const setPlaybackRate = useCallback(
    (rate: number) => {
      const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      const clamped = Math.max(0.5, Math.min(2.0, rate));
      if (activeDeck) {
        activeDeck.playbackRate = clamped;
      }
      setPlayerState((prev) => ({ ...prev, playbackRate: clamped }));
      showToast(`Playback speed: ${clamped}x`);
    },
    [showToast]
  );

  // Load Library & Analyses
  const refreshLibrary = useCallback(async () => {
    try {
      const [
        allTracks,
        allPlaylists,
        savedSettings,
        stats,
        analyses,
        savedBooster,
        savedBoosterActive,
      ] = await Promise.all([
        db.getAllTracks(),
        db.getAllPlaylists(),
        db.getSetting<AppSettings>('app_settings', DEFAULT_SETTINGS),
        db.getStorageEstimate(),
        db.getAllTrackAnalyses(),
        db.getSetting<number>('app_volume_booster', 1.0),
        db.getSetting<boolean>('app_is_booster_active', false),
      ]);

      setTracks(allTracks);
      setPlaylists(allPlaylists);
      setSettings(savedSettings);
      setStorageStats(stats);
      setTrackAnalyses(analyses);

      const effectiveBooster = savedBooster || savedSettings.volumeBooster || 1.0;
      const effectiveBoosterActive = savedBoosterActive ?? savedSettings.isBoosterActive ?? false;

      setPlayerState((prev) => ({
        ...prev,
        repeatMode: savedSettings.defaultRepeat || 'off',
        isShuffle: savedSettings.defaultShuffle || false,
        playbackRate: savedSettings.defaultPlaybackRate || 1.0,
        smartMixConfig: savedSettings.smartMix || DEFAULT_SMART_MIX,
        volumeBooster: effectiveBooster,
        isBoosterActive: effectiveBoosterActive,
      }));

      applyMasterGain(undefined, effectiveBooster, effectiveBoosterActive);
    } catch (err) {
      console.error('Error loading library from IndexedDB:', err);
      showToast('Error loading local music library.');
    }
  }, [applyMasterGain, showToast]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // BTT SMART MIX DUAL-DECK CROSSFADE MONITOR (Continuous Harmonic Handoff)
  useEffect(() => {
    const { isPlaying, currentTime, duration, smartMixConfig, queue, queueIndex, repeatMode } =
      playerState;

    // If app is hidden (screen locked or in background), do not run multi-step setInterval crossfade
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }

    if (!isPlaying || !smartMixConfig.enabled || isCrossfadingRef.current || duration <= 10) return;
    if (repeatMode === 'one') return;

    const crossfadeDuration = smartMixConfig.duration;
    const currentTrackId = playerState.currentTrack?.id;
    const currentAnalysis = currentTrackId ? trackAnalyses[currentTrackId] : null;

    const outroSilence = smartMixConfig.trimSilence && currentAnalysis ? currentAnalysis.outroSilenceDuration : 0;
    const triggerTime = Math.max(0, duration - crossfadeDuration - outroSilence);

    if (currentTime >= triggerTime && currentTime < duration - 0.5) {
      let nextTrackToPlay: Track | null = null;
      let nextIdx = queueIndex + 1;
      if (nextIdx < queue.length) {
        nextTrackToPlay = queue[nextIdx];
      } else if (repeatMode === 'all' && queue.length > 0) {
        nextTrackToPlay = queue[0];
        nextIdx = 0;
      }

      if (!nextTrackToPlay) return;

      isCrossfadingRef.current = true;
      setPlayerState((prev) => ({ ...prev, isSmartMixBlending: true }));

      const currentDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      const standbyDeck = activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
      const standbyDeckId: 'A' | 'B' = activeDeckRef.current === 'A' ? 'B' : 'A';
      const currentDeckGain = activeDeckRef.current === 'A' ? deckGainARef.current : deckGainBRef.current;
      const standbyDeckGain = activeDeckRef.current === 'A' ? deckGainBRef.current : deckGainARef.current;

      if (!currentDeck || !standbyDeck) return;

      const resolveBlob = async () => {
        const cached = preloadedUrlsRef.current.get(nextTrackToPlay!.id);
        if (cached) return cached;
        const b = await db.getAudioBlob(nextTrackToPlay!.id);
        if (!b) return null;
        const u = URL.createObjectURL(b);
        preloadedUrlsRef.current.set(nextTrackToPlay!.id, u);
        return u;
      };

      resolveBlob().then((nextUrl) => {
        if (!nextUrl || !isCrossfadingRef.current) return;

        if (standbyDeckId === 'A') {
          activeUrlARef.current = nextUrl;
        } else {
          activeUrlBRef.current = nextUrl;
        }
        standbyDeck.src = nextUrl;

        const nextAnalysis = trackAnalyses[nextTrackToPlay!.id];
        const introSilence = smartMixConfig.trimSilence && nextAnalysis ? nextAnalysis.introSilenceDuration : 0;
        standbyDeck.currentTime = introSilence;
        standbyDeck.playbackRate = playerState.playbackRate;

        // Start standby deck silent in both HTML5 & Web Audio gain
        standbyDeck.volume = 0;
        if (standbyDeckGain && audioCtxRef.current) {
          standbyDeckGain.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
        }

        standbyDeck
          .play()
          .then(() => {
            const steps = Math.floor((crossfadeDuration * 1000) / 50);
            let currentStep = 0;

            crossfadeTimerRef.current = window.setInterval(() => {
              currentStep++;
              const progress = Math.min(1, currentStep / steps);

              // Equal power sine-cosine curve
              const outGain = Math.cos(progress * 0.5 * Math.PI);
              const inGain = Math.sin(progress * 0.5 * Math.PI);

              if (currentDeck) currentDeck.volume = Math.max(0, outGain);
              if (standbyDeck) standbyDeck.volume = Math.min(1, inGain);

              if (audioCtxRef.current) {
                const now = audioCtxRef.current.currentTime;
                if (currentDeckGain) currentDeckGain.gain.setValueAtTime(outGain, now);
                if (standbyDeckGain) standbyDeckGain.gain.setValueAtTime(inGain, now);
              }

              if (progress >= 1) {
                if (crossfadeTimerRef.current) {
                  clearInterval(crossfadeTimerRef.current);
                  crossfadeTimerRef.current = null;
                }

                // Pause old deck gently without removing src or calling load(), preserving iOS gesture privilege!
                currentDeck.pause();
                currentDeck.currentTime = 0;
                currentDeck.volume = 0;

                // Standby deck is NOW the active deck, playing uninterrupted from synchronized timestamp!
                activeDeckRef.current = standbyDeckId;
                if (standbyDeckGain && audioCtxRef.current) {
                  standbyDeckGain.gain.setValueAtTime(1.0, audioCtxRef.current.currentTime);
                }
                const currentVol = playerStateRef.current.isMuted ? 0 : playerStateRef.current.volume;
                standbyDeck.volume = currentVol;
                isCrossfadingRef.current = false;

                const blendedTrack = nextTrackToPlay!;
                const currentBlendedTime = standbyDeck.currentTime;
                const blendedDuration = standbyDeck.duration || blendedTrack.duration || 0;

                setPlayerState((prev) => ({
                  ...prev,
                  currentTrack: blendedTrack,
                  queueIndex: nextIdx,
                  currentTime: currentBlendedTime,
                  duration: blendedDuration,
                  isSmartMixBlending: false,
                  activeAnalysis: nextAnalysis || null,
                }));

                setupMediaSession(blendedTrack);
                preloadQueueTracks(nextIdx, queue);
              }
            }, 50);
          })
          .catch((err) => {
            console.warn('Smart Mix next deck play error, falling back to seamless nextTrack:', err);
            isCrossfadingRef.current = false;
            setPlayerState((prev) => ({ ...prev, isSmartMixBlending: false }));
            // Immediate fallback if iOS blocks background autoplay
            nextTrackRef.current();
          });
      });
    }
  }, [playerState, trackAnalyses, setupMediaSession, preloadQueueTracks]);

  // Toggle Shuffle
  const toggleShuffle = () => {
    setPlayerState((prev) => {
      const willShuffle = !prev.isShuffle;
      let newQueue = [...prev.queue];

      if (willShuffle) {
        if (originalQueueRef.current.length === 0) {
          originalQueueRef.current = [...prev.queue];
        }
        newQueue = shuffleArray([...prev.queue], prev.currentTrack);
      } else {
        newQueue = originalQueueRef.current.length > 0 ? [...originalQueueRef.current] : newQueue;
      }

      const newIndex = prev.currentTrack ? newQueue.findIndex((t) => t.id === prev.currentTrack!.id) : 0;
      return {
        ...prev,
        isShuffle: willShuffle,
        queue: newQueue,
        queueIndex: newIndex >= 0 ? newIndex : 0,
      };
    });
  };

  // Cycle Repeat Mode: off -> all -> one -> off
  const cycleRepeatMode = () => {
    setPlayerState((prev) => {
      let nextMode: RepeatMode = 'off';
      if (prev.repeatMode === 'off') nextMode = 'all';
      else if (prev.repeatMode === 'all') nextMode = 'one';
      else nextMode = 'off';
      return { ...prev, repeatMode: nextMode };
    });
  };

  // Volume & Volume Booster Control with Web Audio Engine (iOS & Desktop)
  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    ensureWebAudio();
    applyMasterGain(clamped, undefined, undefined, clamped === 0);

    const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
    if (activeDeck) activeDeck.volume = clamped;
    const inactiveDeck = activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
    if (inactiveDeck && !isCrossfadingRef.current) inactiveDeck.volume = clamped;

    setPlayerState((prev) => ({ ...prev, volume: clamped, isMuted: clamped === 0 }));
  }, [applyMasterGain, ensureWebAudio]);

  const setVolumeBooster = useCallback(
    (multiplier: number) => {
      const clamped = Math.max(1.0, Math.min(3.0, multiplier));
      const isActive = clamped > 1.0;

      ensureWebAudio();
      applyMasterGain(undefined, clamped, isActive);

      setPlayerState((prev) => ({
        ...prev,
        volumeBooster: clamped,
        isBoosterActive: isActive,
      }));

      db.saveSetting('app_volume_booster', clamped);
      db.saveSetting('app_is_booster_active', isActive);
      showToast(isActive ? `Volume Boost: ${clamped.toFixed(1)}x` : 'Volume: 1.0x (Standard)');
    },
    [applyMasterGain, ensureWebAudio, showToast]
  );

  const toggleVolumeBooster = useCallback(
    (enabled?: boolean) => {
      setPlayerState((prev) => {
        const nextActive = enabled !== undefined ? enabled : !prev.isBoosterActive;
        const targetMultiplier = nextActive ? (prev.volumeBooster > 1.0 ? prev.volumeBooster : 2.0) : 1.0;

        ensureWebAudio();
        applyMasterGain(undefined, targetMultiplier, nextActive);

        db.saveSetting('app_is_booster_active', nextActive);
        db.saveSetting('app_volume_booster', targetMultiplier);
        showToast(nextActive ? `Volume Boost ON (${targetMultiplier.toFixed(1)}x)` : 'Volume Boost OFF (1.0x)');
        return { ...prev, isBoosterActive: nextActive, volumeBooster: targetMultiplier };
      });
    },
    [applyMasterGain, ensureWebAudio, showToast]
  );

  // Favorites
  const toggleFavorite = async (trackId: string) => {
    const target = tracks.find((t) => t.id === trackId);
    if (!target) return;

    const updated = { ...target, isFavorite: !target.isFavorite };
    await db.updateTrackMetadata(updated);

    setTracks((prev) => prev.map((t) => (t.id === trackId ? updated : t)));

    if (playerState.currentTrack?.id === trackId) {
      setPlayerState((prev) => ({
        ...prev,
        currentTrack: { ...prev.currentTrack!, isFavorite: updated.isFavorite },
      }));
    }

    showToast(updated.isFavorite ? 'Added to Favorites' : 'Removed from Favorites');
  };

  // Delete Track
  const deleteTrack = async (trackId: string) => {
    if (playerState.currentTrack?.id === trackId) {
      const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (activeDeck) {
        activeDeck.pause();
        activeDeck.currentTime = 0;
      }
      setPlayerState((prev) => ({
        ...prev,
        currentTrack: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        queue: prev.queue.filter((t) => t.id !== trackId),
      }));
    }

    await db.deleteTrack(trackId);
    await refreshLibrary();
    showToast('Track deleted from offline storage.');
  };

  // Batch Delete Tracks
  const deleteTracks = async (trackIds: string[]) => {
    if (trackIds.includes(playerState.currentTrack?.id || '')) {
      const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (activeDeck) {
        activeDeck.pause();
        activeDeck.currentTime = 0;
      }
      setPlayerState((prev) => ({
        ...prev,
        currentTrack: null,
        isPlaying: false,
        queue: prev.queue.filter((t) => !trackIds.includes(t.id)),
      }));
    }

    await db.deleteTracks(trackIds);
    await refreshLibrary();
    showToast(`Deleted ${trackIds.length} track${trackIds.length > 1 ? 's' : ''}.`);
  };

  // Playlists Management
  const createPlaylist = async (name: string, description?: string, trackIds: string[] = []) => {
    const newPlaylist: Playlist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim() || 'New Playlist',
      description,
      sourceType: 'manual',
      trackIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.savePlaylist(newPlaylist);
    setPlaylists((prev) => [newPlaylist, ...prev]);
    showToast(`Created playlist "${newPlaylist.name}"`);
    return newPlaylist;
  };

  const updatePlaylist = async (playlist: Playlist) => {
    const updated = { ...playlist, updatedAt: Date.now() };
    await db.savePlaylist(updated);
    setPlaylists((prev) => prev.map((pl) => (pl.id === updated.id ? updated : pl)));
  };

  const deletePlaylist = async (playlistId: string) => {
    await db.deletePlaylist(playlistId);
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
    showToast('Playlist deleted (tracks preserved).');
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const target = playlists.find((pl) => pl.id === playlistId);
    if (!target) return;

    if (target.trackIds.includes(trackId)) {
      showToast('Track is already in this playlist');
      return;
    }

    const updated = {
      ...target,
      trackIds: [...target.trackIds, trackId],
      updatedAt: Date.now(),
    };

    await db.savePlaylist(updated);
    setPlaylists((prev) => prev.map((pl) => (pl.id === playlistId ? updated : pl)));
    showToast(`Added to "${target.name}"`);
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    const target = playlists.find((pl) => pl.id === playlistId);
    if (!target) return;

    const updated = {
      ...target,
      trackIds: target.trackIds.filter((id) => id !== trackId),
      updatedAt: Date.now(),
    };

    await db.savePlaylist(updated);
    setPlaylists((prev) => prev.map((pl) => (pl.id === playlistId ? updated : pl)));
    showToast('Removed from playlist');
  };

  const reorderPlaylistTracks = async (playlistId: string, newTrackIds: string[]) => {
    const target = playlists.find((pl) => pl.id === playlistId);
    if (!target) return;

    const updated = {
      ...target,
      trackIds: newTrackIds,
      updatedAt: Date.now(),
    };

    await db.savePlaylist(updated);
    setPlaylists((prev) => prev.map((pl) => (pl.id === playlistId ? updated : pl)));
  };

  // Queue manipulation
  const addToQueue = (track: Track) => {
    setPlayerState((prev) => ({
      ...prev,
      queue: [...prev.queue, track],
    }));
    showToast(`Added "${track.title}" to queue`);
  };

  const playNextInQueue = (track: Track) => {
    setPlayerState((prev) => {
      const idx = prev.queueIndex;
      const copy = [...prev.queue];
      copy.splice(idx + 1, 0, track);
      return { ...prev, queue: copy };
    });
    showToast(`"${track.title}" will play next`);
  };

  const removeFromQueue = (index: number) => {
    setPlayerState((prev) => {
      const copy = [...prev.queue];
      copy.splice(index, 1);
      const newIndex = index < prev.queueIndex ? prev.queueIndex - 1 : prev.queueIndex;
      return { ...prev, queue: copy, queueIndex: newIndex };
    });
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    setPlayerState((prev) => {
      if (fromIndex === toIndex) return prev;
      const copy = [...prev.queue];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);

      let newQueueIndex = prev.queueIndex;
      if (prev.queueIndex === fromIndex) {
        newQueueIndex = toIndex;
      } else if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) {
        newQueueIndex--;
      } else if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) {
        newQueueIndex++;
      }

      return { ...prev, queue: copy, queueIndex: newQueueIndex };
    });
  };

  const clearQueue = () => {
    setPlayerState((prev) => ({
      ...prev,
      queue: prev.currentTrack ? [prev.currentTrack] : [],
      queueIndex: 0,
    }));
    showToast('Queue cleared');
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    const merged = { ...settings, ...newSettings };
    await db.saveSetting('app_settings', merged);
    setSettings(merged);
    showToast('Settings saved');
  };

  // BTT SMART MIX CONFIGURATION
  const updateSmartMixConfig = async (configUpdate: Partial<SmartMixConfig>) => {
    const updatedConfig: SmartMixConfig = { ...playerState.smartMixConfig, ...configUpdate };

    if (configUpdate.preset) {
      if (configUpdate.preset === 'off') {
        updatedConfig.enabled = false;
      } else {
        updatedConfig.enabled = true;
        if (configUpdate.preset === 'short') updatedConfig.duration = 3;
        else if (configUpdate.preset === 'balanced') updatedConfig.duration = 6;
        else if (configUpdate.preset === 'long') updatedConfig.duration = 10;
      }
    }

    setPlayerState((prev) => ({ ...prev, smartMixConfig: updatedConfig }));
    await updateSettings({ smartMix: updatedConfig });
  };

  // AUDIO ANALYSIS ACTIONS
  const analyzeTrackById = async (trackId: string): Promise<TrackAnalysis | null> => {
    try {
      const blob = await db.getAudioBlob(trackId);
      if (!blob) return null;
      const analysis = await analyzeTrackAudio(blob, trackId);
      await db.saveTrackAnalysis(analysis);
      setTrackAnalyses((prev) => ({ ...prev, [trackId]: analysis }));
      if (playerState.currentTrack?.id === trackId) {
        setPlayerState((prev) => ({ ...prev, activeAnalysis: analysis }));
      }
      return analysis;
    } catch (err) {
      console.warn('Track analysis error:', err);
      return null;
    }
  };

  const batchAnalyzeTracks = async (trackIdsToAnalyze?: string[]) => {
    const targetIds = trackIdsToAnalyze || tracks.map((t) => t.id);
    const unanalyzed = targetIds.filter((id) => !trackAnalyses[id]);

    if (unanalyzed.length === 0) {
      showToast('All selected tracks are already analyzed!');
      return;
    }

    setPlayerState((prev) => ({
      ...prev,
      isAnalyzing: true,
      analysisProgress: { current: 0, total: unanalyzed.length },
    }));

    let completed = 0;
    for (const trackId of unanalyzed) {
      try {
        const blob = await db.getAudioBlob(trackId);
        if (blob) {
          const analysis = await analyzeTrackAudio(blob, trackId);
          await db.saveTrackAnalysis(analysis);
          setTrackAnalyses((prev) => ({ ...prev, [trackId]: analysis }));
        }
      } catch (err) {
        console.warn('Failed analysis for track:', trackId, err);
      }
      completed++;
      setPlayerState((prev) => ({
        ...prev,
        analysisProgress: { current: completed, total: unanalyzed.length },
      }));
    }

    setPlayerState((prev) => ({
      ...prev,
      isAnalyzing: false,
      analysisProgress: null,
    }));

    showToast(`Btt Smart Mix: Analyzed ${completed} track${completed > 1 ? 's' : ''}!`);
  };

  const optimizePlaylistHarmonically = async (playlistId: string) => {
    const targetPl = playlists.find((pl) => pl.id === playlistId);
    if (!targetPl || targetPl.trackIds.length <= 1) return null;

    const unanalyzed = targetPl.trackIds.filter((id) => !trackAnalyses[id]);
    if (unanalyzed.length > 0) {
      showToast(`Analyzing ${unanalyzed.length} tracks before optimizing...`);
      await batchAnalyzeTracks(targetPl.trackIds);
    }

    const result = optimizePlaylistOrder(targetPl.trackIds, trackAnalyses);
    return result;
  };

  return (
    <MusicContext.Provider
      value={{
        tracks,
        playlists,
        playerState,
        storageStats,
        isFullScreenPlayerOpen,
        settings,
        toastMessage,
        trackAnalyses,
        refreshLibrary,
        playTrack,
        togglePlayPause,
        seekTo,
        nextTrack,
        prevTrack,
        toggleShuffle,
        cycleRepeatMode,
        setVolume,
        setVolumeBooster,
        toggleVolumeBooster,
        setPlaybackRate,
        toggleFavorite,
        deleteTrack,
        deleteTracks,
        createPlaylist,
        updatePlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        reorderPlaylistTracks,
        addToQueue,
        playNextInQueue,
        removeFromQueue,
        reorderQueue,
        clearQueue,
        setIsFullScreenPlayerOpen,
        showToast,
        updateSettings,
        updateSmartMixConfig,
        analyzeTrackById,
        batchAnalyzeTracks,
        optimizePlaylistHarmonically,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};

export function useMusic(): MusicContextType {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
}

function shuffleArray<T extends { id: string }>(arr: T[], currentItem: T | null): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  if (currentItem) {
    const idx = copy.findIndex((item) => item.id === currentItem.id);
    if (idx > -1) {
      copy.splice(idx, 1);
      copy.unshift(currentItem);
    }
  }
  return copy;
}
