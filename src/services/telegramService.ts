import { TelegramSyncItem, Track } from '../types/music';
import { isTrackInLibrary, saveTrack } from './db';
import { parseAudioMetadata } from '../utils/id3Parser';

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

export async function verifyTelegramBot(botToken: string): Promise<TelegramBotInfo> {
  const cleanToken = botToken.trim();
  if (!cleanToken) {
    throw new Error('Please enter a valid Telegram Bot Token.');
  }

  // 1. Try server-side proxy first (bypasses any browser CORS or network restrictions)
  try {
    const proxyUrl = `/api/telegram/verify?token=${encodeURIComponent(cleanToken)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.ok) return data.result as TelegramBotInfo;
      throw new Error(data.description || 'Invalid Telegram Bot Token');
    }
  } catch (proxyErr: unknown) {
    // If not a token rejection, try direct
    const msg = proxyErr instanceof Error ? proxyErr.message : '';
    if (msg.includes('Invalid') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
      throw proxyErr;
    }
  }

  // 2. Direct Telegram API fallback
  const directUrl = `https://api.telegram.org/bot${cleanToken}/getMe`;
  try {
    const res = await fetch(directUrl);
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || 'Invalid Telegram Bot Token');
    }
    return data.result as TelegramBotInfo;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error verifying bot token';
    throw new Error(msg);
  }
}

export async function fetchTelegramAudioTracks(botToken: string): Promise<TelegramSyncItem[]> {
  const cleanToken = botToken.trim();
  let updates: Array<{
    message?: Record<string, unknown>;
    channel_post?: Record<string, unknown>;
  }> = [];

  // 1. Try server proxy first
  try {
    const proxyUrl = `/api/telegram/updates?token=${encodeURIComponent(cleanToken)}&limit=100`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        updates = data.result || [];
      } else {
        throw new Error(data.description || 'Failed to fetch updates from Telegram');
      }
    } else {
      throw new Error(`Proxy responded with status ${res.status}`);
    }
  } catch {
    // 2. Direct fallback
    const directUrl = `https://api.telegram.org/bot${cleanToken}/getUpdates?limit=100&allowed_updates=["message","channel_post"]`;
    const res = await fetch(directUrl);
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || 'Failed to fetch updates from Telegram');
    }
    updates = data.result || [];
  }

  const discovered: TelegramSyncItem[] = [];

  for (const update of updates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (update.message || update.channel_post) as any;
    if (!msg) continue;

    let audioInfo: {
      fileId: string;
      fileUniqueId: string;
      fileName: string;
      title?: string;
      performer?: string;
      duration?: number;
      fileSize: number;
      mimeType: string;
    } | null = null;

    if (msg.audio) {
      audioInfo = {
        fileId: msg.audio.file_id,
        fileUniqueId: msg.audio.file_unique_id || msg.audio.file_id,
        fileName: msg.audio.file_name || `${msg.audio.title || 'Audio'}.mp3`,
        title: msg.audio.title,
        performer: msg.audio.performer,
        duration: msg.audio.duration,
        fileSize: msg.audio.file_size || 0,
        mimeType: msg.audio.mime_type || 'audio/mpeg',
      };
    } else if (msg.document) {
      const mime = (msg.document.mime_type || '').toLowerCase();
      const name = (msg.document.file_name || '').toLowerCase();
      const isAudio =
        mime.startsWith('audio/') ||
        ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg'].some((ext) => name.endsWith(ext));

      if (isAudio) {
        audioInfo = {
          fileId: msg.document.file_id,
          fileUniqueId: msg.document.file_unique_id || msg.document.file_id,
          fileName: msg.document.file_name || 'Document Audio.mp3',
          fileSize: msg.document.file_size || 0,
          mimeType: msg.document.mime_type || 'audio/mpeg',
        };
      }
    }

    if (audioInfo) {
      const chatTitle =
        msg.chat?.title ||
        (msg.chat?.first_name ? `${msg.chat.first_name} ${msg.chat.last_name || ''}`.trim() : 'Telegram Chat');

      // CRITICAL: Check if this file is ACTUALLY saved in the user's library
      const isImported = await isTrackInLibrary(
        audioInfo.fileId,
        audioInfo.fileUniqueId,
        audioInfo.fileName
      );

      discovered.push({
        ...audioInfo,
        chatId: msg.chat?.id || 0,
        chatTitle,
        topicId: msg.message_thread_id,
        topicName: msg.reply_to_message?.forum_topic_created?.name,
        messageId: msg.message_id,
        date: msg.date ? msg.date * 1000 : Date.now(),
        isAlreadyImported: isImported,
      });
    }
  }

  return discovered;
}

export async function downloadTelegramAudio(
  botToken: string,
  item: TelegramSyncItem,
  onProgress?: (bytes: number, total: number) => void
): Promise<Track> {
  const cleanToken = botToken.trim();

  // 1. Get File Path
  let filePath = '';

  // Try server proxy for file-info first
  try {
    const proxyInfoUrl = `/api/telegram/file-info?token=${encodeURIComponent(cleanToken)}&file_id=${encodeURIComponent(item.fileId)}`;
    const infoRes = await fetch(proxyInfoUrl);
    if (infoRes.ok) {
      const infoData = await infoRes.json();
      if (infoData.ok && infoData.result?.file_path) {
        filePath = infoData.result.file_path;
      } else if (infoData.description) {
        // e.g. File is too big (> 20MB limit for Telegram bots)
        throw new Error(infoData.description);
      }
    }
  } catch (proxyErr) {
    if (proxyErr instanceof Error && proxyErr.message.includes('too big')) {
      throw proxyErr;
    }
  }

  // Fallback to direct getFile if needed
  if (!filePath) {
    const directInfoUrl = `https://api.telegram.org/bot${cleanToken}/getFile?file_id=${encodeURIComponent(item.fileId)}`;
    const infoRes = await fetch(directInfoUrl);
    const infoData = await infoRes.json();
    if (!infoData.ok || !infoData.result?.file_path) {
      throw new Error(infoData.description || 'Could not retrieve Telegram file path from Telegram.');
    }
    filePath = infoData.result.file_path;
  }

  // 2. Fetch binary audio stream
  let res: Response;
  const proxyDownloadUrl = `/api/telegram/download?token=${encodeURIComponent(cleanToken)}&file_path=${encodeURIComponent(filePath)}`;

  try {
    res = await fetch(proxyDownloadUrl);
    if (!res.ok) {
      throw new Error(`Proxy error ${res.status}`);
    }
  } catch {
    // If proxy failed, try direct Telegram URL
    const directDownloadUrl = `https://api.telegram.org/file/bot${cleanToken}/${filePath}`;
    res = await fetch(directDownloadUrl);
  }

  if (!res.ok) {
    throw new Error(`Failed to download audio file: HTTP ${res.status}`);
  }

  const contentLength = res.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : item.fileSize || 0;

  let blob: Blob;

  if (res.body && window.ReadableStream) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (onProgress) onProgress(received, total || received);
      }
    }

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    blob = new Blob([merged], { type: item.mimeType || 'audio/mpeg' });
  } else {
    blob = await res.blob();
    if (onProgress) onProgress(blob.size, blob.size);
  }

  if (blob.size === 0) {
    throw new Error('Downloaded audio file was empty (0 bytes).');
  }

  // 3. Extract ID3 tags & duration
  const parsed = await parseAudioMetadata(blob, item.fileName);

  const title = item.title?.trim() || parsed.title || item.fileName.replace(/\.[^/.]+$/, '');
  const artist = item.performer?.trim() || parsed.artist || 'Unknown Artist';
  const duration = item.duration && item.duration > 0 ? item.duration : parsed.duration;

  const trackId = `tg_${item.fileUniqueId || Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const track: Track = {
    id: trackId,
    title,
    artist,
    album: parsed.album || item.chatTitle || 'Telegram Audio',
    duration,
    fileSize: blob.size,
    mimeType: blob.type || item.mimeType,
    fileName: item.fileName,
    fileHash: item.fileUniqueId,
    downloadDate: Date.now(),
    isFavorite: false,
    playCount: 0,
    artworkUrl: parsed.artworkUrl,
    telegramSource: {
      chatId: item.chatId,
      chatTitle: item.chatTitle,
      topicId: item.topicId,
      topicName: item.topicName,
      messageId: item.messageId,
      fileId: item.fileId,
      sourceType: 'bot',
    },
  };

  // 4. Save to IndexedDB
  await saveTrack(track, blob);

  return track;
}
