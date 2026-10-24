import React from 'react';
import { Download, FolderCheck, ToggleRight, Puzzle, Check, ArrowRight, ExternalLink } from 'lucide-react';

interface InstallStepsProps {
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
}

export const InstallSteps: React.FC<InstallStepsProps> = ({ onDownloadZip, isDownloadingZip }) => {
  const steps = [
    {
      num: '01',
      title: 'Get Extension Files (GitHub or ZIP)',
      desc: 'If you cloned this repository from GitHub, the extension is inside the "extension" folder! If running via web, click the button below to download the ready-to-load ZIP.',
      icon: Download,
      action: (
        <button
          onClick={onDownloadZip}
          disabled={isDownloadingZip}
          className="mt-3 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloadingZip ? 'Downloading...' : 'Download SnapFull (.zip)'}</span>
        </button>
      ),
    },
    {
      num: '02',
      title: 'Open Chrome Extensions Page',
      desc: 'Open Google Chrome (or Brave, Edge, Arc) and enter chrome://extensions into your URL search bar.',
      icon: ExternalLink,
      extra: (
        <div className="mt-2 text-[11px] font-mono bg-slate-950 px-3 py-1.5 rounded-lg text-sky-400 border border-slate-800">
          chrome://extensions
        </div>
      ),
    },
    {
      num: '03',
      title: 'Turn ON "Developer Mode"',
      desc: 'In the top-right corner of the Extensions page, toggle the "Developer mode" switch to the ON position.',
      icon: ToggleRight,
      badge: 'Top-Right Toggle',
    },
    {
      num: '04',
      title: 'Click "Load unpacked" & Pick "extension" Folder',
      desc: 'Click "Load unpacked" in the top-left toolbar, then select the "extension" folder inside this repo (containing manifest.json). Do NOT select the repo root.',
      icon: FolderCheck,
      badge: 'Pick "extension" Folder',
      extra: (
        <div className="mt-2 text-[11px] font-mono bg-slate-950 p-2 rounded-lg text-emerald-400 border border-slate-800">
          📁 your-repo / <span className="font-bold underline text-white">extension</span> / manifest.json
        </div>
      ),
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          How to Load SnapFull into Google Chrome
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
          Works seamlessly on Google Chrome, Brave, Microsoft Edge, Arc, and all Chromium browsers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.num}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                    Step {step.num}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-sky-400" />
                  </div>
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">{step.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                {step.extra}
              </div>

              {step.action && <div>{step.action}</div>}
            </div>
          );
        })}
      </div>

      {/* Pro-Tips Callout */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <h4 className="text-xs font-bold text-white flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          Pro-Tips for Everyday Workflow
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="font-semibold text-slate-200 block mb-1">📌 Pin to Toolbar</span>
            Click the puzzle piece icon in Chrome and click the Pin icon next to SnapFull for instant 1-click access.
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="font-semibold text-slate-200 block mb-1">⌨️ Custom Keyboard Shortcut</span>
            Navigate to <code className="text-sky-300 font-mono text-[10px]">chrome://extensions/shortcuts</code> to bind custom keys (e.g. Cmd+Shift+S).
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="font-semibold text-slate-200 block mb-1">🔒 Redact with Blur</span>
            Use the built-in editor to blur sensitive tokens, client emails, and API keys before copying to clipboard!
          </div>
        </div>
      </div>
    </div>
  );
};
