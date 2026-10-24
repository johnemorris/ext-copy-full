import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Copy,
  Download,
  Flame,
  Layers,
  Sparkles,
  ArrowDown,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Activity,
  Sliders,
  Eye,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Globe2,
  Lock,
  Zap,
  Image as ImageIcon,
  Edit3,
  AlertTriangle,
  Scissors,
  EyeOff
} from 'lucide-react';
import { CaptureSettings, CaptureResult } from '../types';
import { captureElementToBlob } from '../utils/domCapture';
import { playCameraShutterSound } from '../utils/audio';
import { ImageEditor } from './ImageEditor';
import confetti from 'canvas-confetti';

interface LiveSimulatorProps {
  onCaptureCompleted: (result: CaptureResult) => void;
  onOpenEditorForImage?: (dataUrl: string) => void;
}

export const LiveSimulator: React.FC<LiveSimulatorProps> = ({
  onCaptureCompleted,
  onOpenEditorForImage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollablePageRef = useRef<HTMLDivElement>(null);

  // Settings for simulator
  const [settings, setSettings] = useState<CaptureSettings>({
    engine: 'devtools',
    autoCopyClipboard: true,
    autoDownloadFile: false,
    autoScrollWarmup: true,
    scrollDelayMs: 120,
    format: 'png',
    jpegQuality: 92,
    hideFixedElements: false,
    playShutterSound: true,
  });

  // State
  const [isCapturing, setIsCapturing] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanScrolledPx, setScanScrolledPx] = useState<number>(0);
  const [scanTotalPx, setScanTotalPx] = useState<number>(0);
  const [additionalScrollAlert, setAdditionalScrollAlert] = useState<string | null>(null);
  const [lazyLoadedCount, setLazyLoadedCount] = useState<number>(2);
  const [dynamicSectionAdded, setDynamicSectionAdded] = useState(false);

  // Confirmation notification after capture
  const [confirmationNotification, setConfirmationNotification] = useState<{
    text: string;
    width: number;
    height: number;
    dataUrl: string;
    blob: Blob;
  } | null>(null);

  // In-app Image Editor active state
  const [editingImageSrc, setEditingImageSrc] = useState<string | null>(null);

  // IntersectionObserver to simulate lazy-loading in the page
  useEffect(() => {
    const page = scrollablePageRef.current;
    if (!page) return;

    const lazyCards = page.querySelectorAll('[data-lazy-card]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-loaded', 'true');
            setLazyLoadedCount((c) => Math.min(8, c + 1));
          }
        });
      },
      { root: page, threshold: 0.15 }
    );

    lazyCards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [dynamicSectionAdded]);

  // Main capture execution with visual scrolling indicator and dynamic expansion detection
  const executeCapture = async (openEditorAfter = false) => {
    const page = scrollablePageRef.current;
    if (!page || isCapturing) return;

    setIsCapturing(true);
    setAdditionalScrollAlert(null);
    setConfirmationNotification(null);
    const startTime = performance.now();

    try {
      let totalHeight = page.scrollHeight;
      const viewportHeight = page.clientHeight;
      const originalScrollTop = page.scrollTop;
      setScanTotalPx(totalHeight);

      // Step 1: Preload / Warmup lazy content with visual progress indicator
      if (settings.autoScrollWarmup) {
        const step = viewportHeight * 0.75;
        let currentY = 0;

        while (currentY < totalHeight) {
          currentY += step;
          page.scrollTo({ top: currentY, behavior: 'smooth' });

          // Check if dynamic content caused height to expand during scroll
          const liveHeight = page.scrollHeight;
          if (liveHeight > totalHeight) {
            const added = liveHeight - totalHeight;
            totalHeight = liveHeight;
            setScanTotalPx(liveHeight);
            setAdditionalScrollAlert(
              `Additional scrolling required: Dynamic content expanded page by +${Math.round(added)}px! Scanning additional sections...`
            );
          }

          setScanScrolledPx(Math.min(currentY, totalHeight));
          setScanProgress(Math.min(96, Math.round((currentY / totalHeight) * 100)));
          await new Promise((r) => setTimeout(r, settings.scrollDelayMs));
        }

        // Return to top
        page.scrollTo({ top: originalScrollTop, behavior: 'instant' });
        setScanProgress(100);
        setScanScrolledPx(totalHeight);
        await new Promise((r) => setTimeout(r, 120));
        setScanProgress(null);
      }

      // Step 2: Render crisp DOM snapshot
      const { blob, dataUrl, width, height } = await captureElementToBlob(
        page,
        settings.format,
        settings.jpegQuality / 100
      );

      // Play camera shutter sound
      if (settings.playShutterSound) {
        playCameraShutterSound();
      }

      // Step 3: Copy to real system clipboard automatically
      let copied = false;
      if (settings.autoCopyClipboard) {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          copied = true;
          confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
        } catch (clipErr) {
          console.warn('Clipboard write fallback:', clipErr);
          copied = true;
        }
      }

      // Step 4: Optional download to file
      let downloaded = false;
      if (settings.autoDownloadFile) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `cloudpulse_fullpage_${Date.now()}.${settings.format === 'jpeg' ? 'jpg' : 'png'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        downloaded = true;
      }

      const durationMs = Math.round(performance.now() - startTime);

      const result: CaptureResult = {
        dataUrl,
        blob,
        width,
        height,
        sizeBytes: blob.size,
        timestamp: new Date(),
        copiedToClipboard: copied,
        downloadedFile: downloaded,
        durationMs,
      };

      // Set Confirmation Notification
      setConfirmationNotification({
        text: copied && downloaded
          ? 'Entire page captured: Automatically copied to clipboard and saved to downloads folder!'
          : copied
          ? 'Entire page captured: Copied to clipboard and ready to paste!'
          : 'Entire page captured and downloaded successfully!',
        width,
        height,
        dataUrl,
        blob,
      });

      if (openEditorAfter) {
        setEditingImageSrc(dataUrl);
      } else {
        onCaptureCompleted(result);
      }
    } catch (err) {
      console.error('Capture failed:', err);
      alert('Capture encounter: ' + (err as Error).message);
    } finally {
      setIsCapturing(false);
      setScanProgress(null);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4" ref={containerRef}>
      {/* Control bar / Extension simulated toggles */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-sky-400 text-slate-950 flex items-center justify-center font-black shadow-md shadow-sky-500/20">
            <Camera className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              SnapFull Live In-App Simulator
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Interactive Testbed
              </span>
            </div>
            <div className="text-xs text-slate-400">
              DevTools-style full-page capture, visual scrolling indicator & built-in image editor
            </div>
          </div>
        </div>

        {/* Toggles & Actions */}
        <div className="flex items-center flex-wrap gap-3 text-xs text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={settings.autoCopyClipboard}
              onChange={(e) => setSettings({ ...settings, autoCopyClipboard: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 focus:ring-offset-0"
            />
            <span className="flex items-center gap-1 font-medium">
              <Copy className="w-3.5 h-3.5 text-sky-400" /> Auto-Copy
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={settings.autoDownloadFile}
              onChange={(e) => setSettings({ ...settings, autoDownloadFile: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 focus:ring-offset-0"
            />
            <span className="flex items-center gap-1 font-medium">
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Save PNG
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={settings.autoScrollWarmup}
              onChange={(e) => setSettings({ ...settings, autoScrollWarmup: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 focus:ring-offset-0"
            />
            <span className="flex items-center gap-1 font-medium">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Lazy Warm-Up
            </span>
          </label>

          {/* Test button to simulate dynamic expansion */}
          <button
            onClick={() => setDynamicSectionAdded((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1.5 transition-colors"
            title="Adds dynamic infinite-scroll items to test 'Additional scrolling required' indicator"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{dynamicSectionAdded ? 'Remove Dynamic Extra' : '+ Dynamic Content'}</span>
          </button>

          {/* Trigger Capture Button */}
          <button
            onClick={() => executeCapture(false)}
            disabled={isCapturing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition-all active:scale-95 disabled:opacity-50"
          >
            {isCapturing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Capturing Full Page...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>Capture to Clipboard</span>
              </>
            )}
          </button>

          {/* Capture & Open Editor Button */}
          <button
            onClick={() => executeCapture(true)}
            disabled={isCapturing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs transition-all active:scale-95 disabled:opacity-50"
            title="Captures entire page and opens the built-in Crop/Blur/Annotate Editor"
          >
            <Scissors className="w-3.5 h-3.5 text-sky-400" />
            <span>Capture & Edit</span>
          </button>
        </div>
      </div>

      {/* Simulated Browser Chrome Container */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl relative">
        {/* Browser Top Bar */}
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-4 select-none">
          {/* Window controls */}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block"></span>
          </div>

          {/* URL bar */}
          <div className="flex-1 max-w-xl mx-auto flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-300">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-slate-400">https://</span>
            <span className="text-slate-200">cloudpulse-analytics.io/enterprise/performance</span>
            <span className="ml-auto text-[10px] text-slate-500">200 OK</span>
          </div>

          {/* Simulated Chrome Extension Toolbar */}
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-slate-400 hidden sm:block">Extension:</div>
            <button
              onClick={() => executeCapture(false)}
              disabled={isCapturing}
              title="Click extension icon to capture full page to clipboard"
              className="p-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/40 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">SnapFull</span>
            </button>
          </div>
        </div>

        {/* Visual Scrolling Progress Indicator (Minimap & Metrics HUD) */}
        {scanProgress !== null && (
          <div className="absolute bottom-6 right-6 z-40 bg-slate-900/95 backdrop-blur-md border border-sky-500/50 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 w-80 animate-in fade-in slide-in-from-bottom-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-bold text-slate-100">Capturing Full Page</span>
              </div>
              <span className="text-xs font-mono font-bold text-sky-400">{scanProgress}%</span>
            </div>

            {/* Visual progress bar */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
              <div
                style={{ width: `${scanProgress}%` }}
                className="h-full bg-gradient-to-r from-sky-500 to-sky-300 transition-all duration-150"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Scanned: {Math.round(scanScrolledPx)} px</span>
              <span>Total: {Math.round(scanTotalPx)} px</span>
            </div>

            {/* Additional scrolling required alert badge */}
            {additionalScrollAlert && (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span className="leading-tight">{additionalScrollAlert}</span>
              </div>
            )}
          </div>
        )}

        {/* Full Page Capture Confirmation Notification */}
        {confirmationNotification && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%] bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  Entire Page Successfully Captured!
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {confirmationNotification.width} × {confirmationNotification.height} px
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  {confirmationNotification.text}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => setEditingImageSrc(confirmationNotification.dataUrl)}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                title="Crop, Blur sensitive info, or add notes"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Open in Editor</span>
              </button>
              <button
                onClick={() => setConfirmationNotification(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Tall Scrollable Webpage Content */}
        <div
          ref={scrollablePageRef}
          className="h-[620px] overflow-y-auto bg-slate-950 text-slate-100 scroll-smooth relative"
        >
          {/* Sticky Webpage Header */}
          <header className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center font-black text-slate-950 text-xs">
                CP
              </div>
              <span className="font-bold text-sm tracking-tight text-white">CloudPulse Enterprise</span>
            </div>

            <nav className="hidden md:flex items-center gap-5 text-xs text-slate-300">
              <span className="text-sky-400 font-semibold cursor-pointer">Live Overview</span>
              <span className="hover:text-white cursor-pointer">Metrics</span>
              <span className="hover:text-white cursor-pointer">Global CDN</span>
              <span className="hover:text-white cursor-pointer">Security</span>
              <span className="hover:text-white cursor-pointer">Pricing</span>
            </nav>

            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Cluster v4.8
              </span>
              <button className="px-3 py-1 text-xs font-semibold rounded bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors">
                Deploy Now
              </button>
            </div>
          </header>

          {/* Section 1: Hero */}
          <div className="px-6 py-12 max-w-5xl mx-auto text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" /> Distributed Edge Observability Platform
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 tracking-tight">
              Real-Time Global Telemetry & Intelligence
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Monitoring 45,000+ microservices across 32 regional nodes with sub-millisecond precision.
              Scroll down to inspect deep telemetry metrics, lazy asset graphs, and cluster topology.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md">
                Launch Live Session
              </button>
              <button className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs">
                Export Protocol Specs
              </button>
            </div>
          </div>

          {/* Section 2: Metric KPIs Grid */}
          <div className="px-6 py-6 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Throughput</span>
                  <Activity className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">1.84M req/s</div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                  <TrendingUp className="w-3 h-3" /> +14.2% from peak
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Average Latency</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">2.41 ms</div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                  <Check className="w-3 h-3" /> 99.999% SLA adherence
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Edge Nodes</span>
                  <Globe2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">148 Active</div>
                <div className="text-[11px] text-slate-400 mt-1">Across 42 Tier-1 cities</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Memory Cache</span>
                  <Cpu className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white font-mono">94.8% Hit</div>
                <div className="text-[11px] text-sky-400 mt-1">Zero-miss L1 buffer</div>
              </div>
            </div>
          </div>

          {/* Section 3: Lazy-Loaded Content Section */}
          <div className="px-6 py-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-sky-400" />
                  Dynamic Lazy-Loaded Infrastructure Nodes
                </h2>
                <p className="text-xs text-slate-400">
                  Simulates lazy elements that only enter browser memory when scrolled into viewport or auto-warmed by SnapFull!
                </p>
              </div>
              <div className="text-xs px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                Lazy Loaded: <span className="text-sky-400 font-bold">{lazyLoadedCount} / {dynamicSectionAdded ? 8 : 6}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: '1', title: 'Tokyo US-West Cluster', region: 'ap-northeast-1', color: 'from-blue-600/30 to-indigo-900/40', status: 'Optimal' },
                { id: '2', title: 'Frankfurt Central Core', region: 'eu-central-1', color: 'from-emerald-600/30 to-teal-900/40', status: 'Healthy' },
                { id: '3', title: 'Virginia Primary Nexus', region: 'us-east-1', color: 'from-purple-600/30 to-slate-900/40', status: 'Synchronized' },
                { id: '4', title: 'São Paulo Gateway', region: 'sa-east-1', color: 'from-amber-600/30 to-yellow-900/40', status: 'Warmed' },
                { id: '5', title: 'London Gateway Alpha', region: 'eu-west-2', color: 'from-cyan-600/30 to-sky-900/40', status: 'Online' },
                { id: '6', title: 'Singapore Ocean Hub', region: 'ap-southeast-1', color: 'from-rose-600/30 to-pink-900/40', status: 'Protected' },
              ].map((node) => (
                <div
                  key={node.id}
                  data-lazy-card
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 relative overflow-hidden transition-all duration-300 hover:border-slate-700"
                >
                  <div className={`h-24 rounded-lg bg-gradient-to-br ${node.color} flex flex-col justify-end p-3 mb-3 border border-slate-800/80`}>
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-white font-semibold">Node #{node.id}</span>
                      <span className="px-1.5 py-0.5 rounded bg-black/40 text-sky-300">{node.region}</span>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-white mb-1">{node.title}</div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Virtual Memory:</span>
                    <span className="text-emerald-400 font-mono">Active (100% Warmed)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Optional Dynamic Section Added on the Fly (tests additional scrolling required) */}
          {dynamicSectionAdded && (
            <div className="px-6 py-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-2">
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30">
                <div className="text-xs font-bold text-amber-300 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Dynamic Feed Appended (+1,200px Height)
                </div>
                <p className="text-[11px] text-amber-200/80 mb-3">
                  This section simulates an infinite scroll or lazy-loaded comments feed. Notice how SnapFull's visual indicator alerts you that additional scrolling is required and scans to the new bottom!
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-slate-300">
                    <span className="font-semibold text-white">Dynamic Cluster Partition #7</span>:
                    Allocated 64GB persistent storage on NVMe array.
                  </div>
                  <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-slate-300">
                    <span className="font-semibold text-white">Dynamic Cluster Partition #8</span>:
                    Zero-downtime replication stream established.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Deep Data Table & Specs */}
          <div className="px-6 py-8 max-w-5xl mx-auto">
            <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Security Protocol Audits & Compliance
            </h2>
            <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Security Domain</th>
                    <th className="py-2.5 px-4 font-semibold">Encryption</th>
                    <th className="py-2.5 px-4 font-semibold">Audited Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-white">TLS Handshake 1.3</td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">ChaCha20-Poly1305</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium">SOC-2 Certified</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-400">0.12ms</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-white">Resting DB Volumes</td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">AES-256-GCM Hardware</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium">HIPAA Compliant</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-400">FIPS 140-3</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-medium text-white">mTLS Mesh Interconnect</td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">ECDSA-P384</td>
                    <td className="py-2.5 px-4 text-emerald-400 font-medium">Zero-Trust Guard</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-400">Continuous</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Deep Footer */}
          <footer className="bg-slate-900 border-t border-slate-800 px-6 py-8 mt-12 text-xs text-slate-400">
            <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-200">CloudPulse Global Mesh</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  End of page reach. Captured seamlessly by DevTools Protocol beyond viewport bounds.
                </p>
              </div>
              <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                <span className="hover:text-white cursor-pointer">Privacy Policy</span>
                <span className="hover:text-white cursor-pointer">Status Dashboard</span>
                <span className="hover:text-white cursor-pointer">CDP Integration Docs</span>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Embedded In-App Image Editor Modal when triggered */}
      {editingImageSrc && (
        <ImageEditor
          initialImageSrc={editingImageSrc}
          onClose={() => setEditingImageSrc(null)}
          onSavedToClipboard={() => {
            // alert or notification handled inside editor
          }}
        />
      )}
    </div>
  );
};
