import React, { useState } from 'react';
import { Copy, Check, FileCode, Download, Folder, Terminal, Sparkles, Scissors, EyeOff, Layers } from 'lucide-react';
import { EXTENSION_FILES, ExtensionFile } from '../extensionFiles';
import confetti from 'canvas-confetti';

interface CodeInspectorProps {
  onDownloadZip: () => void;
}

export const CodeInspector: React.FC<CodeInspectorProps> = ({ onDownloadZip }) => {
  const [selectedFile, setSelectedFile] = useState<ExtensionFile>(EXTENSION_FILES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      confetti({ particleCount: 20, spread: 50, origin: { y: 0.8 } });
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadSingleFile = () => {
    const blob = new Blob([selectedFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-white">Full Extension Package Explorer</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Ready to Load
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Inspect all source files included in the downloadable Chrome Extension package. Every file is production-ready for Chrome Manifest V3, including the DevTools Protocol capture worker, visual scroll progress HUD, and the full canvas image editor.
          </p>
        </div>

        <button
          onClick={onDownloadZip}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/20 shrink-0 transition-all active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span>Download All Files (.zip)</span>
        </button>
      </div>

      {/* Explorer Split Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
        {/* Sidebar: File Tree */}
        <div className="md:col-span-4 lg:col-span-3 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 px-2 flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-sky-400" />
            <span>extension_root /</span>
          </div>

          {EXTENSION_FILES.map((file) => {
            const isSelected = selectedFile.path === file.path;
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between gap-2 transition-all ${
                  isSelected
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-slate-500'}`} />
                  <span className="truncate">{file.name}</span>
                </div>

                {file.name === 'editor.html' && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-sans">
                    Editor
                  </span>
                )}
                {file.name === 'manifest.json' && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-sans">
                    MV3
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Main Code View Area */}
        <div className="md:col-span-8 lg:col-span-9 flex flex-col bg-slate-950 min-h-[560px]">
          {/* File Header */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-5 py-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono font-semibold text-slate-100 flex items-center gap-2">
                <span>/{selectedFile.path}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-sans">
                  {selectedFile.language.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{selectedFile.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                onClick={handleDownloadSingleFile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
                title="Download this file"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Code Viewer Body */}
          <div className="flex-1 p-5 overflow-auto bg-slate-950 font-mono text-xs leading-relaxed text-slate-300">
            <pre className="whitespace-pre overflow-x-auto select-text font-mono text-[12px] leading-5">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
