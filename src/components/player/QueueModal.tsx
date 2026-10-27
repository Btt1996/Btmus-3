import React from 'react';
import { X, Trash2, Music, Play, ChevronUp, ChevronDown } from 'lucide-react';
import { useMusic } from '../../context/MusicContext';
import { formatDuration } from '../../utils/id3Parser';

interface QueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueModal: React.FC<QueueModalProps> = ({ isOpen, onClose }) => {
  const { playerState, playTrack, removeFromQueue, reorderQueue, clearQueue, trackAnalyses } = useMusic();
  const { queue, queueIndex } = playerState;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 pb-[max(calc(env(safe-area-inset-bottom,0px)+1.5rem),2rem)] shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-black dark:text-white">Playback Queue</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {queue.length} track{queue.length !== 1 ? 's' : ''} in queue
            </p>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 1 && (
              <button
                onClick={clearQueue}
                className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-black dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Queue Items */}
        <div className="flex-1 overflow-y-auto space-y-2 py-4 pr-1">
          {queue.length === 0 ? (
            <div className="text-center py-10 text-zinc-400 dark:text-zinc-500 text-xs">
              No tracks in queue. Play any song or playlist from your library.
            </div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex;
              const analysis = trackAnalyses[track.id];

              return (
                <div
                  key={`${track.id}_${idx}`}
                  className={`flex items-center justify-between p-2.5 rounded-2xl transition border ${
                    isCurrent
                      ? 'bg-zinc-200 dark:bg-zinc-800 border-black dark:border-white text-black dark:text-white'
                      : 'bg-zinc-100/70 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800/70 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <button
                    onClick={() => playTrack(track)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0 overflow-hidden relative flex items-center justify-center border border-zinc-300/40 dark:border-zinc-700/40">
                      {track.artworkUrl ? (
                        <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                      )}
                      {isCurrent && (
                        <div className="absolute inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-current animate-pulse" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">#{idx + 1}</span>
                        <p className={`text-xs font-bold truncate ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-800 dark:text-zinc-200'}`}>
                          {track.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-medium">
                        <span>{track.artist}</span>
                        {track.duration ? <span>• {formatDuration(track.duration)}</span> : null}
                        {analysis && (
                          <span className="font-mono text-zinc-500 dark:text-zinc-400">
                            • {analysis.bpm} BPM ({analysis.camelot})
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => reorderQueue(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1 text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-20 transition"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => reorderQueue(idx, idx + 1)}
                      disabled={idx === queue.length - 1}
                      className="p-1 text-zinc-400 hover:text-black dark:hover:text-white disabled:opacity-20 transition"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                      title="Remove from queue"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
