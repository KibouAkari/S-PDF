import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1420, height: 920 } });

try {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173/tools/editor", { waitUntil: "networkidle" });
  const input = page.locator('input[type="file"]').first();
  const inspection = page.waitForResponse((res) => res.url().includes("/api/pdf/content") && res.status() === 200, { timeout: 30000 });
  await input.setInputFiles("/tmp/editor-fixture.pdf");
  await inspection;

  await page.getByRole("button", { name: /Fit page/i }).waitFor({ timeout: 30000 });
  await page.locator("canvas.upper-canvas").waitFor();
  await page.waitForTimeout(250);

  const upper = page.locator("canvas.upper-canvas");
  const rect = await upper.boundingBox();
  assert.ok(rect, "Fabric canvas is visible");
  assert.ok(rect.width > 100 && rect.height > 100, "Fabric canvas has nonzero size");

  const scale = rect.width / (420 * 1.5);
  // The fixture puts text at point (70,110); top of its glyph bbox is near 95pt.
  await page.mouse.click(rect.x + (70 + 18) * 1.5 * scale, rect.y + (95 + 9) * 1.5 * scale);
  const field = page.getByLabel("Text", { exact: true });
  await field.waitFor({ timeout: 15000 });
  assert.equal(await field.inputValue(), "Test document");
  await field.fill("Edited in browser");
  const downloadEvent = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: /Save & Download/i }).click();
  const download = await downloadEvent;
  await download.saveAs("/tmp/editor-export.pdf");
  assert.equal(browserErrors.length, 0, browserErrors.join("\n"));
  console.log("BROWSER EDIT SMOKE PASSED");
} catch (error) {
  await page.screenshot({ path: "/tmp/editor-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
