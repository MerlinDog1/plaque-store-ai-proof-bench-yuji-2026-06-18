const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4179/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickJourney(page, label) {
  await page.evaluate((stepLabel) => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      new RegExp(`^\\d+\\s*${stepLabel}$`, "i").test((candidate.textContent || "").trim().replace(/\s+/g, "")),
    );
    if (!button) throw new Error(`${stepLabel} journey button was not found`);
    button.click();
  }, label.replace(/\s+/g, "\\s*"));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });

  await clickJourney(page, "Text");
  await page.locator("#inscription-wording-input").fill("by Tom");
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /Generate AI layout/i.test(candidate.textContent || ""),
    );
    if (!button) throw new Error("Generate button was not found");
    button.click();
  });

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("#ai-text-layer tspan")).some((node) => (node.textContent || "").trim() === "Tom"),
    null,
    { timeout: 120000 },
  );

  const byLine = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll("#ai-text-layer tspan")).map((node) => (node.textContent || "").trim());
    const byIndex = lines.findIndex((line) => /^by$/i.test(line));
    return {
      lines,
      byIndex,
      nextLine: byIndex >= 0 ? lines[byIndex + 1] : "",
      hasCombinedByNameLine: lines.some((line) => /^by\s+Tom$/i.test(line)),
    };
  });

  assert(byLine.byIndex >= 0, `Expected "by" to be split onto its own line. Lines: ${byLine.lines.join(" | ")}`);
  assert(byLine.nextLine === "Tom", `Expected the name after "by", got "${byLine.nextLine}"`);
  assert(!byLine.hasCombinedByNameLine, "Expected no combined 'by Tom' visual line.");

  await clickJourney(page, "Size\\/Shape");
  await page.getByRole("button", { name: /Custom size/i }).click();
  await page.locator('input[type="number"]').nth(0).fill("150");
  await page.locator('input[type="number"]').nth(0).press("Enter");
  await page.locator('input[type="number"]').nth(1).fill("50");
  await page.locator('input[type="number"]').nth(1).press("Enter");

  await clickJourney(page, "Fixings and border");
  await page.getByRole("button", { name: /Decorative caps/i }).click();
  await page.getByRole("button", { name: /^Border$/i }).click();
  await page.getByRole("button", { name: /^Border off$/i }).click();

  const smallFixings = await page.evaluate(() => ({
    holeCount: document.querySelectorAll("#fixings-layer > g").length,
    yValues: Array.from(document.querySelectorAll("#fixings-layer circle")).map((circle) => Number(circle.getAttribute("cy"))),
    borderChildren: document.querySelector("#border-layer")?.children.length || 0,
  }));

  assert(smallFixings.holeCount === 2, `Expected 2 side fixings under 80mm high, got ${smallFixings.holeCount}`);
  assert(smallFixings.yValues.every((y) => Math.abs(y - 25) < 0.2), `Expected side fixings to sit on the vertical middle line, got ${smallFixings.yValues.join(", ")}`);
  assert(smallFixings.borderChildren > 0, "Expected border to still render when enabled on a bench-format small plaque.");

  await page.screenshot({ path: "output/playwright/small-fixings-by-line.png", fullPage: true });
  await browser.close();
  console.log("Under-80mm plaques use two centred side fixings, bench border still renders, and by/name lines split cleanly.");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
