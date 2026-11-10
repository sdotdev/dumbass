import type { VisualAction, VisualDriver } from "@dumbass/runner";

export interface WebScreenshot {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png" | "image/jpeg";
}

/**
 * Minimal browser transport boundary. Implementations may use Playwright/CDP internally,
 * but must not expose page objects, DOM, locators, accessibility data, or page text here.
 */
export interface WebInputSurface {
  /** Install browser-level request interception that blocks all non-allowed origins before navigation. */
  configureAllowedOrigins(origins: readonly string[]): Promise<void>;
  currentUrl(): Promise<string>;
  screenshot(): Promise<WebScreenshot>;
  click(cssX: number, cssY: number): Promise<void>;
  tap(cssX: number, cssY: number): Promise<void>;
  scroll(cssX: number, cssY: number, deltaX: number, deltaY: number): Promise<void>;
  swipe(cssX: number, cssY: number, toCssX: number, toCssY: number, durationMs: number): Promise<void>;
  keypress(key: string): Promise<void>;
  type(text: string): Promise<void>;
  wait(milliseconds: number): Promise<void>;
  close(): Promise<void>;
}

export interface WebAdapterOptions {
  /** Browser viewport dimensions in CSS pixels, fixed when the context is created. */
  readonly viewportCss: { readonly width: number; readonly height: number };
  /** Reject screenshots that do not match the configured pixel-to-CSS transform. */
  readonly expectedScreenshotPixels: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor?: number;
  readonly now?: () => Date;
}

export class WebAdapter implements VisualDriver {
  private closed = false;
  private readonly now: () => Date;
  private readonly surface: WebInputSurface;
  private readonly options: WebAdapterOptions;

  constructor(surface: WebInputSurface, options: WebAdapterOptions) {
    this.surface = surface;
    this.options = options;
    if (!Number.isFinite(options.viewportCss.width) || options.viewportCss.width <= 0 || !Number.isFinite(options.viewportCss.height) || options.viewportCss.height <= 0) {
      throw new Error("WebAdapter requires positive CSS viewport dimensions");
    }
    this.now = options.now ?? (() => new Date());
  }

  async capture() {
    this.assertOpen();
    const image = await this.surface.screenshot();
    if (!(image.bytes instanceof Uint8Array) || image.bytes.byteLength === 0) throw new Error("Browser returned an empty screenshot");
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) throw new Error("Browser returned invalid screenshot dimensions");
    const expected = this.options.expectedScreenshotPixels;
    if (expected && (image.width !== expected.width || image.height !== expected.height)) {
      throw new Error(`Screenshot dimensions ${image.width}x${image.height} differ from configured ${expected.width}x${expected.height}`);
    }
    return {
      captured_at: this.now().toISOString(),
      width: image.width,
      height: image.height,
      mime_type: image.mimeType,
      screenshot: image.bytes.slice(),
    };
  }

  async currentUrl(): Promise<string> {
    this.assertOpen();
    return this.surface.currentUrl();
  }

  async perform(action: Exclude<VisualAction, { type: "stop" }>): Promise<void> {
    this.assertOpen();
    const scaleX = this.options.viewportCss.width / this.options.expectedScreenshotPixels.width;
    const scaleY = this.options.viewportCss.height / this.options.expectedScreenshotPixels.height;
    switch (action.type) {
      case "click":
        await this.surface.click(action.x * scaleX, action.y * scaleY);
        break;
      case "tap":
        await this.surface.tap(action.x * scaleX, action.y * scaleY);
        break;
      case "scroll":
        await this.surface.scroll(action.x * scaleX, action.y * scaleY, action.delta_x * scaleX, action.delta_y * scaleY);
        break;
      case "keypress":
        await this.surface.keypress(action.key);
        break;
      case "swipe":
        await this.surface.swipe(action.x * scaleX, action.y * scaleY, action.to_x * scaleX, action.to_y * scaleY, action.duration_ms);
        break;
      case "type":
        await this.surface.type(action.text);
        break;
      case "wait":
        await this.surface.wait(action.duration_ms);
        break;
      default: {
        const unreachable: never = action;
        throw new Error(`Unsupported visual action: ${String(unreachable)}`);
      }
    }
  }

  async configureAllowedOrigins(origins: readonly string[]): Promise<void> {
    this.assertOpen();
    if (!origins.length || origins.some(origin => {
      try { return new URL(origin).origin !== origin; } catch { return true; }
    })) throw new Error("Allowed origins must be non-empty canonical origins");
    await this.surface.configureAllowedOrigins(Object.freeze([...origins]));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.surface.close();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("WebAdapter is closed");
  }
}

