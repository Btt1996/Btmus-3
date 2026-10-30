export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  fileSize: number; // in bytes
  mimeType: string;
  fileName: string;
  fileHash?: string;
  downloadDate: number; // timestamp
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt?: number; // timestamp
  artworkUrl?: string; // base64 data url or object url
  previewUrl?: string; // live preview audio url
  telegramSource?: {
    chatId?: number | string;
    chatTitle?: string;
    topicId?: number;
    topicName?: string;
    messageId?: number;
    fileId?: string;
    sourceType: 'bot' | 'channel' | 'manual' | 'sample';
  };
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  sourceType: 'manual' | 'telegram';
  telegramTopic?: string;
  telegramChatTitle?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
  coverArtworkUrl?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type CrossfadePreset = 'off' | 'short' | 'balanced' | 'long' | 'custom';
export type TransitionStyle = 'smooth' | 'beat-sync' | 'harmonic';

export interface SmartMixConfig {
  enabled: boolean;
  preset: CrossfadePreset;
  duration: number; // in seconds (1 to 15s)
  style: TransitionStyle;
  trimSilence: boolean;
  useHarmonicMixing: boolean;
}

export interface TrackAnalysis {
  trackId: string;
  bpm: number;
  key: string; // e.g. "A minor"
  camelot: string; // e.g. "8A"
  energy: number; // 0 to 1
  loudnessDb: number; // e.g. -14dB
  introSilenceDuration: number; // seconds to skip dead air
  outroSilenceDuration: number; // seconds of dead air at end
  suggestedFadeInPoint: number; // seconds
  suggestedFadeOutPoint: number; // seconds
  analyzedAt: number;
  version: number;
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number; // in seconds
  duration: number; // in seconds
  volume: number; // 0 to 1
  isMuted: boolean;
  playbackRate: number; // 0.75, 1.0, 1.25, 1.5, 2.0
  repeatMode: RepeatMode;
  isShuffle: boolean;
  queue: Track[];
  queueIndex: number;
  error: string | null;
  smartMixConfig: SmartMixConfig;
  isSmartMixBlending: boolean; // true when dual-deck crossfade is actively fading
  activeAnalysis?: TrackAnalysis | null;
  isAnalyzing: boolean;
  analysisProgress: { current: number; total: number } | null;
  volumeBooster: number; // 1.0 to 3.0 (up to 3x louder)
  isBoosterActive: boolean; // whether 3x volume booster is engaged
}

export interface TelegramSyncItem {
  fileId: string;
  fileUniqueId: string;
  fileName: string;
  title?: string;
  performer?: string;
  duration?: number;
  fileSize: number;
  mimeType: string;
  chatId: number | string;
  chatTitle: string;
  topicId?: number;
  topicName?: string;
  messageId: number;
  date: number;
  isAlreadyImported: boolean;
}

export interface DownloadTask {
  id: string;
  fileId: string;
  title: string;
  artist: string;
  fileName: string;
  sourceName: string;
  totalBytes: number;
  downloadedBytes: number;
  status: 'pending' | 'downloading' | 'parsing' | 'saving' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface AppSettings {
  defaultShuffle: boolean;
  defaultRepeat: RepeatMode;
  rememberPosition: boolean;
  defaultPlaybackRate: number;
  telegramBotToken: string;
  autoCreatePlaylists: boolean;
  skipDuplicates: boolean;
  smartMix: SmartMixConfig;
  volumeBooster: number; // 1.0 to 3.0
  isBoosterActive: boolean;
  paletteCombo?: 'signature' | 'mono' | 'legacy';
  lastSyncedAt?: number;
}
