import React from 'react';
import { X, Music, HardDrive, Calendar, PlayCircle, Send, Trash2, Heart, ListPlus, Sparkles, Activity } from 'lucide-react';
import { Track, TrackAnalysis } from '../../types/music';
import { formatDuration, formatFileSize } from '../../utils/id3Parser';

interface TrackDetailModalProps {
  track: Track | null;
  analysis?: TrackAnalysis;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (trackId: string) => void;
  onToggleFavorite: (trackId: string) => void;
  onAddToPlaylist: (track: Track) => void;
}

export const TrackDetailModal: React.FC<TrackDetailModalProps> = ({
  track,
  analysis,
  isOpen,
  onClose,
  onDelete,
  onToggleFavorite,
  onAddToPlaylist,
}) => {
  if (!isOpen || !track) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 pb-[max(calc(env(safe-area-inset-bottom,0px)+1.5rem),2rem)] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-black dark:text-white">Song Information</h3>
            <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white text-[10px] font-bold">
              Btt Music
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-black dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Artwork & Title */}
        <div className="flex items-center gap-3.5 my-4 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <div className="w-14 h-14 rounded-xl bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-zinc-300 dark:border-zinc-700">
            {track.artworkUrl ? (
              <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <img src="/app-logo.png" alt="Btt Music" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-black dark:text-white truncate">{track.title}</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{track.artist}</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{track.album}</p>
          </div>
        </div>

        {/* Acoustic Analysis Card if Available */}
        {analysis && (
          <div className="mb-3 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Btt Smart Mix Acoustic Profile
              </span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-mono text-[10px] font-bold">
                Camelot {analysis.camelot}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 text-[10px] block">Tempo / BPM</span>
                <span className="text-black dark:text-white font-mono font-bold text-xs">{analysis.bpm} BPM</span>
              </div>
              <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 text-[10px] block">Key & Scale</span>
                <span className="text-black dark:text-white font-mono font-bold text-xs">{analysis.key}</span>
              </div>
              <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 text-[10px] block">Energy</span>
                <span className="text-black dark:text-white font-mono font-bold text-xs">
                  {Math.round(analysis.energy * 100)}%
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 text-[10px] block">Silence Trimmed</span>
                <span className="text-black dark:text-white font-mono font-bold text-xs">
                  +{analysis.introSilenceDuration.toFixed(1)}s / -{analysis.outroSilenceDuration.toFixed(1)}s
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Technical Metadata Grid */}
        <div className="space-y-2.5 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/70">
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> File Size & Format
            </span>
            <span className="font-mono text-black dark:text-white">
              {formatFileSize(track.fileSize)} ({track.mimeType || 'audio/mpeg'})
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/70">
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" /> Duration
            </span>
            <span className="font-mono text-black dark:text-white">{formatDuration(track.duration)}</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/70">
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Download Date
            </span>
            <span className="text-black dark:text-white">
              {new Date(track.downloadDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/70">
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <PlayCircle className="w-3.5 h-3.5" /> Playback Statistics
            </span>
            <span className="text-black dark:text-white">
              {track.playCount || 0} plays
              {track.lastPlayedAt ? ` (Last: ${new Date(track.lastPlayedAt).toLocaleDateString()})` : ''}
            </span>
          </div>

          {/* Telegram Source Info */}
          <div className="p-3 rounded-xl bg-zinc-100/70 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/70 space-y-1">
            <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
              <Send className="w-3.5 h-3.5" /> Origin Source
            </span>
            {track.telegramSource ? (
              <div className="text-[11px] text-zinc-700 dark:text-zinc-300 pl-5 space-y-0.5">
                <p>
                  Chat / Channel:{' '}
                  <strong className="text-black dark:text-white">
                    {track.telegramSource.chatTitle || 'Direct Telegram'}
                  </strong>
                </p>
                {track.telegramSource.topicName && (
                  <p>
                    Topic: <span>{track.telegramSource.topicName}</span>
                  </p>
                )}
                <p className="text-zinc-400 font-mono text-[10px]">
                  File: {track.fileName}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pl-5">
                Manual Local Import ({track.fileName})
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 mt-2">
          <button
            onClick={() => onToggleFavorite(track.id)}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              track.isFavorite
                ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-bold'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${track.isFavorite ? 'fill-current' : ''}`} />
            {track.isFavorite ? 'Favorited' : 'Favorite'}
          </button>

          <button
            onClick={() => {
              onClose();
              onAddToPlaylist(track);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-black dark:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <ListPlus className="w-3.5 h-3.5" />
            Playlist
          </button>

          <button
            onClick={() => {
              onClose();
              onDelete(track.id);
            }}
            className="py-2.5 px-3 rounded-xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            title="Delete song from local storage"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
