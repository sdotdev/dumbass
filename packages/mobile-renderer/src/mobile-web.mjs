import { mkdir } from "node:fs/promises";
import path from "node:path";

// Mobile web renderer: a browser viewport at a mobile size. It is web evidence. It is never labelled
// as a native iOS, Android or React Native screenshot, and it says so in its own limitations.

export const DEVICE_PROFILES = Object.freeze({
  "iphone-14": { name: "iPhone 14-sized viewport", width: 390, height: 844, scale_factor: 3 },
  "iphone-se": { name: "iPhone SE-sized viewport", width: 375, height: 667, scale_factor: 2 },
  "pixel-7": { name: "Pixel 7-sized viewport", width: 412, height: 915, scale_factor: 2.625 },
  "small-android": { name: "Small Android-sized viewport", width: 360, height: 640, scale_factor: 2 },
  narrow: { name: "Narrow 320 px viewport", width: 320, height: 640, scale_factor: 2 },
});

/** Reports whether Playwright can be imported, without launching anything. */
export async function detectPlaywright() {
  try {
    const pw = await import("playwright");
    return { found: Boolean(pw.chromium), version: null };
  } catch {
    return { found: false, version: null };
  }
}

/**
 * @typedef {{ newContext(options: object): Promise<any>, version(): string, close(): Promise<void> }} BrowserLike
 * @param {{ url: string, profile?: string, theme?: "light" | "dark", outFile: string, engine?: "chromium" | "webkit" | "firefox", allowedOrigins?: string[], waitMs?: number, launcher?: () => Promise<BrowserLike>, now?: () => Date }} input
 */
export async function captureMobileWeb(input) {
  const target = new URL(input.url);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only http and https pages can be rendered");
  const profile = DEVICE_PROFILES[input.profile ?? "iphone-14"];
  if (!profile) throw new Error(`Unknown device profile ${input.profile}`);
  const allowed = new Set(input.allowedOrigins?.length ? input.allowedOrigins : [target.origin]);
  const theme = input.theme ?? "light";
  const engine = input.engine ?? "chromium";
  const launcher = input.launcher ?? (async () => {
    const pw = await import("playwright");
    return pw[engine].launch();
  });
  const now = input.now ?? (() => new Date());
  const browser = await launcher();
  let blocked = 0;
  try {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.scale_factor,
      isMobile: true,
      hasTouch: true,
      colorScheme: theme,
    });
    // Same boundary the audit uses everywhere: requests outside the allowed origins are refused.
    await context.route("**/*", (route) => {
      let origin = "";
      try { origin = new URL(route.request().url()).origin; } catch { /* blocked below */ }
      if (allowedOrigin(origin, allowed, route.request().url())) return route.continue();
      blocked += 1;
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(target.href, { waitUntil: "load", timeout: 30_000 });
    if (input.waitMs) await page.waitForTimeout(input.waitMs);
    await mkdir(path.dirname(input.outFile), { recursive: true });
    await page.screenshot({ path: input.outFile, type: "png", fullPage: false });
    const scroll = await page.evaluate(() => ({ x: Math.round(window.scrollX), y: Math.round(window.scrollY) }));
    return {
      file: input.outFile,
      device: { name: profile.name, width: profile.width, height: profile.height, scale_factor: profile.scale_factor },
      theme,
      browser: { name: engine, version: browser.version() },
      scroll,
      capturedAt: now().toISOString(),
      blockedRequests: blocked,
      origin: target.origin,
    };
  } finally {
    await browser.close();
  }
}

function allowedOrigin(origin, allowed, url) {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  return allowed.has(origin);
}
