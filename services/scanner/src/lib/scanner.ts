import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

export type ScanCallback = (text: string) => void;
export type ErrorCallback = (err: Error) => void;

/**
 * Continuous QR scanner built on @zxing/browser.
 * - Uses the default camera (back camera on mobile).
 * - 1.5s dedupe per unique QR text so the same code doesn't fire 30x/sec.
 * - After a hit, stops the stream, fires the callback, and resumes after 1.2s
 *   so the facilitator gets a visual breath.
 */
export class CameraScanner {
  private reader: BrowserMultiFormatReader | null = null;
  private controls: IScannerControls | null = null;
  private video: HTMLVideoElement | null = null;
  private onScan: ScanCallback | null = null;
  private onError: ErrorCallback | null = null;
  private lastText: string = '';
  private lastAt: number = 0;
  private stopped = false;

  async start(video: HTMLVideoElement, onScan: ScanCallback, onError?: ErrorCallback): Promise<void> {
    this.video = video;
    this.onScan = onScan;
    this.onError = onError ?? null;
    this.stopped = false;
    this.reader = new BrowserMultiFormatReader(
      new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
        [DecodeHintType.TRY_HARDER, true],
      ]),
    );
    await this.attach();
  }

  private async attach(): Promise<void> {
    if (this.stopped || !this.video || !this.reader || !this.onScan) return;
    try {
      this.controls = await this.reader.decodeFromVideoDevice(
        undefined,
        this.video,
        (result) => {
          if (this.stopped || !result) return;
          const text = result.getText();
          const now = Date.now();
          if (text === this.lastText && now - this.lastAt < 1500) return;
          this.lastText = text;
          this.lastAt = now;
          // Stop the stream after a hit; resume after 1.2s
          this.controls?.stop();
          this.controls = null;
          this.onScan?.(text);
          setTimeout(() => {
            void this.attach();
          }, 1200);
        },
      );
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  stop(): void {
    this.stopped = true;
    this.controls?.stop();
    this.controls = null;
    this.reader = null;
  }
}
