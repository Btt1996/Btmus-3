export type UnifiedMusicSource =
  | 'local'
  | 'spotify'
  | 'youtube'
  | 'soundcloud'
  | 'telegram'
  | 'open_cc';

export type DownloadAvailability =
  | 'downloadable'          // Direct or matched authorized audio file ready to download
  | 'in_library'            // Already verified in local IndexedDB vault
  | 'preview_only'          // Streamable preview available; commercial download not authorized
  | 'unsupported_rights'    // Rights restricted, requires external authorization
  | 'provider_required';    // Needs external provider (e.g. Telegram bot or CC match)

export type ItemImportState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'in_library'
  | 'needs_confirmation';

export interface UnifiedSearchResultItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  artworkUrl?: string;
  source: UnifiedMusicSource;
  sourceUrl?: string;
  sourceId: string;
  downloadAvailability: DownloadAvailability;
  availabilityReason: string;
  localTrackId?: string;
  isLocal: boolean;
  audioStreamUrl?: string;
  downloadUrl?: string;
  isrc?: string | null;
  confidenceScore?: number;
  matchReason?: string;
  channelOrCurator?: string;
  downloadPercent?: number;
  importState?: ItemImportState;
  importError?: string;
}

export type HistoryType =
  | 'all'
  | 'search'
  | 'playlist'
  | 'playback'
  | 'download'
  | 'failed_import'
  | 'duplicate';

export interface UnifiedHistoryRecord {
  id: string;
  type: 'search' | 'playlist' | 'playback' | 'download' | 'failed_import' | 'duplicate';
  timestamp: number;
  title: string;
  subtitle?: string;
  source?: string;
  status?: 'completed' | 'failed' | 'in_library' | 'retryable';
  errorReason?: string;
  localTrackId?: string;
  artworkUrl?: string;
  durationSeconds?: number;
  query?: string;
  playlistUrl?: string;
  trackCount?: number;
  fileSizeBytes?: number;
  retryPayload?: {
    title: string;
    artist: string;
    album?: string;
    source: string;
    durationMs?: number;
    isrc?: string | null;
  };
}
