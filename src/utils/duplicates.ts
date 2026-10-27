import { Track, Playlist } from '../types/music';
import { deleteTracks, savePlaylist, getAllPlaylists } from '../services/db';

export interface DuplicateGroup {
  groupKey: string;
  songTitle: string;
  artistName: string;
  primaryTrack: Track;
  duplicateTracks: Track[];
  wastedBytes: number;
}

/**
 * Normalizes title string for accurate duplicate matching
 */
function normalizeSongTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics?|visualizer|hq|hd|remix|edit)[\)\]]/gi, '')
    .replace(/\.mp3$|\.m4a$|\.wav$|\.flac$|\.ogg$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeArtistName(artist: string): string {
  if (!artist || artist === 'Unknown Artist' || artist === 'Imported Audio') return '';
  return artist
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Scans library for duplicate tracks
 */
export function findDuplicateTracks(tracks: Track[]): DuplicateGroup[] {
  if (tracks.length < 2) return [];

  const groupsMap = new Map<string, Track[]>();

  for (const track of tracks) {
    const normTitle = normalizeSongTitle(track.title);
    const normArtist = normalizeArtistName(track.artist);

    // If title has content, build canonical key
    if (normTitle) {
      // If fileHash is available, combine it; otherwise title + artist or title + approximate duration
      const durationBucket = track.duration ? Math.round(track.duration / 3) * 3 : 0;
      const key = `${normTitle}__${normArtist || 'any'}__${durationBucket}`;

      const existing = groupsMap.get(key) || [];
      existing.push(track);
      groupsMap.set(key, existing);
    }
  }

  const results: DuplicateGroup[] = [];

  for (const [groupKey, groupTracks] of groupsMap.entries()) {
    if (groupTracks.length > 1) {
      // Pick best track as primary:
      // Prefer track with favorite=true, or most plays, or largest file size (highest audio bitrate)
      const sorted = [...groupTracks].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        if ((b.playCount || 0) !== (a.playCount || 0)) {
          return (b.playCount || 0) - (a.playCount || 0);
        }
        return (b.fileSize || 0) - (a.fileSize || 0);
      });

      const primary = sorted[0];
      const duplicates = sorted.slice(1);
      const wastedBytes = duplicates.reduce((sum, t) => sum + (t.fileSize || 0), 0);

      results.push({
        groupKey,
        songTitle: primary.title,
        artistName: primary.artist || 'Unknown Artist',
        primaryTrack: primary,
        duplicateTracks: duplicates,
        wastedBytes,
      });
    }
  }

  return results;
}

/**
 * Safely purge duplicates, preserving playlist references
 */
export async function removeDuplicates(
  groups: DuplicateGroup[],
  playlists: Playlist[]
): Promise<{ removedCount: number; freedBytes: number }> {
  const idsToDelete: string[] = [];
  const trackIdReplacements = new Map<string, string>(); // oldId -> primaryId
  let freedBytes = 0;

  for (const g of groups) {
    for (const dup of g.duplicateTracks) {
      idsToDelete.push(dup.id);
      trackIdReplacements.set(dup.id, g.primaryTrack.id);
      freedBytes += dup.fileSize || 0;
    }
  }

  if (idsToDelete.length === 0) {
    return { removedCount: 0, freedBytes: 0 };
  }

  // 1. Delete duplicate tracks & audio blobs from DB
  await deleteTracks(idsToDelete);

  // 2. Remap playlist tracks so no playlist is corrupted
  for (const playlist of playlists) {
    let changed = false;
    const newTrackIds: string[] = [];

    for (const tid of playlist.trackIds) {
      if (trackIdReplacements.has(tid)) {
        const replacement = trackIdReplacements.get(tid)!;
        // avoid adding duplicate of primary to same playlist
        if (!newTrackIds.includes(replacement)) {
          newTrackIds.push(replacement);
        }
        changed = true;
      } else {
        newTrackIds.push(tid);
      }
    }

    if (changed) {
      await savePlaylist({
        ...playlist,
        trackIds: newTrackIds,
        updatedAt: Date.now(),
      });
    }
  }

  return {
    removedCount: idsToDelete.length,
    freedBytes,
  };
}
