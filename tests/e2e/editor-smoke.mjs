import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1420, height: 920 } });
const diagnostics = [];

try {
  const browserErrors = [];
  page.on("pageerror", (error) => { browserErrors.push(error.message); diagnostics.push("JS ERROR: " + error.message); });
  page.on("console", (message) => { if (message.type() === "error") diagnostics.push("CONSOLE: " + message.text()); });
  page.on("response", (response) => { if (response.url().includes("/api/")) diagnostics.push("API: " + response.status() + " " + response.url()); });
  page.on("requestfailed", (request) => diagnostics.push("FAILED: " + request.url() + " " + request.failure()?.errorText));
  await page.goto("http://127.0.0.1:5173/tools/editor", { waitUntil: "networkidle" });
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles("/tmp/editor-fixture.pdf");

  await page.getByRole("button", { name: /Fit page/i }).waitFor({ timeout: 30000 });
  await page.locator("canvas.upper-canvas").waitFor();
  await page.waitForTimeout(1600);
  console.log("DIAGNOSTICS AFTER UPLOAD", diagnostics.join("\\n"));
  assert.ok(diagnostics.some((line) => line.includes("API: 200") && line.includes("/api/pdf/content")), "Native content inspection API was not successful");

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

  // Exercise basic editor commands with the real Fabric canvas mounted.
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await field.waitFor({ timeout: 5000 });
  assert.equal(await field.inputValue(), "Double-click to edit");
  await page.keyboard.press("Delete");
  await field.waitFor({ state: "hidden", timeout: 5000 });
  await page.getByRole("button", { name: /Undo/i }).click();
  await page.getByRole("button", { name: /Ellipse/i }).click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await page.getByRole("button", { name: /Line/i }).click();
  await page.getByRole("button", { name: /Freehand marker/i }).click();
  await page.getByRole("button", { name: /Stop marking/i }).click();
  assert.equal(browserErrors.length, 0, browserErrors.join("\n"));
  console.log("BROWSER EDIT SMOKE PASSED");
} catch (error) {
  console.error("EDITOR DIAGNOSTICS:", diagnostics.join("\\n"));
  console.error("EDITOR BODY:", (await page.locator("body").innerText().catch(() => "" )).slice(0, 5000));
  await page.screenshot({ path: "/tmp/editor-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
