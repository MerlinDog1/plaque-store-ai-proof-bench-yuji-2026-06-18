const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4179/";
const PROMPT = "ROSE GARDEN";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

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

  await page.waitForFunction(
    () => /Tweak manually/i.test(document.body.innerText) && document.querySelectorAll("#ai-text-layer text").length > 0,
    null,
    { timeout: 120000 },
  );
  await page.getByRole("button", { name: /Tweak manually/i }).click();

  const boldButton = page.getByRole("button", { name: /Toggle bold for/i }).first();
  const initialWeight = await page.locator("#ai-text-layer text").first().getAttribute("font-weight");
  const initialIsBold = initialWeight === "700" || initialWeight === "bold";
  const firstExpectedWeight = initialIsBold ? "400" : "700";
  const secondExpectedWeight = initialIsBold ? "700" : "400";

  await boldButton.click();
  await page.waitForFunction(
    (expectedWeight) => document.querySelector("#ai-text-layer text")?.getAttribute("font-weight") === expectedWeight,
    firstExpectedWeight,
    { timeout: 5000 },
  );

  await boldButton.click();
  await page.waitForFunction(
    (expectedWeight) => document.querySelector("#ai-text-layer text")?.getAttribute("font-weight") === expectedWeight,
    secondExpectedWeight,
    { timeout: 5000 },
  );

  await page.screenshot({ path: "output/playwright/bold-toggle.png", fullPage: true });
  await browser.close();
  console.log(`Bold toggle changed first SVG text from ${initialWeight || "unset"} to ${firstExpectedWeight} and back to ${secondExpectedWeight}.`);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
