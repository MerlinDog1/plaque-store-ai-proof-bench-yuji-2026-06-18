const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4179/";
const PROMPT = [
  "COMMEMORATING 100 YEARS OF",
  "HARRISON & LOWE ENGINEERING LTD",
  "1926-2026",
  "Founded in a small workshop by Thomas Harrison and Edward Lowe,",
  "the company has grown through a century of innovation,",
  "craftsmanship and hard work.",
].join("\n");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.route("**/api/gemini/generate-content", async (route) => {
    const svgContent = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="230" height="120" viewBox="-115 -60 230 120">',
      '<text x="0" y="-40" text-anchor="middle" font-family="Cinzel" font-size="16" font-weight="400" letter-spacing="0.08em" fill="currentColor">COMMEMORATING 100 YEARS OF</text>',
      '<text x="0" y="-18" text-anchor="middle" font-family="Cinzel" font-size="22" font-weight="700" letter-spacing="0.04em" fill="currentColor">HARRISON &amp; LOWE ENGINEERING LTD</text>',
      '<text x="0" y="2" text-anchor="middle" font-family="Cinzel" font-size="14" font-weight="400" letter-spacing="0.28em" fill="currentColor">1926-2026</text>',
      '<text x="0" y="18" text-anchor="middle" font-family="Cinzel" font-size="9" font-weight="400" letter-spacing="0.22em" fill="currentColor">□ □</text>',
      '<text x="-92" y="42" text-anchor="start" font-family="EB Garamond" font-size="9" font-weight="400" fill="currentColor"><tspan x="-92" dy="0">Founded in a small workshop by Thomas Harrison and Edward Lowe,</tspan><tspan x="-92" dy="11">the company has grown through a century of innovation,</tspan><tspan x="-92" dy="11">craftsmanship and hard work.</tspan></text>',
      "</svg>",
    ].join("");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: JSON.stringify({
          reasoning: "Mocked decorative symbol response.",
          svgContent,
        }),
      }),
    });
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

  await page.waitForFunction(
    () => document.querySelectorAll("#ai-text-layer [data-generated-symbols='true'] path").length === 2,
    null,
    { timeout: 30000 },
  );

  const result = await page.evaluate(() => {
    const layer = document.querySelector("#ai-text-layer");
    const symbolText = Array.from(layer?.querySelectorAll("text") || [])
      .map((node) => node.textContent || "")
      .filter((text) => /^[\s□■◇◆◊♦✦✧✶✷✹✺✻✼✽✾✿❖❧☙•·▪▫◾◽○●◦]+$/.test(text));
    return {
      symbolTextCount: symbolText.length,
      symbolPathCount: layer?.querySelectorAll("[data-generated-symbols='true'] path").length || 0,
      wordingStillPresent: Boolean(layer?.textContent?.includes("HARRISON & LOWE ENGINEERING LTD")),
    };
  });

  assert(result.symbolTextCount === 0, `Expected no standalone decorative text glyphs, got ${result.symbolTextCount}`);
  assert(result.symbolPathCount === 2, `Expected 2 generated symbol paths, got ${result.symbolPathCount}`);
  assert(result.wordingStillPresent, "Expected normal wording text to remain untouched");

  await page.screenshot({ path: "output/playwright/symbol-ornaments.png", fullPage: true });
  await browser.close();
  console.log(`Converted ${result.symbolPathCount} standalone symbol glyphs to SVG paths; normal wording remained live text.`);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
