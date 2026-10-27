import React from 'react';
import { Home, Search, Library, Disc3 } from 'lucide-react';
import { motion } from 'motion/react';
import { useMusic } from '../../context/MusicContext';

export type TabType = 'home' | 'search' | 'library' | 'player';

interface BottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  const { playerState, setIsFullScreenPlayerOpen } = useMusic();

  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'player', label: 'Player', icon: Disc3 },
  ];

  const handleTabPress = (tabId: TabType) => {
    if (tabId === 'player') {
      setIsFullScreenPlayerOpen(true);
    } else {
      onSelectTab(tabId);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3.5 pb-[max(env(safe-area-inset-bottom,0px),0.65rem)] pt-1 select-none pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        {/* iOS Liquid Glass Floating Pill Menu Bar */}
        <div className="relative rounded-[2.2rem] bg-[#E8DDC9]/75 dark:bg-[#141815]/80 backdrop-blur-3xl border border-[#292820]/10 dark:border-white/10 shadow-[0_12px_36px_rgba(41,40,32,0.14)] dark:shadow-[0_14px_44px_rgba(0,0,0,0.7)] p-1.5 transition-all duration-300">
          {/* Specular Liquid Edge Highlight */}
          <div className="absolute inset-x-5 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 dark:via-[#C8F169]/30 to-transparent rounded-full pointer-events-none" />

          <div className="flex items-center justify-around h-13 relative">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              const isPlayingTrack = tab.id === 'player' && playerState.isPlaying;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabPress(tab.id)}
                  className="relative flex-1 flex flex-col items-center justify-center py-1 transition-transform duration-200 active:scale-90 focus:outline-none"
                  aria-label={tab.label}
                >
                  {/* Fluid Liquid Glass Capsule Indicator */}
                  {isActive && tab.id !== 'player' && (
                    <motion.div
                      layoutId="liquidGlassTabIndicator"
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                        mass: 0.8,
                      }}
                      className="absolute inset-0 mx-1 rounded-2xl bg-[#C8F169]/25 dark:bg-[#C8F169]/20 border border-[#176B67]/20 dark:border-[#C8F169]/40 shadow-[0_0_16px_rgba(200,241,105,0.3)] pointer-events-none"
                    />
                  )}

                  <div className="relative z-10 flex flex-col items-center">
                    <Icon
                      className={`w-5 h-5 transition-all duration-200 ${
                        isActive && tab.id !== 'player'
                          ? 'text-[#176B67] dark:text-[#C8F169] scale-110 stroke-[2.4]'
                          : isPlayingTrack
                          ? 'text-[#176B67] dark:text-[#C8F169] animate-spin-slow stroke-[2]'
                          : 'text-[#777267] dark:text-[#92998F] stroke-[1.8] hover:text-[#292820] dark:hover:text-[#E8E9DD]'
                      }`}
                    />
                    <span
                      className={`text-[9.5px] tracking-tight mt-0.5 font-sans transition-colors duration-200 ${
                        isActive && tab.id !== 'player'
                          ? 'text-[#176B67] dark:text-[#C8F169] font-black'
                          : 'text-[#777267] dark:text-[#92998F] font-medium'
                      }`}
                    >
                      {tab.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Discreet Footer Signature: bttm By Ahmed Taboubi */}
          <div className="pt-0.5 pb-0.5 text-center">
            <span className="text-[9px] tracking-widest uppercase font-mono text-[#777267]/75 dark:text-[#92998F]/70 font-semibold select-none">
              bttm <span className="lowercase font-normal tracking-normal text-[#777267]/60 dark:text-[#92998F]/60">By</span> Ahmed Taboubi
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
};
