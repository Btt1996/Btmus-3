/**
 * Pure TypeScript browser ID3 tag parser.
 * Supports ID3v2.3, ID3v2.4, ID3v1, and audio metadata extraction.
 */

export interface ParsedAudioMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  year?: string;
  artworkUrl?: string; // base64 data url
}

export async function parseAudioMetadata(file: File | Blob, fileNameHint?: string): Promise<ParsedAudioMetadata> {
  const fileName = fileNameHint || (file instanceof File ? file.name : 'Unknown Track');
  const cleanName = cleanFileName(fileName);

  let metadata: ParsedAudioMetadata = {
    title: cleanName.title,
    artist: cleanName.artist,
    album: 'Unknown Album',
    duration: 0,
  };

  try {
    // Read first 512KB for ID3v2 tags (sufficient for all standard tags and embedded album art up to 450KB)
    const headerSlice = file.slice(0, Math.min(file.size, 512 * 1024));
    const headerBuffer = await headerSlice.arrayBuffer();
    const id3Data = parseID3v2(headerBuffer);

    if (id3Data) {
      if (id3Data.title) metadata.title = id3Data.title.trim();
      if (id3Data.artist) metadata.artist = id3Data.artist.trim();
      if (id3Data.album) metadata.album = id3Data.album.trim();
      if (id3Data.year) metadata.year = id3Data.year.trim();
      if (id3Data.artworkUrl) metadata.artworkUrl = id3Data.artworkUrl;
      if (id3Data.duration && id3Data.duration > 0) metadata.duration = id3Data.duration;
    } else if (file.size > 128) {
      // Try ID3v1 at the end of the file
      const tailSlice = file.slice(file.size - 128);
      const tailBuffer = await tailSlice.arrayBuffer();
      const id3v1 = parseID3v1(tailBuffer);
      if (id3v1) {
        if (id3v1.title) metadata.title = id3v1.title.trim();
        if (id3v1.artist) metadata.artist = id3v1.artist.trim();
        if (id3v1.album) metadata.album = id3v1.album.trim();
        if (id3v1.year) metadata.year = id3v1.year.trim();
      }
    }
  } catch (err) {
    console.warn('ID3 parsing skipped or failed:', err);
  }

  // If duration was not found in tags, measure duration using browser audio element
  if (!metadata.duration || metadata.duration <= 0) {
    try {
      metadata.duration = await measureAudioDuration(file);
    } catch {
      metadata.duration = 0;
    }
  }

  return metadata;
}

function cleanFileName(fileName: string): { title: string; artist: string } {
  // Strip extension
  const base = fileName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  
  // Check for "Artist - Title" format
  if (base.includes(' - ')) {
    const parts = base.split(' - ');
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return {
      artist: artist || 'Unknown Artist',
      title: title || base,
    };
  }

  return {
    artist: 'Unknown Artist',
    title: base || 'Untitled Track',
  };
}

function parseID3v2(buffer: ArrayBuffer): Partial<ParsedAudioMetadata> | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return null;

  // Header must start with "ID3"
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return null;
  }

  const versionMajor = bytes[3]; // e.g. 3 for ID3v2.3, 4 for ID3v2.4
  if (versionMajor < 2 || versionMajor > 4) return null;

  // Tag size is stored as 4 synchsafe bytes (7 bits each)
  const tagSize = ((bytes[6] & 0x7f) << 21) |
                  ((bytes[7] & 0x7f) << 14) |
                  ((bytes[8] & 0x7f) << 7) |
                  (bytes[9] & 0x7f);

  const maxRead = Math.min(bytes.length, 10 + tagSize);
  let offset = 10;

  const result: Partial<ParsedAudioMetadata> = {};

  while (offset < maxRead - 10) {
    // Check for padding (zero bytes)
    if (bytes[offset] === 0) break;

    let frameId = '';
    let frameSize = 0;

    if (versionMajor === 2) {
      // ID3v2.2 uses 3-char frame ID and 3-byte size
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
      frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
      offset += 6;
    } else {
      // ID3v2.3 & 2.4 use 4-char frame ID and 4-byte size + 2 flag bytes
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      if (versionMajor === 4) {
        // ID3v2.4 synchsafe
        frameSize = ((bytes[offset + 4] & 0x7f) << 21) |
                    ((bytes[offset + 5] & 0x7f) << 14) |
                    ((bytes[offset + 6] & 0x7f) << 7) |
                    (bytes[offset + 7] & 0x7f);
      } else {
        // ID3v2.3 standard int
        frameSize = (bytes[offset + 4] << 24) |
                    (bytes[offset + 5] << 16) |
                    (bytes[offset + 6] << 8) |
                    bytes[offset + 7];
      }
      offset += 10;
    }

    if (frameSize <= 0 || offset + frameSize > maxRead) {
      break;
    }

    const frameBytes = bytes.subarray(offset, offset + frameSize);

    // Parse Text Frames
    if (frameId === 'TIT2' || frameId === 'TT2') {
      result.title = decodeTextFrame(frameBytes);
    } else if (frameId === 'TPE1' || frameId === 'TP1') {
      result.artist = decodeTextFrame(frameBytes);
    } else if (frameId === 'TALB' || frameId === 'TAL') {
      result.album = decodeTextFrame(frameBytes);
    } else if (frameId === 'TYER' || frameId === 'TDRC' || frameId === 'TYE') {
      result.year = decodeTextFrame(frameBytes);
    } else if (frameId === 'TLEN') {
      const ms = parseInt(decodeTextFrame(frameBytes), 10);
      if (!isNaN(ms) && ms > 0) {
        result.duration = Math.round(ms / 1000);
      }
    } else if ((frameId === 'APIC' || frameId === 'PIC') && !result.artworkUrl) {
      result.artworkUrl = decodeApicFrame(frameBytes, versionMajor);
    }

    offset += frameSize;
  }

  return result;
}

function decodeTextFrame(bytes: Uint8Array): string {
  if (bytes.length <= 1) return '';
  const encoding = bytes[0];
  const payload = bytes.subarray(1);

  try {
    if (encoding === 0) {
      // ISO-8859-1 (Latin1)
      let str = '';
      for (let i = 0; i < payload.length; i++) {
        if (payload[i] === 0) break;
        str += String.fromCharCode(payload[i]);
      }
      return str;
    } else if (encoding === 1) {
      // UTF-16 with BOM
      return new TextDecoder('utf-16').decode(payload).replace(/\0.*$/g, '');
    } else if (encoding === 2) {
      // UTF-16BE without BOM
      return new TextDecoder('utf-16be').decode(payload).replace(/\0.*$/g, '');
    } else if (encoding === 3) {
      // UTF-8
      return new TextDecoder('utf-8').decode(payload).replace(/\0.*$/g, '');
    }
  } catch {
    // fallback
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(payload).replace(/\0.*$/g, '');
}

function decodeApicFrame(bytes: Uint8Array, versionMajor: number): string | undefined {
  if (bytes.length < 8) return undefined;
  let offset = 1; // skip encoding byte

  let mimeType = 'image/jpeg';

  if (versionMajor === 2) {
    // 3 bytes format e.g. "JPG" or "PNG"
    const fmt = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]).toUpperCase();
    offset += 3;
    mimeType = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
  } else {
    // null-terminated mime string
    let mimeStr = '';
    while (offset < bytes.length && bytes[offset] !== 0) {
      mimeStr += String.fromCharCode(bytes[offset]);
      offset++;
    }
    offset++; // skip null terminator
    if (mimeStr) mimeType = mimeStr.toLowerCase();
  }

  // picture type byte (e.g. 0x03 is front cover)
  offset++;

  // null-terminated description string (can be ASCII or UTF-16 based on encoding)
  const encoding = bytes[0];
  if (encoding === 1 || encoding === 2) {
    // UTF-16 description: ends with double 00 00
    while (offset < bytes.length - 1 && !(bytes[offset] === 0 && bytes[offset + 1] === 0)) {
      offset += 2;
    }
    offset += 2;
  } else {
    // Single byte null terminator
    while (offset < bytes.length && bytes[offset] !== 0) {
      offset++;
    }
    offset++;
  }

  if (offset >= bytes.length) return undefined;

  const imageBytes = bytes.subarray(offset);
  if (imageBytes.length === 0) return undefined;

  // Convert binary data to base64 data URL
  let binary = '';
  const len = imageBytes.byteLength;
  const chunkLimit = 8192;
  for (let i = 0; i < len; i += chunkLimit) {
    const chunk = imageBytes.subarray(i, Math.min(i + chunkLimit, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

function parseID3v1(buffer: ArrayBuffer): Partial<ParsedAudioMetadata> | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 128) return null;

  // Must begin with 'TAG'
  if (bytes[0] !== 0x54 || bytes[1] !== 0x41 || bytes[2] !== 0x47) {
    return null;
  }

  const decodeAscii = (start: number, len: number) => {
    let str = '';
    for (let i = start; i < start + len; i++) {
      if (bytes[i] === 0) break;
      str += String.fromCharCode(bytes[i]);
    }
    return str.trim();
  };

  return {
    title: decodeAscii(3, 30),
    artist: decodeAscii(33, 30),
    album: decodeAscii(63, 30),
    year: decodeAscii(93, 4),
  };
}

export function measureAudioDuration(fileOrBlob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const objectUrl = URL.createObjectURL(fileOrBlob);
    audio.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute('src');
      audio.load();
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(0);
    }, 4000);

    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const dur = Math.round(audio.duration || 0);
      cleanup();
      resolve(dur > 0 && isFinite(dur) ? dur : 0);
    };

    audio.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(0);
    };
  });
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
