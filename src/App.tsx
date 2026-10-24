/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { LiveSimulator } from './components/LiveSimulator';
import { CodeInspector } from './components/CodeInspector';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import { InstallSteps } from './components/InstallSteps';
import { CapturePreviewModal } from './components/CapturePreviewModal';
import { ImageEditor } from './components/ImageEditor';
import { CaptureResult } from './types';
import { generateExtensionZip, downloadBlob } from './utils/zipGenerator';
import confetti from 'canvas-confetti';
import {
  Camera,
  Download,
  Copy,
  Scissors,
  CheckCircle2,
  Sparkles,
  Zap,
  Layers,
  Shield,
  ArrowRight
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'files' | 'architecture' | 'guide'>('simulator');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Modals
  const [currentCaptureResult, setCurrentCaptureResult] = useState<CaptureResult | null>(null);
  const [activeEditorImage, setActiveEditorImage] = useState<string | null>(null);

  // Global ZIP generator
  const handleDownloadExtensionZip = async () => {
    setIsDownloadingZip(true);
    try {
      const zipBlob = await generateExtensionZip();
      downloadBlob(zipBlob, 'snapfull-chrome-extension.zip');
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      console.error('Failed to create extension zip:', err);
      alert('Error generating zip: ' + (err as Error).message);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onDownloadZip={handleDownloadExtensionZip}
        isDownloadingZip={isDownloadingZip}
      />

      {/* Main Content Area */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Quick Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
              <Camera className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-[11px] font-semibold text-white truncate">DevTools CDP Engine</div>
              <div className="text-[10px] text-slate-400 truncate">Page.captureScreenshot</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Copy className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-[11px] font-semibold text-white truncate">Auto-Copy Clipboard</div>
              <div className="text-[10px] text-slate-400 truncate">Instant Ctrl+V / Cmd+V</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-[11px] font-semibold text-white truncate">Visual Scroll Indicator</div>
              <div className="text-[10px] text-slate-400 truncate">Dynamic Height Alerts</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <Scissors className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-[11px] font-semibold text-white truncate">Built-in Image Editor</div>
              <div className="text-[10px] text-slate-400 truncate">Crop, Blur, Text Notes</div>
            </div>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'simulator' && (
          <LiveSimulator
            onCaptureCompleted={(result) => setCurrentCaptureResult(result)}
            onOpenEditorForImage={(dataUrl) => setActiveEditorImage(dataUrl)}
          />
        )}

        {activeTab === 'files' && (
          <CodeInspector onDownloadZip={handleDownloadExtensionZip} />
        )}

        {activeTab === 'architecture' && <ArchitectureGuide />}

        {activeTab === 'guide' && (
          <InstallSteps
            onDownloadZip={handleDownloadExtensionZip}
            isDownloadingZip={isDownloadingZip}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">SnapFull Chrome Extension</span>
            <span>• Manifest V3 ready • Auto-Copy to Clipboard</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <button
              onClick={() => setActiveTab('simulator')}
              className="hover:text-slate-200 transition-colors"
            >
              Live Simulator
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className="hover:text-slate-200 transition-colors"
            >
              Extension Files
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className="hover:text-slate-200 transition-colors"
            >
              Install Guide
            </button>
            <button
              onClick={handleDownloadExtensionZip}
              className="text-sky-400 hover:text-sky-300 font-semibold"
            >
              Download ZIP
            </button>
          </div>
        </div>
      </footer>

      {/* Capture Result Inspector Modal */}
      {currentCaptureResult && (
        <CapturePreviewModal
          result={currentCaptureResult}
          onClose={() => setCurrentCaptureResult(null)}
          onOpenEditor={(dataUrl) => {
            setCurrentCaptureResult(null);
            setActiveEditorImage(dataUrl);
          }}
        />
      )}

      {/* Full-Screen Image Editor Modal */}
      {activeEditorImage && (
        <ImageEditor
          initialImageSrc={activeEditorImage}
          onClose={() => setActiveEditorImage(null)}
        />
      )}
    </div>
  );
}
