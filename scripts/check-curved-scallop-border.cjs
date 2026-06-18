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

async function setShape(page, shapeLabel) {
  await clickJourney(page, "Size\\/Shape");
  await page.getByRole("button", { name: /Custom size/i }).click();
  await page.getByRole("button", { name: new RegExp(`^${shapeLabel}$`, "i") }).click();
}

async function readScallopPath(page, capDiameter = 10, borderStyle = "Scalloped") {
  await clickJourney(page, "Fixings and border");
  await page.getByRole("button", { name: /^Fixings$/i }).click();
  await page.getByRole("button", { name: /Decorative caps/i }).click();
  if (capDiameter === 15) {
    await page.getByRole("button", { name: /15mm caps/i }).click();
  }
  await page.getByRole("button", { name: /^Border$/i }).click();
  const borderToggle = page.getByRole("button", { name: /^Border (on|off)$/i });
  if (/off/i.test(await borderToggle.textContent())) {
    await borderToggle.click();
  }
  await page.getByRole("button", { name: new RegExp(`^${borderStyle}`, "i") }).click();
  await page.waitForFunction(() => !!document.querySelector("#border-layer .engraved-border"), null, { timeout: 5000 });
  return page.evaluate(() => {
    const path = document.querySelector("#border-layer .engraved-border");
    if (!path) throw new Error("Scalloped border path was not found");
    const circles = Array.from(document.querySelectorAll("#fixings-layer circle"));
    const maxRadius = Math.max(...circles.map((circle) => Number(circle.getAttribute("r")) || 0));
    const holeCenters = circles
      .map((circle) => ({ x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")) }))
      .filter((point, index, list) => Number.isFinite(point.x) && Number.isFinite(point.y)
        && list.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index)
      .sort((a, b) => a.x - b.x);
    const length = path.getTotalLength();
    const samples = Array.from({ length: 241 }, (_, index) => {
      const point = path.getPointAtLength((length * index) / 240);
      return { x: point.x, y: point.y };
    });
    return {
      tagName: path.tagName.toLowerCase(),
      d: path.getAttribute("d") || "",
      holeCount: document.querySelectorAll("#fixings-layer > g").length,
      holeCenters,
      maxRadius,
      samples,
    };
  });
}

function assertScallopDetoursAroundCap(result, label) {
  const [leftHole, rightHole] = result.holeCenters;
  const capRadius = result.maxRadius;

  assert(leftHole && rightHole, `${label} should expose two unique cap centres.`);
  assert(capRadius > 0, `${label} should expose the visible cap radius.`);
  const midX = (leftHole.x + rightHole.x) / 2;

  const leftBand = result.samples.filter((point) => point.x < midX && Math.abs(point.y - leftHole.y) <= capRadius * 0.5);
  const rightBand = result.samples.filter((point) => point.x > midX && Math.abs(point.y - rightHole.y) <= capRadius * 0.5);
  const leftInner = Math.max(...leftBand.map((point) => point.x));
  const rightInner = Math.min(...rightBand.map((point) => point.x));

  assert(Number.isFinite(leftInner), `${label} left notch should have sampled points near the cap centreline.`);
  assert(Number.isFinite(rightInner), `${label} right notch should have sampled points near the cap centreline.`);
  assert(leftInner > leftHole.x + capRadius * 0.8, `${label} left notch should detour around the cap at centreline. path=${leftInner}, cap=${leftHole.x}, radius=${capRadius}`);
  assert(rightInner < rightHole.x - capRadius * 0.8, `${label} right notch should detour around the cap at centreline. path=${rightInner}, cap=${rightHole.x}, radius=${capRadius}`);

  const circleTolerance = capRadius * 0.45;
  const leftArcSamples = result.samples.filter((point) =>
    point.x > leftHole.x + capRadius * 0.5 && Math.abs(point.y - leftHole.y) < capRadius * 1.1
  );
  const rightArcSamples = result.samples.filter((point) =>
    point.x < rightHole.x - capRadius * 0.5 && Math.abs(point.y - rightHole.y) < capRadius * 1.1
  );
  assert(leftArcSamples.length >= 2, `${label} left scallop should expose a circular cap-clearance arc.`);
  assert(rightArcSamples.length >= 2, `${label} right scallop should expose a circular cap-clearance arc.`);
  for (const point of [...leftArcSamples, ...rightArcSamples]) {
    const hole = point.x < midX ? leftHole : rightHole;
    const distance = Math.hypot(point.x - hole.x, point.y - hole.y);
    assert(Math.abs(distance - capRadius) <= circleTolerance,
      `${label} scallop should follow a bigger circle around the cap. point=${JSON.stringify(point)}, cap=${JSON.stringify(hole)}, distance=${distance}, radius=${capRadius}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });

  const singleRect = await readScallopPath(page, 10, "Scalloped");
  const doubleRect = await readScallopPath(page, 10, "Double scalloped");
  assert(singleRect.holeCount === 4 && doubleRect.holeCount === 4,
    `Rectangular scalloped borders should use four cap centres. single=${singleRect.holeCount}, double=${doubleRect.holeCount}`);
  assert(JSON.stringify(singleRect.holeCenters) === JSON.stringify(doubleRect.holeCenters),
    `Double scalloped border should not move decorative caps from single scalloped positions. single=${JSON.stringify(singleRect.holeCenters)}, double=${JSON.stringify(doubleRect.holeCenters)}`);

  await setShape(page, "Oval");
  const oval = await readScallopPath(page);
  assert(oval.tagName === "path", `Expected oval scallop to render as a path, got ${oval.tagName}`);
  assert(oval.holeCount === 2, `Expected oval to use two side fixings, got ${oval.holeCount}`);
  assert(/\bA\b/.test(oval.d), `Expected oval scallop to use circular cap-clearance arcs. d=${oval.d}`);
  assert(!/A\s+7\s+7\s+0\s+1\s+1/i.test(oval.d), "Oval scallop should not use the old circular arc kink.");
  assertScallopDetoursAroundCap(oval, "Oval");

  await setShape(page, "Circle");
  const circle = await readScallopPath(page, 15);
  assert(circle.tagName === "path", `Expected circle scallop to render as a path, got ${circle.tagName}`);
  assert(circle.holeCount === 2, `Expected circle to use two side fixings, got ${circle.holeCount}`);
  assert(/\bA\b/.test(circle.d), `Expected circle scallop to use circular cap-clearance arcs. d=${circle.d}`);
  assert(!/A\s+7\s+7\s+0\s+1\s+1/i.test(circle.d), "Circle scallop should not use the old circular arc kink.");
  assertScallopDetoursAroundCap(circle, "Circle");

  await page.screenshot({ path: "output/playwright/curved-scallop-border.png", fullPage: true });
  await browser.close();
  console.log("Circle and oval scalloped borders use circular clearance arcs around fixings.");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
