import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const out = "d:/x-ceed/public/screenshots/xceed-landing-full.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3002/landing", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await page.addStyleTag({
  content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }",
});
await mkdir("d:/x-ceed/public/screenshots", { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("saved", out);
