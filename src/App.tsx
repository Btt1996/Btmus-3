import React, { useState, useRef, useEffect, Suspense } from 'react';
import { MusicProvider, useMusic } from './context/MusicContext';
import { BottomNav, TabType } from './components/navigation/BottomNav';
import { MiniPlayer } from './components/player/MiniPlayer';
import { FullScreenPlayer } from './components/player/FullScreenPlayer';
import { HomeScreen } from './components/screens/HomeScreen';
import { LibraryScreen } from './components/screens/LibraryScreen';
import { Toast } from './components/common/Toast';
import { parseAudioMetadata } from './utils/id3Parser';
import { saveTrack, savePlaylist } from './services/db';
import { Track, Playlist } from './types/music';
import { Sun, Moon, Settings as SettingsIcon, Plus, X } from 'lucide-react';

// Code-split secondary screens for smaller initial bundle weight on iOS PWAs
const SearchScreen = React.lazy(() =>
  import('./components/screens/SearchScreen').then((m) => ({ default: m.SearchScreen }))
);
const PlaylistsScreen = React.lazy(() =>
  import('./components/screens/PlaylistsScreen').then((m) => ({ default: m.PlaylistsScreen }))
);
const SyncScreen = React.lazy(() =>
  import('./components/screens/SyncScreen').then((m) => ({ default: m.SyncScreen }))
);
const SettingsScreen = React.lazy(() =>
  import('./components/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);

function ScreenLoadingFallback() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[50vh] text-center select-none">
      <div className="w-12 h-12 rounded-2xl bg-[#E8DDC9]/70 dark:bg-[#141815]/70 border border-[#176B67]/20 dark:border-[#C8F169]/30 flex items-center justify-center animate-pulse shadow-sm mb-3">
        <div className="w-5 h-5 rounded-full border-2 border-[#176B67] dark:border-[#C8F169] border-t-transparent animate-spin" />
      </div>
      <p className="text-xs font-mono uppercase tracking-wider text-[#777267] dark:text-[#92998F]">
        Loading screen...
      </p>
    </div>
  );
}

function MainLayout() {
  const [currentTab, setCurrentTab] = useState<TabType | 'playlists' | 'sync' | 'settings' | 'search'>('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('bttm_theme_mode');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const { toastMessage, playerState, refreshLibrary, showToast, playlists, settings } = useMusic();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync theme class to documentElement and persist
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('bttm_theme_mode', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('bttm_theme_mode', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
    showToast(!isDarkMode ? 'Dark Mode enabled' : 'Champagne Light Mode enabled');
  };

  const handleGlobalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let successCount = 0;
    const importedIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const meta = await parseAudioMetadata(file, file.name);
        const trackId = `local_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

        const track: Track = {
          id: trackId,
          title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: meta.artist || 'Unknown Artist',
          album: meta.album || 'My Files',
          duration: meta.duration || 0,
          fileSize: file.size,
          mimeType: file.type || 'audio/mpeg',
          fileName: file.name,
          downloadDate: Date.now(),
          isFavorite: false,
          playCount: 0,
          artworkUrl: meta.artworkUrl,
          telegramSource: {
            chatTitle: 'Imported Audio',
            sourceType: 'manual',
          },
        };

        await saveTrack(track, file);
        importedIds.push(trackId);
        successCount++;
      } catch (err) {
        console.warn('Error importing file:', file.name, err);
      }
    }

    if (importedIds.length > 0 && settings.autoCreatePlaylists) {
      const plName = 'Imported Music';
      const existingPl = playlists.find((p) => p.name === plName);
      if (existingPl) {
        const merged = Array.from(new Set([...existingPl.trackIds, ...importedIds]));
        await savePlaylist({ ...existingPl, trackIds: merged, updatedAt: Date.now() });
      } else {
        const newPl: Playlist = {
          id: `pl_${Date.now()}`,
          name: plName,
          sourceType: 'manual',
          trackIds: importedIds,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await savePlaylist(newPl);
      }
    }

    await refreshLibrary();
    showToast(`Imported ${successCount} track${successCount !== 1 ? 's' : ''}!`);
    e.target.value = '';
  };

  const handleOpenPlaylist = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setCurrentTab('playlists');
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F3EBDD] dark:bg-[#080A09] text-[#292820] dark:text-[#E8E9DD] flex flex-col justify-between selection:bg-[#C8F169] selection:text-[#292820] dark:selection:bg-[#C8F169] dark:selection:text-[#080A09] transition-colors duration-300">
      {/* Hidden Global Audio File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
        onChange={handleGlobalFiles}
        className="hidden"
      />

      {/* iOS Liquid Glass Top Header Bar: bttm By Ahmed Taboubi */}
      <header className="sticky top-0 z-30 pt-safe bg-[#E8DDC9]/80 dark:bg-[#141815]/85 backdrop-blur-3xl border-b border-[#292820]/10 dark:border-white/10 px-4 py-2.5 flex items-center justify-between select-none transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg overflow-hidden border border-[#176B67]/30 dark:border-[#C8F169]/40 shadow-xs shrink-0">
            <img src="/app-logo.png" alt="BttM" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono font-black tracking-widest text-[11px] uppercase text-[#176B67] dark:text-[#C8F169]">
              bttm <span className="lowercase font-normal tracking-normal text-[#777267] dark:text-[#92998F]">By</span> Ahmed Taboubi
            </span>
          </div>
        </div>

        {/* Quick Actions Right: Import, Theme Toggle, Settings */}
        <div className="flex items-center gap-1.5">
          {/* Quick Add Audio Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/30 dark:hover:bg-[#C8F169]/20 text-[#292820] dark:text-[#E8E9DD] border border-[#292820]/10 dark:border-white/10 transition active:scale-90"
            title="Import audio file"
            aria-label="Import audio"
          >
            <Plus className="w-4 h-4 text-[#176B67] dark:text-[#C8F169]" />
          </button>

          {/* Theme Toggle (Champagne Light / Cinematic Dark) */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/30 dark:hover:bg-[#C8F169]/20 text-[#292820] dark:text-[#E8E9DD] border border-[#292820]/10 dark:border-white/10 transition active:scale-90"
            title={isDarkMode ? 'Switch to Warm Champagne Light' : 'Switch to Cinematic Dark'}
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-[#C8F169]" />
            ) : (
              <Moon className="w-4 h-4 text-[#176B67]" />
            )}
          </button>

          {/* Settings Drawer Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-[#E8DDC9] dark:bg-[#141815] hover:bg-[#C8F169]/30 dark:hover:bg-[#C8F169]/20 text-[#292820] dark:text-[#E8E9DD] border border-[#292820]/10 dark:border-white/10 transition active:scale-90"
            title="Settings & Diagnostics"
            aria-label="Settings"
          >
            <SettingsIcon className="w-4 h-4 text-[#777267] dark:text-[#92998F]" />
          </button>
        </div>
      </header>

      {/* Main View Area with spacious safe-area padding so player & bar never overlap content */}
      <main
        className={`flex-1 flex flex-col ${
          playerState.currentTrack
            ? 'pb-[calc(11.5rem+env(safe-area-inset-bottom,0px))]'
            : 'pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]'
        }`}
      >
        {currentTab === 'home' && (
          <HomeScreen
            onGoToTab={(tab) => {
              setSelectedPlaylistId(null);
              setCurrentTab(tab);
            }}
            onOpenPlaylist={handleOpenPlaylist}
            onTriggerFileInput={() => fileInputRef.current?.click()}
          />
        )}

        <Suspense fallback={<ScreenLoadingFallback />}>
          {currentTab === 'search' && <SearchScreen />}

          {currentTab === 'library' && <LibraryScreen />}

          {currentTab === 'playlists' && (
            <PlaylistsScreen
              selectedPlaylistId={selectedPlaylistId}
              onClearSelectedPlaylist={() => setSelectedPlaylistId(null)}
            />
          )}

          {(currentTab === 'import' || currentTab === 'sync') && <SyncScreen fileInputRef={fileInputRef} />}

          {currentTab === 'settings' && <SettingsScreen />}
        </Suspense>
      </main>

      {/* Persistent Mini Player */}
      <MiniPlayer />

      {/* Fullscreen Player Modal with Circular Dial */}
      <FullScreenPlayer />

      {/* Liquid Glass Bottom Navigation (4 tabs: Home, Library, Playlists, Import) */}
      <BottomNav
        currentTab={
          currentTab === 'library' || currentTab === 'playlists' || currentTab === 'import'
            ? currentTab
            : currentTab === 'sync'
            ? 'import'
            : 'home'
        }
        onSelectTab={(tab) => {
          setSelectedPlaylistId(null);
          setCurrentTab(tab);
        }}
      />

      {/* Liquid Glass Settings Screen Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#F3EBDD] dark:bg-[#080A09] text-[#292820] dark:text-[#E8E9DD] animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="sticky top-0 z-30 pt-safe bg-[#E8DDC9]/90 dark:bg-[#141815]/90 backdrop-blur-3xl border-b border-[#292820]/10 dark:border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black text-[#176B67] dark:text-[#C8F169] uppercase tracking-wider">
                BttM Preferences
              </span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-2 rounded-full bg-[#E8DDC9] dark:bg-[#141815] border border-[#292820]/10 dark:border-white/10 text-[#292820] dark:text-[#E8E9DD] active:scale-90 transition"
              aria-label="Close Settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pb-12">
            <Suspense fallback={<ScreenLoadingFallback />}>
              <SettingsScreen />
            </Suspense>
          </div>
        </div>
      )}

      {/* Global Toast */}
      <Toast message={toastMessage} />
    </div>
  );
}

export default function App() {
  return (
    <MusicProvider>
      <MainLayout />
    </MusicProvider>
  );
}
