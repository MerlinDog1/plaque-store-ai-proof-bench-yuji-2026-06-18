const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4179/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickJourneyStep(page, compactLabel) {
  await page.evaluate((label) => {
    const normalizedLabel = label.replace(/\s+/g, "");
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      (candidate.textContent || "").trim().replace(/\s+/g, "").includes(normalizedLabel),
    );
    if (!button) throw new Error(`${label} journey button was not found`);
    button.click();
  }, compactLabel);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });

  await page.waitForFunction(() => /1\s*Material/.test(document.body.innerText) && /2\s*Size\/Shape/.test(document.body.innerText), null, { timeout: 5000 });
  await clickJourneyStep(page, "2Size");
  await page.waitForFunction(() => /A4 landscape[\s\S]*from £169/.test(document.body.innerText), null, { timeout: 5000 });
  await page.waitForFunction(() => /Bench plaque[\s\S]*from £69/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "1Material");
  await page.getByRole("button", { name: /Brushed steel/i }).click();
  await clickJourneyStep(page, "2Size");
  await page.waitForFunction(() => /A4 landscape[\s\S]*from £149/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "1Material");
  await page.getByRole("button", { name: /Polished steel/i }).click();
  await clickJourneyStep(page, "2Size");
  await page.waitForFunction(() => /A4 landscape[\s\S]*from £169/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "1Material");
  await page.getByRole("button", { name: /Aged brass/i }).click();
  await clickJourneyStep(page, "2Size");
  await page.waitForFunction(() => /A4 landscape[\s\S]*from £189/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "5Wood");
  await page.getByRole("button", { name: /^Add £99$/i }).click();
  await clickJourneyStep(page, "7Proof");
  await page.waitForFunction(() => /£288\.00/.test(document.body.innerText), null, { timeout: 5000 });

  const pricingText = await page.evaluate(() => document.body.innerText);
  assert(/\+£99/i.test(pricingText), "Wood summary should show the wood add-on price after selecting wood backing.");

  await clickJourneyStep(page, "2Size");
  await page.getByRole("button", { name: /Bench plaque/i }).click();
  await clickJourneyStep(page, "7Proof");
  await page.waitForFunction(() => /£79\.00/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "1Material");
  await page.getByRole("button", { name: /Brushed steel/i }).click();
  await clickJourneyStep(page, "7Proof");
  await page.waitForFunction(() => /£59\.00/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "1Material");
  await page.getByRole("button", { name: /Polished steel/i }).click();
  await clickJourneyStep(page, "7Proof");
  await page.waitForFunction(() => /£69\.00/.test(document.body.innerText), null, { timeout: 5000 });

  await clickJourneyStep(page, "2Size");
  await page.getByRole("button", { name: /Custom size/i }).click();
  const dimensionInputs = page.locator('input[type="number"]');
  await dimensionInputs.nth(0).fill("400");
  await dimensionInputs.nth(1).fill("200");
  await page.waitForFunction(() => /Estimate £199/.test(document.body.innerText), null, { timeout: 5000 });

  await page.getByRole("button", { name: /^Oval$/i }).click();
  await page.waitForFunction(() => /Estimate £209/.test(document.body.innerText), null, { timeout: 5000 });

  await page.getByRole("button", { name: /^Circle$/i }).click();
  await page.waitForFunction(() => /Estimate £349/.test(document.body.innerText), null, { timeout: 5000 });

  await page.getByRole("button", { name: /^Rectangle$/i }).click();
  await dimensionInputs.nth(0).fill("700");
  await dimensionInputs.nth(1).fill("500");
  await page.waitForFunction(() => /600 x 500mm/.test(document.body.innerText), null, { timeout: 5000 });
  await page.waitForFunction(() => /Estimate £739/.test(document.body.innerText), null, { timeout: 5000 });

  await browser.close();
  console.log("Pricing uses the Excel 2026 formula, 40% target margin, custom-size updates, shaped uplift, 600mm max dimensions, and oversized bed uplift.");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
