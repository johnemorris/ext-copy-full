export interface CaptureSettings {
  engine: 'devtools' | 'stitch';
  autoCopyClipboard: boolean;
  autoDownloadFile: boolean;
  autoScrollWarmup: boolean;
  scrollDelayMs: number;
  format: 'png' | 'jpeg';
  jpegQuality: number;
  hideFixedElements: boolean;
  playShutterSound: boolean;
}

export interface CaptureResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
  timestamp: Date;
  copiedToClipboard: boolean;
  downloadedFile: boolean;
  durationMs: number;
}
