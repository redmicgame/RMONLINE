import React from 'react';
import { useGame } from '../context/GameContext';
import { useOnline } from '../context/OnlineContext';
import HomeTab from './HomeTab';
import AppsTab from './AppsTab';
import MiscTab from './MiscTab';
import BusinessTab from './BusinessTab';
import BottomNav from './BottomNav';

const GameUI: React.FC = () => {
    const { gameState } = useGame();
    const { activeTab } = gameState;
    const { globalDate, formattedCountdown, activeOnlineArtistsCount } = useOnline();

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'Home':
                return <HomeTab />;
            case 'Apps':
                return <AppsTab />;
            case 'Charts':
                return <HomeTab />;
            case 'Business':
                return <BusinessTab />;
            case 'Misc':
                return <MiscTab />;
            default:
                return <HomeTab />;
        }
    };

    return (
        <div className="h-full w-full flex flex-col bg-zinc-900 text-white relative">
            <main className="flex-1 overflow-y-auto pb-28 -webkit-overflow-scrolling-touch">
                {renderActiveTab()}
            </main>

            <div className="absolute z-20 bottom-24 right-4 bg-zinc-950/90 backdrop-blur-md border border-zinc-700/80 text-white px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-none">
                <div className="flex flex-col text-right leading-tight">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        W{globalDate.week} • {globalDate.year} • {activeOnlineArtistsCount} Online
                    </span>
                    <span className="text-xs font-black font-mono text-red-400">
                        Next Week {formattedCountdown}
                    </span>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <BottomNav />
        </div>
    );
};

export default GameUI;
