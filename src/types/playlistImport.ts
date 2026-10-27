// X1 & X2 Playlist Import Type Definitions

// Normalized X1 Output Schema as strictly specified
export interface NormalizedTrackMetadata {
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  isrc: string | null;
  artworkUrl: string | null;
  position: number;
}

export interface NormalizedPlaylist {
  source: 'spotify' | 'anghami' | 'manual' | 'archive' | 'jamendo';
  playlistTitle: string;
  playlistDescription?: string;
  playlistCoverUrl?: string;
  externalUrl?: string;
  totalTracks: number;
  tracks: NormalizedTrackMetadata[];
}

// X2 Audio Candidate Match
export type AudioProviderType = 'jamendo' | 'archive' | 'fma' | 'telegram' | 'spotdl' | 'local';

export interface AudioCandidateMatch {
  provider: AudioProviderType;
  providerTrackId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  downloadUrl: string;
  previewStreamUrl?: string;
  format: string; // 'mp3' | 'm4a' | 'wav'
  fileSizeBytes?: number;
  confidenceScore: number; // 0 to 100
  matchReason: string;
  licenseInfo?: string;
  isrcMatch?: boolean;
}

// Detailed failure categorization for resilient error reporting
export type X2FailureCategory =
  | 'none'
  | 'recording_unavailable' // queried providers, none had match above threshold
  | 'network_failure'       // network error, timeout, offline
  | 'provider_unsupported'  // provider needs external backend or not configured (e.g. spotDL bridge offline)
  | 'rate_limited'          // HTTP 429
  | 'stream_invalid';       // download response not valid audio

export interface X2ProviderAttempt {
  provider: AudioProviderType;
  providerName: string;
  status: 'matched' | 'no_match' | 'error' | 'skipped';
  errorDetails?: string;
  candidateCount: number;
  latencyMs?: number;
}

// X2 Processing Progress for each Track
export type ImportItemStatus =
  | 'pending'
  | 'searching'
  | 'matched'
  | 'review_required'
  | 'downloading'
  | 'saving'
  | 'already_local'
  | 'completed'
  | 'unavailable'
  | 'failed';

export interface TrackImportProgressItem {
  id: string; // position or unique id
  track: NormalizedTrackMetadata;
  status: ImportItemStatus;
  selectedMatch?: AudioCandidateMatch;
  candidateMatches: AudioCandidateMatch[];
  downloadProgress: number; // 0 to 100
  errorMessage?: string;
  failureCategory?: X2FailureCategory;
  providerAttempts?: X2ProviderAttempt[];
  retryCount?: number;
  savedTrackId?: string;
}

export interface ImportSummary {
  total: number;
  completed: number;
  alreadyLocal: number;
  reviewRequired: number;
  unavailable: number;
  failed: number;
}

export interface ImportSettings {
  matchingThreshold: number; // default 75 (0 - 100)
  enableJamendo: boolean;
  enableInternetArchive: boolean;
  enableFMA: boolean; // Free Music Archive open catalog
  enableTelegramMatch: boolean; // Telegram Bot / Channel Music Sync
  enableSpotDLBridge: boolean;
  spotDLBridgeUrl: string; // e.g. http://localhost:8080 or custom server
  spotifyClientId: string;
  spotifyClientSecret: string;
  requireConfirmationForMedium: boolean; // if confidence < 80%, prompt user
  preferLocalCache: boolean; // Check local IndexedDB first
  maxRetries: number; // Retry transient failures with exponential backoff
}

// Persistent Recording Cache Mapping
export interface RecordingCacheEntry {
  normalizedKey: string; // e.g. "blinding lights___the weeknd"
  trackId: string;
  title: string;
  artist: string;
  duration: number;
  verifiedAt: number;
}

// Benchmark Suite Types (Requirement 6)
export interface X2BenchmarkTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  category: 'commercial_hit' | 'popular_mainstream' | 'creative_commons' | 'public_domain' | 'cached_local';
  expectedAvailability: 'unauthorized_without_bridge' | 'fully_authorized_open' | 'cached_instant';
  spotifyUri?: string;
}

export interface X2BenchmarkResult {
  track: X2BenchmarkTrack;
  searchSuccess: boolean;
  matchQuality: number; // 0 to 100
  bestCandidate?: AudioCandidateMatch;
  authorizedDownloadAvailable: boolean;
  importSuccess: boolean;
  timeMs: number;
  sourceProvider?: string;
  diagnosticNotes: string;
  failureCategory: X2FailureCategory;
  attempts: X2ProviderAttempt[];
}

export interface X2BenchmarkReport {
  testedAt: number;
  totalTracks: number;
  searchSuccessCount: number;
  searchSuccessRate: number;
  avgMatchQuality: number;
  authorizedDownloadCount: number;
  authorizedDownloadRate: number;
  importSuccessCount: number;
  importSuccessRate: number;
  results: X2BenchmarkResult[];
  summaryNotes: string;
}
