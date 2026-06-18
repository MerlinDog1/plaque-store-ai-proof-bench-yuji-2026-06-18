const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4179/";
const PROMPT = "THE OLD MILL\nESTABLISHED 1847\nRESTORED BY THE VILLAGE TRUST\n2026";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let geminiStatus = null;

  page.on("response", async (response) => {
    if (response.url().includes("/api/gemini/generate-content")) {
      geminiStatus = response.status();
    }
  });

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });

  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /^6\s*Text$/i.test((candidate.textContent || "").trim().replace(/\s+/g, "")),
    );
    if (!button) throw new Error("Text journey button was not found");
    button.click();
  });

  await page.locator("#inscription-wording-input").fill(PROMPT);
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /Generate AI layout/i.test(candidate.textContent || ""),
    );
    if (!button) throw new Error("Generate button was not found");
    button.click();
  });

  const started = Date.now();
  while (geminiStatus === null && Date.now() - started < 150000) {
    await page.waitForTimeout(500);
  }

  assert(geminiStatus === 200, `Expected Gemini proxy HTTP 200, got ${geminiStatus}`);
  await page.waitForFunction(
    () => document.body.innerText.includes("Regenerate") && document.body.innerText.includes("Tweak manually"),
    null,
    { timeout: 30000 },
  );
  const textCount = await page.locator("#ai-text-layer text").count();
  assert(textCount > 0, "Expected Gemini-authored SVG text elements");
  await page.screenshot({ path: "output/playwright/gemini-authored-wired.png", fullPage: true });

  await browser.close();
  console.log(`Gemini authored proof rendered ${textCount} SVG text elements via proxy HTTP ${geminiStatus}.`);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
