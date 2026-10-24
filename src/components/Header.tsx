import React from 'react';
import { Camera, Download, Sparkles, BookOpen, Layers, Terminal, Scissors } from 'lucide-react';

interface HeaderProps {
  activeTab: 'simulator' | 'files' | 'architecture' | 'guide';
  setActiveTab: (tab: 'simulator' | 'files' | 'architecture' | 'guide') => void;
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onDownloadZip,
  isDownloadingZip,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-sky-500 to-cyan-400 p-0.5 shadow-lg shadow-sky-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Camera className="w-5 h-5 text-sky-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">SnapFull</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Manifest V3
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              DevTools Full Page Capture to Clipboard + Image Editor Extension
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'simulator'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live Testbed</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'files'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Extension Source</span>
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'architecture'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>DevTools CDP & Editor</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'guide'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Chrome Install Guide</span>
          </button>
        </nav>

        {/* 1-Click ZIP Download Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadZip}
            disabled={isDownloadingZip}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 transition-all active:scale-95 disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isDownloadingZip ? 'Packaging Extension...' : 'Download Extension (.zip)'}
            </span>
            <span className="sm:hidden">Download</span>
          </button>
        </div>
      </div>
    </header>
  );
};
