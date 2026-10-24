import React from 'react';
import {
  Layers,
  Cpu,
  Copy,
  Zap,
  Sliders,
  Scissors,
  EyeOff,
  CheckCircle2,
  Code2,
  AlertTriangle,
  Monitor
} from 'lucide-react';

export const ArchitectureGuide: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* Hero header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          How DevTools Full-Page Capture & Image Editing Works
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Deep technical breakdown of Chrome DevTools Protocol (CDP), lazy-scroll memory preloading, dynamic height indicators, and in-extension canvas editing.
        </p>
      </div>

      {/* 4 Core Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pillar 1: Chrome DevTools Protocol */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
            <Monitor className="w-5 h-5 text-sky-400" />
          </div>
          <h3 className="text-base font-bold text-white">
            1. Chrome DevTools Protocol (CDP)
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            In Chrome DevTools, clicking <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[10px]">Capture full size screenshot</kbd> uses the Chromium DevTools Protocol.
            SnapFull attaches via <code className="text-sky-300 font-mono">chrome.debugger</code> and invokes:
          </p>
          <div className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 space-y-1 border border-slate-800/80">
            <div className="text-slate-500">// 1. Compute exact css content bounds</div>
            <div>const metrics = await sendCommand('Page.getLayoutMetrics');</div>
            <div className="text-slate-500">// 2. Override viewport bounds to encompass document</div>
            <div>await sendCommand('Emulation.setDeviceMetricsOverride', &#123; width, height, deviceScaleFactor: 1 &#125;);</div>
            <div className="text-slate-500">// 3. Capture beyond viewport in 1 atomic frame</div>
            <div>await sendCommand('Page.captureScreenshot', &#123; captureBeyondViewport: true &#125;);</div>
          </div>
        </div>

        {/* Pillar 2: Lazy-Scroll Warmup & Visual Indicator */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-base font-bold text-white">
            2. Visual Scroll Progress & Height Expansion
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Modern webpages use <code className="text-sky-300 font-mono">loading="lazy"</code> and <code className="text-sky-300 font-mono">IntersectionObserver</code>. If an offscreen element isn't scrolled into the viewport, the browser has never fetched or painted it!
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li><span className="text-slate-200 font-medium">Progressive Sweep:</span> Sweeps down document height with 120ms pauses to trigger lazy decoders.</li>
            <li><span className="text-slate-200 font-medium">Dynamic Height Detection:</span> If infinite scroll loads more feed items mid-sweep, SnapFull detects height expansion and notifies the user with an alert: <em>"Additional scrolling required"</em> while continuing the scan.</li>
            <li><span className="text-slate-200 font-medium">Zero Layout Jitter:</span> Restores original scroll coordinate instantaneously upon scan completion.</li>
          </ul>
        </div>

        {/* Pillar 3: Automatic System Clipboard Copy */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
            <Copy className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-white">
            3. Zero-Click System Clipboard Write
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Instead of forcing the user to download an image file, navigate their file system, and manually drag it, SnapFull writes the PNG byte stream directly into the operating system clipboard buffer:
          </p>
          <div className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 space-y-1 border border-slate-800/80">
            <div>const item = new ClipboardItem(&#123; 'image/png': pngBlob &#125;);</div>
            <div>await navigator.clipboard.write([item]);</div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Immediately ready for pasting with <kbd className="px-1 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[10px]">Ctrl+V</kbd> or <kbd className="px-1 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[10px]">Cmd+V</kbd> into Slack, Google Docs, Notion, Figma, or Jira!
          </p>
        </div>

        {/* Pillar 4: Built-in Image Editor & Redaction */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
            <Scissors className="w-5 h-5 text-indigo-400" />
          </div>
          <h3 className="text-base font-bold text-white">
            4. Post-Capture Canvas Editor & Privacy Blur
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Before sharing full-page screenshots, users often need to hide confidential info or focus on specific sections:
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li><span className="text-slate-200 font-medium">Interactive Crop:</span> Drag bounding boxes to cut out irrelevant headers/footers with instant reset.</li>
            <li><span className="text-slate-200 font-medium">Privacy Blur (Redaction):</span> Sub-rectangle Gaussian blur to conceal API keys, auth tokens, passwords, customer emails, or credit card numbers.</li>
            <li><span className="text-slate-200 font-medium">Text Annotations & Shapes:</span> Highlight key bugs, metrics, or callouts with customizable colored badges and arrows.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
