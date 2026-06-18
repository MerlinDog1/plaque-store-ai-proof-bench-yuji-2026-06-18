import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const APP_URL = process.env.PLAQUE_APP_URL || "http://127.0.0.1:3017/";
const OUT_DIR = path.resolve("output/export-fidelity");
const VIEWPORT = { width: 1400, height: 900 };
const PROMPT =
  "In loving memory of Bertie. Loyal companion, garden explorer, and forever in our hearts. 2014-2026.";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getTextOnlyPreviewMarkup(page) {
  return page.evaluate(() => {
    const live = document.querySelector("main svg") || document.querySelector("svg");
    const layer = live?.querySelector("#ai-text-layer");
    const outer = layer?.parentElement?.cloneNode(true);
    if (!outer) throw new Error("Preview text layer was not found");

    outer.querySelectorAll("*").forEach((el) => {
      el.removeAttribute("filter");
      el.removeAttribute("style");
      el.removeAttribute("class");
      el.removeAttribute("opacity");
      if (["text", "tspan", "path"].includes(el.tagName) && el.getAttribute("fill") !== "none") {
        el.setAttribute("fill", "#000000");
      }
      if (el.tagName === "text" || el.tagName === "tspan") el.setAttribute("stroke", "none");
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="900" height="600"><rect width="300" height="200" fill="white"/>${new XMLSerializer().serializeToString(outer)}</svg>`;
  });
}

async function getTextOnlyExportMarkup(page, svgText) {
  return page.evaluate((rawSvg) => {
    const doc = new DOMParser().parseFromString(rawSvg, "image/svg+xml");
    const inner = doc.querySelector("[data-fit-width]");
    const outer = inner?.parentElement?.cloneNode(true);
    if (!outer) throw new Error("Export text layer was not found");

    outer.querySelectorAll("*").forEach((el) => {
      if (["path", "text", "tspan"].includes(el.tagName) && el.getAttribute("fill") !== "none") {
        el.setAttribute("fill", "#000000");
      }
      if (el.tagName === "text" || el.tagName === "tspan") el.setAttribute("stroke", "none");
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="900" height="600"><rect width="300" height="200" fill="white"/>${new XMLSerializer().serializeToString(outer)}</svg>`;
  }, svgText);
}

async function compareSvgMarkup(page, sourceMarkup, exportMarkup) {
  return page.evaluate(async ({ sourceMarkup, exportMarkup }) => {
    const loadImage = (markup) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not render SVG comparison image"));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    });

    const [sourceImg, exportImg] = await Promise.all([loadImage(sourceMarkup), loadImage(exportMarkup)]);
    const width = 900;
    const height = 600;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not create comparison canvas");

    ctx.drawImage(sourceImg, 0, 0, width, height);
    const source = ctx.getImageData(0, 0, width, height).data;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(exportImg, 0, 0, width, height);
    const exported = ctx.getImageData(0, 0, width, height).data;

    let absoluteTotal = 0;
    let pixelsOver20 = 0;
    let pixelsOver50 = 0;
    let inkPixels = 0;
    let inkTotal = 0;
    const sourceBox = { minX: width, minY: height, maxX: -1, maxY: -1 };
    const exportBox = { minX: width, minY: height, maxX: -1, maxY: -1 };

    for (let i = 0; i < source.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const sourceGray = Math.round((source[i] + source[i + 1] + source[i + 2]) / 3);
      const exportGray = Math.round((exported[i] + exported[i + 1] + exported[i + 2]) / 3);
      const diff = Math.abs(sourceGray - exportGray);
      const isInk = sourceGray < 250 || exportGray < 250;
      if (sourceGray < 250) {
        sourceBox.minX = Math.min(sourceBox.minX, x);
        sourceBox.minY = Math.min(sourceBox.minY, y);
        sourceBox.maxX = Math.max(sourceBox.maxX, x);
        sourceBox.maxY = Math.max(sourceBox.maxY, y);
      }
      if (exportGray < 250) {
        exportBox.minX = Math.min(exportBox.minX, x);
        exportBox.minY = Math.min(exportBox.minY, y);
        exportBox.maxX = Math.max(exportBox.maxX, x);
        exportBox.maxY = Math.max(exportBox.maxY, y);
      }
      absoluteTotal += diff;
      if (isInk) {
        inkPixels += 1;
        inkTotal += diff;
      }
      if (diff > 20) pixelsOver20 += 1;
      if (diff > 50) pixelsOver50 += 1;
    }

    return {
      meanAll: absoluteTotal / (width * height),
      meanInk: inkPixels ? inkTotal / inkPixels : 0,
      pixelsOver20,
      pixelsOver50,
      inkPixels,
      sourceBox,
      exportBox,
    };
  }, { sourceMarkup, exportMarkup });
}

async function runCase(browser, engine) {
  const page = await browser.newPage({ viewport: VIEWPORT, acceptDownloads: true });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Text" }).click();
  await page.locator("#inscription-wording-input").fill(PROMPT);
  await page.getByRole("button", { name: /Generate AI layout/i }).click();
  await page.waitForFunction(
    () => document.querySelector("#ai-text-layer")?.querySelectorAll("text").length,
    null,
    { timeout: 120000 },
  );

  const previewCounts = await page.evaluate(() => {
    const layer = document.querySelector("#ai-text-layer");
    return {
      text: layer?.querySelectorAll("text").length || 0,
      paths: layer?.querySelectorAll("path").length || 0,
    };
  });
  assert(previewCounts.text > 0, `${engine}: live preview text was not present for fidelity comparison`);

  const sourceMarkup = await getTextOnlyPreviewMarkup(page);
  await page.locator("details summary", { hasText: "Production file" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: /Download workshop SVG/i }).click();
  const download = await downloadPromise;
  const svgPath = path.join(OUT_DIR, `${engine}-workshop.svg`);
  await download.saveAs(svgPath);
  const svgText = fs.readFileSync(svgPath, "utf8");
  assert(!svgText.includes("<text"), `${engine}: export contains live SVG text`);
  assert(!svgText.includes("matrix("), `${engine}: export contains bbox-scaling matrix transforms`);

  const exportMarkup = await getTextOnlyExportMarkup(page, svgText);
  const diff = await compareSvgMarkup(page, sourceMarkup, exportMarkup);
  const boxDelta = Math.max(
    Math.abs(diff.sourceBox.minX - diff.exportBox.minX),
    Math.abs(diff.sourceBox.minY - diff.exportBox.minY),
    Math.abs(diff.sourceBox.maxX - diff.exportBox.maxX),
    Math.abs(diff.sourceBox.maxY - diff.exportBox.maxY),
  );
  assert(boxDelta <= 8, `${engine}: preview/export text block bbox drifted by ${boxDelta}px`);

  const pdfPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: /Review PDF/i }).click();
  const pdf = await pdfPromise;
  const pdfPath = path.join(OUT_DIR, `${engine}-review.pdf`);
  await pdf.saveAs(pdfPath);
  const pdfBytes = fs.readFileSync(pdfPath);
  assert(pdfBytes.subarray(0, 8).toString() === "%PDF-1.3", `${engine}: PDF header was not the vector jsPDF route`);
  assert(!pdfBytes.includes(Buffer.from("/Subtype /Image")), `${engine}: PDF contains an image XObject`);

  await page.close();
  return { engine, previewCounts, diff, svgPath, pdfPath };
}

async function runMobileContainment(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  for (let index = 0; index < 4; index += 1) {
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.includes("Next:")
      );
      if (!button) throw new Error("Mobile next button was not found");
      button.click();
    });
  }
  await page.locator("#inscription-wording-input").fill(PROMPT);
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /Generate AI layout/i.test(candidate.textContent || "")
    );
    if (!button) throw new Error("Generate button was not found");
    button.click();
  });
  await page.waitForFunction(
    () => document.querySelector("#ai-text-layer text"),
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(250);

  const metrics = await page.evaluate(() => {
    const layer = document.querySelector("#ai-text-layer");
    const svg = layer?.ownerSVGElement;
    const proof = svg?.closest(".print-content");
    if (!layer || !svg || !proof) throw new Error("Mobile proof geometry was not available");

    const layerBox = layer.getBBox();
    const viewBox = svg.viewBox.baseVal;
    const proofRect = proof.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      proofLeft: proofRect.left,
      proofRight: proofRect.right,
      textLeft: viewBox.width / 2 + layerBox.x,
      textRight: viewBox.width / 2 + layerBox.x + layerBox.width,
      textTop: viewBox.height / 2 + layerBox.y,
      textBottom: viewBox.height / 2 + layerBox.y + layerBox.height,
      viewBoxWidth: viewBox.width,
      viewBoxHeight: viewBox.height,
    };
  });

  assert(metrics.scrollWidth <= metrics.clientWidth + 1, `mobile: document overflows horizontally (${metrics.scrollWidth}px > ${metrics.clientWidth}px)`);
  assert(metrics.proofLeft >= -1 && metrics.proofRight <= metrics.viewportWidth + 1, "mobile: proof card is clipped by the viewport");
  assert(metrics.textLeft >= 0 && metrics.textRight <= metrics.viewBoxWidth, "mobile: text extends outside the plaque SVG viewBox");
  assert(metrics.textTop >= 0 && metrics.textBottom <= metrics.viewBoxHeight, "mobile: text extends outside the plaque SVG viewBox vertically");
  await page.close();
  return metrics;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const mobile = await runMobileContainment(browser);
  console.log("mobile:", JSON.stringify(mobile));
  const cases = ["ai-typesetter"];
  for (const engine of cases) {
    const result = await runCase(browser, engine);
    console.log(`${engine}:`, JSON.stringify(result.diff));
  }
} finally {
  await browser.close();
}
