import { NormalizedTrackMetadata, AudioCandidateMatch } from '../../types/playlistImport';

/**
 * spotDL Architecture & Hosting Interface
 *
 * TECHNICAL ASSESSMENT:
 * spotDL (https://github.com/spotDL/spotify-downloader) is a Python application that depends on:
 * 1. Python runtime (3.8+)
 * 2. FFmpeg binary installed on the host system
 * 3. yt-dlp / YouTube Music scrapers
 *
 * Can it run on iPhone / Browser?
 * NO. iOS Safari and WebAssembly sandboxes cannot run native FFmpeg audio encoders or Python CLI processes.
 * GitHub hosts code, not a live execution API.
 *
 * Running spotDL requires external infrastructure:
 * - A self-hosted Python microservice (e.g. Docker container on VPS, Raspberry Pi, Render, or Railway)
 * - Expected hosting cost: $5 - $10 / month for VPS, or free self-hosted on a home server.
 *
 * This bridge connects to a user-hosted spotDL HTTP microservice if configured,
 * or cleanly flags it as disconnected.
 */

export interface SpotDLBridgeStatus {
  isConfigured: boolean;
  isOnline: boolean;
  version?: string;
  errorMessage?: string;
}

export async function checkSpotDLBridgeStatus(bridgeUrl?: string): Promise<SpotDLBridgeStatus> {
  const url = bridgeUrl?.trim();
  if (!url) {
    return {
      isConfigured: false,
      isOnline: false,
      errorMessage: 'Bridge URL not configured. spotDL requires a hosted Python+FFmpeg service.',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${url.replace(/\/$/, '')}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        isConfigured: true,
        isOnline: true,
        version: data.version || 'spotDL v4.x Bridge',
      };
    }

    return {
      isConfigured: true,
      isOnline: false,
      errorMessage: `Bridge responded with HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    return {
      isConfigured: true,
      isOnline: false,
      errorMessage: err instanceof Error ? err.message : 'Connection timed out',
    };
  }
}

/**
 * Searches the user-hosted spotDL bridge service for a matching audio stream or download
 */
export async function searchSpotDLBridge(
  track: NormalizedTrackMetadata,
  bridgeUrl?: string
): Promise<AudioCandidateMatch | null> {
  const url = bridgeUrl?.trim();
  if (!url) return null;

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: track.title,
        artists: track.artists,
        album: track.album,
        durationMs: track.durationMs,
        isrc: track.isrc,
      }),
    });

    if (!res.ok) return null;
    const match = await res.json();
    if (!match.downloadUrl) return null;

    return {
      provider: 'spotdl',
      providerTrackId: match.id || `spotdl_${Date.now()}`,
      title: match.title || track.title,
      artist: match.artist || track.artists[0] || 'Unknown',
      durationSeconds: match.durationSeconds || Math.round(track.durationMs / 1000),
      downloadUrl: match.downloadUrl,
      previewStreamUrl: match.streamUrl || match.downloadUrl,
      format: match.format || 'mp3',
      fileSizeBytes: match.sizeBytes,
      confidenceScore: match.confidence || 90,
      matchReason: match.reason || 'Matched via user-hosted spotDL Python engine',
    };
  } catch {
    return null;
  }
}
