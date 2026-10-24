import React, { useState } from 'react';
import {
  X,
  Copy,
  Download,
  Check,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Layers,
  FileCheck,
  Clock
} from 'lucide-react';
import { CaptureResult } from '../types';
import confetti from 'canvas-confetti';

interface CapturePreviewModalProps {
  result: CaptureResult | null;
  onClose: () => void;
  onOpenEditor?: (dataUrl: string) => void;
}

export const CapturePreviewModal: React.FC<CapturePreviewModalProps> = ({ result, onClose, onOpenEditor }) => {
  const [zoom, setZoom] = useState<number>(100);
  const [copied, setCopied] = useState(false);
  const [pastedImage, setPastedImage] = useState<string | null>(null);

  if (!result) return null;

  const handleCopyAgain = async () => {
    try {
      const item = new ClipboardItem({ 'image/png': result.blob });
      await navigator.clipboard.write([item]);
      setCopied(true);
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = `snapfull_capture_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePasteCheck = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const url = URL.createObjectURL(file);
          setPastedImage(url);
          confetti({ particleCount: 40, spread: 70, origin: { y: 0.6 } });
        }
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Full Page Screenshot Captured
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Ready in Clipboard
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {result.width} × {result.height} px • {formatBytes(result.sizeBytes)} • {result.durationMs}ms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenEditor && (
              <button
                onClick={() => onOpenEditor(result.dataUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm"
              >
                <span>✏️ Edit Screenshot</span>
              </button>
            )}
            <button
              onClick={handleCopyAgain}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-slate-950" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content body: Viewer + Controls */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden">
          {/* Main Screenshot preview viewport */}
          <div className="flex-1 flex flex-col bg-slate-950/60 overflow-hidden relative">
            {/* Zoom toolbar */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-lg p-1 shadow-lg text-slate-300 text-xs">
              <button
                onClick={() => setZoom((z) => Math.max(25, z - 25))}
                className="p-1 hover:bg-slate-800 rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 font-mono text-[11px] min-w-9 text-center">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(200, z + 25))}
                className="p-1 hover:bg-slate-800 rounded transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(100)}
                className="p-1 hover:bg-slate-800 rounded transition-colors ml-1 border-l border-slate-700 pl-1.5"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Scrollable image area */}
            <div className="flex-1 overflow-auto p-6 flex justify-center items-start">
              <div
                style={{ width: `${zoom}%`, transition: 'width 0.15s ease-out' }}
                className="shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-slate-900"
              >
                <img
                  src={result.dataUrl}
                  alt="Captured Full Webpage"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </div>

          {/* Sidebar / Clipboard verification */}
          <div className="w-full md:w-80 p-5 bg-slate-900/70 flex flex-col gap-4 overflow-y-auto">
            {/* Clipboard Status Banner */}
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
              <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                <Check className="w-4 h-4 text-emerald-400" />
                Automatic Clipboard Copy Successful
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                The image is currently held in your system clipboard. You can switch to Slack, Google Docs, Figma, or Photoshop and press <kbd className="px-1 py-0.5 bg-emerald-900/60 rounded text-[10px] font-mono">Ctrl+V</kbd> / <kbd className="px-1 py-0.5 bg-emerald-900/60 rounded text-[10px] font-mono">Cmd+V</kbd> to paste it.
              </p>
            </div>

            {/* Interactive Paste Verification Box */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Test Paste Here</span>
                <span className="text-[10px] font-normal text-slate-400">Ctrl+V / Cmd+V</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Click inside the box below and paste to verify your system clipboard content right now.
              </p>

              <div
                tabIndex={0}
                onPaste={handlePasteCheck}
                className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 focus:border-sky-400 focus:outline-none rounded-lg p-4 text-center cursor-pointer transition-all bg-slate-900/50 min-h-[110px] flex flex-col items-center justify-center gap-2"
              >
                {pastedImage ? (
                  <div className="space-y-1">
                    <img
                      src={pastedImage}
                      alt="Verified paste"
                      className="max-h-20 max-w-full rounded mx-auto border border-slate-700"
                    />
                    <div className="text-[10px] text-emerald-400 font-medium">
                      ✓ Paste verified from clipboard!
                    </div>
                  </div>
                ) : (
                  <>
                    <Copy className="w-5 h-5 text-slate-400" />
                    <span className="text-xs text-slate-400">Click & Press <span className="text-sky-400 font-mono">Ctrl+V</span></span>
                  </>
                )}
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 space-y-2 text-xs">
              <div className="text-slate-400 font-medium text-[11px] uppercase tracking-wider">
                Capture Metadata
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Dimensions:</span>
                <span className="font-mono">{result.width} × {result.height} px</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">File Size:</span>
                <span className="font-mono">{formatBytes(result.sizeBytes)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Color Depth:</span>
                <span>24-bit TrueColor PNG</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Engine:</span>
                <span className="text-sky-400 font-medium">DevTools Protocol (CDP)</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">Duration:</span>
                <span className="font-mono">{result.durationMs}ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
