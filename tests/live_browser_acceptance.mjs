/**
 * Browser-level regression test against the public S-PDF frontend.
 * All uploads are synthetic. No account, credentials or real user documents.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.SPDF_BASE_URL || "https://simi-pdf.vercel.app";
const fixtureRoot = "/tmp/s-pdf-browser-fixtures";
const results = [];
let browser;

if (!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(base)) {
  throw new Error("Only an explicit HTTPS origin is allowed");
}
const fixture = (name) => path.join(fixtureRoot, name);

async function check(name, route, filename, buttonText, expectedMagic, options = {}) {
  const start = performance.now();
  let page;
  try {
    page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const res = await page.goto(base.replace(/\/$/, "") + route, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    if (!res || res.status() !== 200) throw new Error("Failed to navigate: HTTP " + (res && res.status()));
    const upload = page.locator('input[type="file"]').first();
    await upload.waitFor({ state: "attached", timeout: 20000 });
    await upload.setInputFiles(
      Array.isArray(filename) ? filename.map(fixture) : fixture(filename),
    );
    if (options.rotate) {
      const tile = page.locator(".cursor-grab").first();
      await tile.waitFor({ state: "visible", timeout: 25000 });
      await tile.locator("button").first().click();
      await page.waitForTimeout(300);
    }
    if (options.split) {
      await page.locator('input[placeholder*="1-3"]').fill("1-1,2-2");
    }
    const button = page.getByRole("button", { name: buttonText });
    await button.waitFor({ state: "visible", timeout: 30000 });
    const waits = [page.waitForEvent("download", { timeout: 140000 }),
                   button.click({ timeout: 30000 })];
    const download = (await Promise.all(waits))[0];
    const failure = await download.failure();
    if (failure) throw new Error("Download failed: " + failure);
    const downloaded = await download.path();
    const bytes = await fs.readFile(downloaded);
    if (bytes.length < 100) throw new Error("Downloaded file is unexpectedly small");
    if (!bytes.subarray(0, expectedMagic.length).equals(Buffer.from(expectedMagic))) {
      throw new Error("Wrong download signature for " + download.suggestedFilename());
    }
    if (errors.length) throw new Error("Frontend exception: " + errors.join("; ").slice(0, 200));
    results.push({ status: "PASS", name, ms: Math.round(performance.now() - start), detail: download.suggestedFilename() });
  } catch (err) {
    results.push({ status: "FAIL", name, ms: Math.round(performance.now() - start), detail: String(err.message).slice(0, 250) });
    try {
      await fs.mkdir("/tmp/s-pdf-browser-failures", { recursive: true });
      await page?.screenshot({ path: path.join("/tmp/s-pdf-browser-failures", name.replaceAll(/\W+/g, "_") + ".png"), fullPage: true });
    } catch { /* no screenshot */ }
  } finally {
    await page?.close();
  }
}

try {
  browser = await chromium.launch({ headless: true });
  const pdf = [...Buffer.from("%PDF-")];
  const zip = [0x50, 0x4b];
  await check("Word to PDF UI", "/tools/word-to-pdf", "synthetic.docx", "Convert to PDF", pdf);
  await check("PDF to Word UI", "/tools/pdf-to-word", "synthetic.pdf", "Convert to Word", zip);
  await check("PDF to Images UI", "/tools/pdf-to-images", "synthetic.pdf", "Export as images", zip);
  await check("Images to PDF UI", "/tools/images-to-pdf",
    ["synthetic.png", "synthetic.jpg", "synthetic.webp"], /Create PDF/, pdf);
  await check("Split PDF UI", "/tools/split", "synthetic.pdf", "Split PDF", zip, { split: true });
  await check("Watermark UI", "/tools/watermark", "synthetic.pdf", "Apply watermark", pdf);
  await check("Page numbers UI", "/tools/page-numbers", "synthetic.pdf", "Add page numbers", pdf);
  await check("Compress UI", "/tools/compress", "synthetic.pdf", "Compress PDF", pdf);
  await check("Organize and rotate UI", "/tools/organize", "synthetic.pdf", "Merge & Download", pdf, { rotate: true });
} finally {
  await browser?.close();
}

for (const result of results) {
  console.log(result.status.padEnd(4) + " | " + result.name.padEnd(27) +
    " | " + (result.ms / 1000).toFixed(2) + "s | " + result.detail);
}
const failed = results.filter((r) => r.status === "FAIL").length;
console.log("BROWSER TOTAL " + results.length + " | PASS " + (results.length - failed) + " | FAIL " + failed);
if (failed) process.exitCode = 1;
