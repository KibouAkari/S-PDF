import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto("http://127.0.0.1:5173/tools/editor", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().setInputFiles("/tmp/editor-wide-fixture.pdf");
  const viewport = page.getByTestId("pdf-editor-viewport");
  await viewport.waitFor({ timeout: 30000 });
  await page.locator("canvas.upper-canvas").waitFor();
  await page.waitForResponse((r) => r.url().includes("/api/pdf/content"), { timeout: 30000 }).catch(() => {});
  await page.getByRole("button", { name: "Fit page" }).click();
  await page.waitForTimeout(200);

  const workspace = await viewport.boundingBox();
  const canvas = await page.locator("canvas.upper-canvas").boundingBox();
  assert.ok(workspace && canvas);
  const tolerance = 4;
  assert.ok(canvas.x >= workspace.x - tolerance,
    `PDF clipped at left edge: page ${canvas.x}, workspace ${workspace.x}`);
  assert.ok(canvas.x + canvas.width <= workspace.x + workspace.width + tolerance,
    `PDF clipped at right edge: page ${canvas.x + canvas.width}, workspace ${workspace.x + workspace.width}`);
  assert.ok(canvas.y >= workspace.y - tolerance, "PDF clipped at top");
  assert.ok(canvas.y + canvas.height <= workspace.y + workspace.height + tolerance, "PDF clipped at bottom");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Fit page" }).click();
  await page.getByRole("button", { name: "Pan" }).click();
  await page.getByRole("button", { name: "Select" }).click();

  await page.getByRole("button", { name: "Page 2" }).click();
  await page.getByText(/Page 2 of 2/).waitFor();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("Annotation on second page");
  await page.getByRole("button", { name: "Page 1" }).click();
  await page.getByText(/Page 1 of 2/).waitFor();
  await page.getByRole("button", { name: "Page 2" }).click();
  await page.waitForTimeout(300);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save & Download" }).click();
  const download = await downloadPromise;
  await download.saveAs("/tmp/editor-multipage-export.pdf");
  assert.deepEqual(errors, []);
  console.log("MULTIPAGE / FIT-PAGE / ZOOM / PAN BROWSER REGRESSION PASSED");
} catch (error) {
  console.error("VIEWPORT REGRESSION FAILED", error);
  console.error((await page.locator("body").innerText().catch(()=>"")).slice(0,5000));
  await page.screenshot({path:"/tmp/editor-viewport-failure.png", fullPage:true}).catch(()=>{});
  throw error;
} finally {
  await browser.close();
}
