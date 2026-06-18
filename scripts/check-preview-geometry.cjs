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

async function configureOvalScallop(page) {
  await clickJourney(page, "Size\\/Shape");
  await page.getByRole("button", { name: /Custom size/i }).click();
  await page.getByRole("button", { name: /^Oval$/i }).click();
  await clickJourney(page, "Fixings and border");
  await page.getByRole("button", { name: /Decorative caps/i }).click();
  await page.getByRole("button", { name: /^Border$/i }).click();
  const borderToggle = page.getByRole("button", { name: /^Border (on|off)$/i });
  if (/off/i.test(await borderToggle.textContent())) {
    await borderToggle.click();
  }
  await page.getByRole("button", { name: /^Scalloped/i }).click();
  await page.waitForFunction(() => !!document.querySelector("#border-layer .engraved-border"), null, { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });
  await desktop.evaluate(() => localStorage.clear());
  await desktop.reload({ waitUntil: "networkidle", timeout: 60000 });

  await clickJourney(desktop, "Fixings and border");
  await desktop.getByRole("button", { name: /^Border$/i }).click();
  const borderToggle = desktop.getByRole("button", { name: /^Border (on|off)$/i });
  if (/off/i.test(await borderToggle.textContent())) {
    await borderToggle.click();
  }
  const desktopGeometry = await desktop.evaluate(() => {
    const plateGroup = document.querySelector("#plate-group");
    const firstPlateChild = plateGroup?.firstElementChild;
    const border = document.querySelector("#border-layer .engraved-border");
    const cutLine = document.querySelector(".cut-line");
    return {
      firstPlateClass: firstPlateChild?.getAttribute("class") || "",
      cutWidth: Number(cutLine?.getAttribute("width")),
      cutHeight: Number(cutLine?.getAttribute("height")),
      borderX: Number(border?.getAttribute("x")),
      borderY: Number(border?.getAttribute("y")),
      borderWidth: Number(border?.getAttribute("width")),
      borderHeight: Number(border?.getAttribute("height")),
    };
  });

  assert(desktopGeometry.firstPlateClass.includes("cut-line"), "The first plaque shape should be the real cut line, not a fake offset edge.");
  assert(desktopGeometry.borderX === 3 && desktopGeometry.borderY === 3, `Single border should sit 3mm from the plaque edge. got ${JSON.stringify(desktopGeometry)}`);
  assert(desktopGeometry.borderWidth === desktopGeometry.cutWidth - 6 && desktopGeometry.borderHeight === desktopGeometry.cutHeight - 6, `Single border dimensions should reflect a 3mm inset. got ${JSON.stringify(desktopGeometry)}`);

  await desktop.getByRole("button", { name: /^Double\s+Two balanced inset/i }).click();
  await desktop.waitForFunction(() => document.querySelectorAll("#border-layer .engraved-border").length === 2, null, { timeout: 5000 });
  const doubleGeometry = await desktop.evaluate(() => {
    const borders = Array.from(document.querySelectorAll("#border-layer .engraved-border"));
    return borders.map((border) => ({
      x: Number(border.getAttribute("x")),
      y: Number(border.getAttribute("y")),
      width: Number(border.getAttribute("width")),
      height: Number(border.getAttribute("height")),
    }));
  });
  assert(doubleGeometry[0]?.x === 3 && doubleGeometry[0]?.y === 3, `Double border outer line should sit 3mm from the edge. got ${JSON.stringify(doubleGeometry)}`);
  assert(doubleGeometry[1]?.x === 5 && doubleGeometry[1]?.y === 5, `Double border inner line should sit 5mm from the edge. got ${JSON.stringify(doubleGeometry)}`);
  assert(doubleGeometry[1]?.width === desktopGeometry.cutWidth - 10 && doubleGeometry[1]?.height === desktopGeometry.cutHeight - 10, `Double border inner dimensions should reflect a 5mm inset. got ${JSON.stringify(doubleGeometry)}`);
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });
  await configureOvalScallop(mobile);
  await mobile.waitForTimeout(200);
  const mobileGeometry = await mobile.evaluate(() => {
    const proof = document.querySelector(".print-content");
    const cutLine = document.querySelector(".cut-line");
    const border = document.querySelector("#border-layer .engraved-border");
    if (!proof || !cutLine || !border) throw new Error("Preview geometry was not available");
    const proofRect = proof.getBoundingClientRect();
    const cutRect = cutLine.getBoundingClientRect();
    const borderRect = border.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      proofLeft: proofRect.left,
      proofRight: proofRect.right,
      cutLeft: cutRect.left,
      cutRight: cutRect.right,
      cutTop: cutRect.top,
      cutBottom: cutRect.bottom,
      borderLeft: borderRect.left,
      borderRight: borderRect.right,
    };
  });

  assert(mobileGeometry.proofLeft >= -1 && mobileGeometry.proofRight <= mobileGeometry.viewportWidth + 1,
    `Mobile proof shell should not overflow the viewport. got ${JSON.stringify(mobileGeometry)}`);
  assert(mobileGeometry.cutLeft >= mobileGeometry.proofLeft - 1 && mobileGeometry.cutRight <= mobileGeometry.proofRight + 1,
    `Mobile plaque cut line should remain fully visible. got ${JSON.stringify(mobileGeometry)}`);
  assert(mobileGeometry.cutLeft >= mobileGeometry.proofLeft + 6 && mobileGeometry.cutRight <= mobileGeometry.proofRight - 6,
    `Mobile plaque cut line needs display breathing room so square corners do not clip. got ${JSON.stringify(mobileGeometry)}`);
  assert(mobileGeometry.borderLeft >= mobileGeometry.proofLeft - 1 && mobileGeometry.borderRight <= mobileGeometry.proofRight + 1,
    `Mobile border should remain fully visible. got ${JSON.stringify(mobileGeometry)}`);
  await mobile.screenshot({ path: "output/playwright/preview-geometry-mobile.png", fullPage: true });
  await mobile.close();

  await browser.close();
  console.log("Preview geometry keeps the plaque visible on mobile, uses 3mm/5mm border insets, and has no fake offset edge.");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
