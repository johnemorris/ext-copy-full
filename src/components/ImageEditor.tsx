import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Crop,
  Type,
  EyeOff,
  Copy,
  Download,
  RotateCcw,
  Check,
  X,
  Undo2,
  Square,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Move,
  Layers,
  Palette,
  ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TextAnnotation {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  bgColor: string;
}

interface BlurBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blurRadius: number;
}

interface RectShape {
  id: string;
  type: 'box' | 'arrow' | 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageEditorProps {
  initialImageSrc: string;
  onClose: () => void;
  onSavedToClipboard?: (blob: Blob) => void;
  onSavedToFile?: () => void;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  initialImageSrc,
  onClose,
  onSavedToClipboard,
  onSavedToFile,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tools: 'select', 'crop', 'text', 'blur', 'box', 'arrow'
  const [activeTool, setActiveTool] = useState<'select' | 'crop' | 'text' | 'blur' | 'box' | 'arrow'>('blur');

  // Annotation states
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [blurBoxes, setBlurBoxes] = useState<BlurBox[]>([]);
  const [shapes, setShapes] = useState<RectShape[]>([]);

  // Crop state
  const [cropRegion, setCropRegion] = useState<CropRegion | null>(null);
  const [isCroppingActive, setIsCroppingActive] = useState(false);

  // History stack for Undo
  const [history, setHistory] = useState<{
    text: TextAnnotation[];
    blur: BlurBox[];
    shapes: RectShape[];
  }[]>([]);

  // Styling settings
  const [activeColor, setActiveColor] = useState<string>('#38bdf8');
  const [fontSize, setFontSize] = useState<number>(20);
  const [blurIntensity, setBlurIntensity] = useState<number>(16);

  // Interaction dragging states
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragRect, setCurrentDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Zoom view
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [copiedStatus, setCopiedStatus] = useState(false);

  // Original Image holder
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgDimensions({ w: img.width, h: img.height });
      setImageLoaded(true);
      // default crop region
      setCropRegion({ x: 0, y: 0, width: img.width, height: img.height });
    };
    img.src = initialImageSrc;
  }, [initialImageSrc]);

  // Save history snapshot before making changes
  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-15),
      {
        text: [...textAnnotations],
        blur: [...blurBoxes],
        shapes: [...shapes],
      },
    ]);
  }, [textAnnotations, blurBoxes, shapes]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setTextAnnotations(prev.text);
    setBlurBoxes(prev.blur);
    setShapes(prev.shapes);
    setHistory((h) => h.slice(0, -1));
  };

  // Render canvas with annotations & blurs
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle crop dimensions if cropped
    const srcX = cropRegion?.x ?? 0;
    const srcY = cropRegion?.y ?? 0;
    const srcW = cropRegion?.width ?? img.width;
    const srcH = cropRegion?.height ?? img.height;

    canvas.width = srcW;
    canvas.height = srcH;

    // 1. Draw base image
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    // 2. Draw blur/redaction boxes
    blurBoxes.forEach((box) => {
      // Adjust to cropped space
      const bx = box.x - srcX;
      const by = box.y - srcY;
      const bw = box.width;
      const bh = box.height;

      if (bw <= 0 || bh <= 0) return;

      // Extract pixel area to blur
      const offCanvas = document.createElement('canvas');
      offCanvas.width = bw;
      offCanvas.height = bh;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) return;

      // Draw the sub-rectangle
      offCtx.drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);

      // Pixelate / heavy blur effect
      const radius = Math.max(8, box.blurRadius);
      ctx.save();
      ctx.filter = `blur(${radius}px)`;
      // Clip blur to box
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      ctx.drawImage(offCanvas, bx, by, bw, bh);
      ctx.restore();

      // Subtle border indicating redaction
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);
    });

    // 3. Draw shapes (boxes, arrows, highlights)
    shapes.forEach((shape) => {
      const sx = shape.x - srcX;
      const sy = shape.y - srcY;
      ctx.save();

      if (shape.type === 'box') {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(sx, sy, shape.width, shape.height, 6);
        ctx.stroke();
      } else if (shape.type === 'highlight') {
        ctx.fillStyle = shape.color.startsWith('#')
          ? `${shape.color}44`
          : 'rgba(250, 204, 21, 0.35)';
        ctx.fillRect(sx, sy, shape.width, shape.height);
      } else if (shape.type === 'arrow') {
        ctx.strokeStyle = shape.color;
        ctx.fillStyle = shape.color;
        ctx.lineWidth = 4;
        const endX = sx + shape.width;
        const endY = sy + shape.height;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(shape.height, shape.width);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle - Math.PI / 6),
          endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          endX - headLen * Math.cos(angle + Math.PI / 6),
          endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });

    // 4. Draw text annotations
    textAnnotations.forEach((ann) => {
      const ax = ann.x - srcX;
      const ay = ann.y - srcY;

      ctx.save();
      ctx.font = `bold ${ann.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const textMetrics = ctx.measureText(ann.text);
      const padding = 8;
      const boxW = textMetrics.width + padding * 2;
      const boxH = ann.fontSize + padding * 1.5;

      // Draw background pill
      ctx.fillStyle = ann.bgColor || 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(ax - padding, ay - ann.fontSize, boxW, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw text
      ctx.fillStyle = ann.color;
      ctx.fillText(ann.text, ax, ay);
      ctx.restore();
    });

    // 5. Draw active dragging preview
    if (isDrawing && currentDragRect) {
      const rx = currentDragRect.x - srcX;
      const ry = currentDragRect.y - srcY;
      ctx.save();
      if (activeTool === 'blur') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.fillRect(rx, ry, currentDragRect.w, currentDragRect.h);
        ctx.strokeRect(rx, ry, currentDragRect.w, currentDragRect.h);
      } else if (activeTool === 'box' || activeTool === 'crop') {
        ctx.strokeStyle = activeTool === 'crop' ? '#38bdf8' : activeColor;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, currentDragRect.w, currentDragRect.h);
      } else if (activeTool === 'arrow') {
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + currentDragRect.w, ry + currentDragRect.h);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [
    cropRegion,
    blurBoxes,
    shapes,
    textAnnotations,
    isDrawing,
    currentDragRect,
    activeTool,
    activeColor,
  ]);

  useEffect(() => {
    if (imageLoaded) {
      renderCanvas();
    }
  }, [imageLoaded, renderCanvas]);

  // Convert mouse event to image-space coordinates
  const getImageCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const srcX = cropRegion?.x ?? 0;
    const srcY = cropRegion?.y ?? 0;

    return {
      x: Math.round(canvasX + srcX),
      y: Math.round(canvasY + srcY),
    };
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getImageCoords(e);
    setDragStart(coords);
    setIsDrawing(true);
    pushHistory();

    if (activeTool === 'text') {
      const textPrompt = window.prompt('Enter annotation text:', 'Attention');
      if (textPrompt) {
        setTextAnnotations((prev) => [
          ...prev,
          {
            id: `text-${Date.now()}`,
            text: textPrompt,
            x: coords.x,
            y: coords.y,
            color: activeColor,
            fontSize,
            bgColor: '#0f172a',
          },
        ]);
      }
      setIsDrawing(false);
      setActiveTool('select');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !dragStart) return;
    const coords = getImageCoords(e);
    const x = Math.min(dragStart.x, coords.x);
    const y = Math.min(dragStart.y, coords.y);
    const w = Math.abs(coords.x - dragStart.x);
    const h = Math.abs(coords.y - dragStart.y);

    if (activeTool === 'arrow') {
      setCurrentDragRect({
        x: dragStart.x,
        y: dragStart.y,
        w: coords.x - dragStart.x,
        h: coords.y - dragStart.y,
      });
    } else {
      setCurrentDragRect({ x, y, w, h });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentDragRect) {
      setIsDrawing(false);
      setCurrentDragRect(null);
      return;
    }

    if (activeTool === 'blur' && currentDragRect.w > 5 && currentDragRect.h > 5) {
      setBlurBoxes((prev) => [
        ...prev,
        {
          id: `blur-${Date.now()}`,
          x: currentDragRect.x,
          y: currentDragRect.y,
          width: currentDragRect.w,
          height: currentDragRect.h,
          blurRadius: blurIntensity,
        },
      ]);
    } else if (activeTool === 'box' && currentDragRect.w > 5 && currentDragRect.h > 5) {
      setShapes((prev) => [
        ...prev,
        {
          id: `box-${Date.now()}`,
          type: 'box',
          x: currentDragRect.x,
          y: currentDragRect.y,
          width: currentDragRect.w,
          height: currentDragRect.h,
          color: activeColor,
        },
      ]);
    } else if (activeTool === 'arrow') {
      setShapes((prev) => [
        ...prev,
        {
          id: `arrow-${Date.now()}`,
          type: 'arrow',
          x: currentDragRect.x,
          y: currentDragRect.y,
          width: currentDragRect.w,
          height: currentDragRect.h,
          color: activeColor,
        },
      ]);
    } else if (activeTool === 'crop' && currentDragRect.w > 40 && currentDragRect.h > 40) {
      // Apply crop
      setCropRegion({
        x: currentDragRect.x,
        y: currentDragRect.y,
        width: currentDragRect.w,
        height: currentDragRect.h,
      });
      setIsCroppingActive(true);
      setActiveTool('select');
    }

    setIsDrawing(false);
    setCurrentDragRect(null);
  };

  // Reset entire image to original
  const handleResetCrop = () => {
    if (!imgRef.current) return;
    pushHistory();
    setCropRegion({
      x: 0,
      y: 0,
      width: imgRef.current.width,
      height: imgRef.current.height,
    });
    setIsCroppingActive(false);
  };

  // Export to system clipboard
  const handleExportToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setCopiedStatus(true);
        confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
        if (onSavedToClipboard) onSavedToClipboard(blob);
        setTimeout(() => setCopiedStatus(false), 2500);
      } catch (err) {
        console.error('Failed to copy edited image to clipboard:', err);
      }
    }, 'image/png');
  };

  // Export to file download
  const handleExportToFile = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `snapfull_edited_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (onSavedToFile) onSavedToFile();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 select-none animate-in fade-in duration-200">
      {/* Top Application Toolbar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-4">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-sky-400 text-slate-950 flex items-center justify-center font-bold text-xs shadow-md">
            <Sparkles className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              SnapFull Image Editor & Redaction
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                Post-Capture
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Crop, blur sensitive info, and annotate before copying to clipboard
            </div>
          </div>
        </div>

        {/* Center: Interactive Tool Palette */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTool('crop')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'crop'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Crop canvas area"
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Crop</span>
          </button>

          <button
            onClick={() => setActiveTool('blur')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'blur'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Redact / Blur sensitive text or passwords"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Blur / Redact</span>
          </button>

          <button
            onClick={() => setActiveTool('text')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'text'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Add text annotation callouts"
          >
            <Type className="w-3.5 h-3.5" />
            <span>Text Note</span>
          </button>

          <button
            onClick={() => setActiveTool('box')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'box'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Draw rectangle frame"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Box</span>
          </button>

          <button
            onClick={() => setActiveTool('arrow')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'arrow'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Draw arrow pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Arrow</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 text-xs flex items-center gap-1"
              title="Undo last change"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}

          {isCroppingActive && (
            <button
              onClick={handleResetCrop}
              className="px-2.5 py-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 text-xs font-medium flex items-center gap-1"
              title="Reset crop to full image"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Crop
            </button>
          )}

          <button
            onClick={handleExportToClipboard}
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-sky-500/20 transition-all"
          >
            {copiedStatus ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedStatus ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
          </button>

          <button
            onClick={handleExportToFile}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Save PNG</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
            title="Close Editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Secondary Tool Parameter Bar */}
      <div className="h-10 bg-slate-900/60 border-b border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-4">
          {activeTool === 'blur' && (
            <div className="flex items-center gap-3">
              <span className="text-rose-400 font-medium flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> Blur Redaction Mode:
              </span>
              <span className="text-slate-400">Click and drag over sensitive details (API keys, names, emails)</span>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-[11px] text-slate-400">Blur Radius:</span>
                <input
                  type="range"
                  min="8"
                  max="32"
                  value={blurIntensity}
                  onChange={(e) => setBlurIntensity(Number(e.target.value))}
                  className="w-24 accent-rose-500"
                />
                <span className="font-mono text-[11px]">{blurIntensity}px</span>
              </div>
            </div>
          )}

          {activeTool === 'crop' && (
            <div className="flex items-center gap-2 text-sky-400">
              <Crop className="w-3.5 h-3.5" />
              <span>Click and drag a box across the canvas to crop. Release mouse to apply crop.</span>
            </div>
          )}

          {(activeTool === 'box' || activeTool === 'arrow' || activeTool === 'text') && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Color:</span>
                {['#38bdf8', '#34d399', '#f43f5e', '#fbbf24', '#ffffff'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setActiveColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-4 h-4 rounded-full border ${
                      activeColor === color ? 'border-white scale-110 shadow-sm' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>

              {activeTool === 'text' && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Size:</span>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-white"
                  >
                    <option value={14}>Small (14px)</option>
                    <option value={20}>Medium (20px)</option>
                    <option value={28}>Large (28px)</option>
                    <option value={36}>Extra Large (36px)</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={() => setZoomLevel((z) => Math.max(30, z - 20))}
            className="p-1 hover:bg-slate-800 rounded"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono min-w-8 text-center">{zoomLevel}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(200, z + 20))}
            className="p-1 hover:bg-slate-800 rounded"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(100)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            1:1
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Workspace */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-950 p-6 flex justify-center items-start"
      >
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.1s ease-out',
          }}
          className="shadow-2xl border border-slate-800 rounded-lg overflow-hidden bg-slate-900 inline-block"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`block ${
              activeTool === 'crop'
                ? 'cursor-crosshair'
                : activeTool === 'blur'
                ? 'cursor-cell'
                : activeTool === 'text'
                ? 'cursor-text'
                : 'cursor-crosshair'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
