const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4179/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });

  const initialState = await page.evaluate(() => {
    const text = document.body.innerText;
    const activeButtons = Array.from(document.querySelectorAll("button[aria-pressed='true']")).map((button) =>
      (button.textContent || "").replace(/\s+/g, " ").trim(),
    );
    return {
      hasFreestanding: /freestanding|l-stand/i.test(text),
      activeButtons,
      hasBorderLayerChildren: (document.querySelector("#border-layer")?.children.length || 0) > 0,
      hasFixingsLayerChildren: (document.querySelector("#fixings-layer")?.children.length || 0) > 0,
    };
  });

  assert(!initialState.hasFreestanding, "Freestanding option/copy should not be present.");
  assert(!initialState.hasBorderLayerChildren, "Initial proof should not render a border.");
  assert(!initialState.hasFixingsLayerChildren, "Initial proof should not render screws or caps.");
  assert(!initialState.activeButtons.some((label) => /border|decorative caps|countersunk screws|hidden adhesive/i.test(label)),
    `Initial state should not preselect border or fixings. Active: ${initialState.activeButtons.join(", ")}`);

  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /^4\s*Fixings\s*and\s*border$/i.test((candidate.textContent || "").trim().replace(/\s+/g, "")),
    );
    if (!button) throw new Error("Fixings and border journey button was not found");
    button.click();
  });

  const panelState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasFreestanding: /freestanding|l-stand/i.test(text),
      hasCapDiameter: /Cap diameter/i.test(text),
      hasInset: /\bInset\b/i.test(text),
      hasScalloped: /\bScalloped\b/i.test(text),
      hasFixingsSegment: Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").trim() === "Fixings"),
      hasBorderSegment: Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").trim() === "Border"),
      activeButtons: Array.from(document.querySelectorAll("button[aria-pressed='true']")).map((button) =>
        (button.textContent || "").replace(/\s+/g, " ").trim(),
      ),
    };
  });

  assert(!panelState.hasFreestanding, "Freestanding option/copy should not be present in Fixings and border.");
  assert(!panelState.hasCapDiameter, "Cap diameter should be hidden until decorative caps are selected.");
  assert(panelState.hasFixingsSegment && panelState.hasBorderSegment, "Fixings and border should use a compact two-tab segmented menu.");
  assert(!panelState.hasInset, "Inset border option should not be customer-facing.");
  assert(!panelState.hasScalloped, "Border style options should stay hidden until the Border segment is opened.");
  assert(!panelState.activeButtons.some((label) => /decorative caps|countersunk screws|hidden adhesive/i.test(label)),
    `Fixings and border should open without a preselected border or fixing. Active: ${panelState.activeButtons.join(", ")}`);

  await page.getByRole("button", { name: /^Border$/i }).click();
  const borderPanelState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasInsetOption: Array.from(document.querySelectorAll("button")).some((button) => /^Inset\b/i.test((button.textContent || "").trim())),
      hasScalloped: /\bScalloped\b/i.test(text),
      activeButtons: Array.from(document.querySelectorAll("button[aria-pressed='true']")).map((button) =>
        (button.textContent || "").replace(/\s+/g, " ").trim(),
      ),
    };
  });
  assert(!borderPanelState.hasInsetOption, "Inset border option should not appear in the border menu.");
  assert(!borderPanelState.hasScalloped, "Border style options should stay hidden until Border is switched on.");
  assert(!borderPanelState.activeButtons.some((label) => /Border off|Single|Double|Scalloped/i.test(label)),
    `Border controls should open without a preselected border style. Active: ${borderPanelState.activeButtons.join(", ")}`);
  await page.getByRole("button", { name: /^Border off$/i }).click();
  const enabledBorderPanelState = await page.evaluate(() => ({
    hasInsetOption: Array.from(document.querySelectorAll("button")).some((button) => /^Inset\b/i.test((button.textContent || "").trim())),
    hasScallopedOption: Array.from(document.querySelectorAll("button")).some((button) => /^Scalloped/i.test((button.textContent || "").trim())),
  }));
  assert(!enabledBorderPanelState.hasInsetOption, "Inset border option should not appear after Border is switched on.");
  assert(enabledBorderPanelState.hasScallopedOption, "Full-size plaques should still offer scalloped borders after Border is switched on.");
  await page.getByRole("button", { name: /^Fixings$/i }).click();

  await page.getByRole("button", { name: /Decorative caps/i }).click();
  await page.waitForFunction(() => /Cap diameter/i.test(document.body.innerText), null, { timeout: 5000 });
  await page.getByRole("button", { name: /Countersunk screws/i }).click();
  await page.waitForFunction(() => !/Cap diameter/i.test(document.body.innerText), null, { timeout: 5000 });

  await page.getByRole("button", { name: /Expand proof into 3D preview/i }).click();
  await page.waitForFunction(() => document.querySelector(".proofbench-stage")?.classList.contains("is-expanded"), null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector(".three-plaque-preview")?.getAttribute("data-ready") === "true", null, { timeout: 12000 });
  const desktopExpandState = await page.evaluate(() => ({
    expanded: document.querySelector(".proofbench-stage")?.classList.contains("is-expanded") || false,
    modalOpen: !!document.querySelector("[role='dialog']"),
    buttonPressed: document.querySelector(".proofbench-expand-button")?.getAttribute("aria-pressed"),
    hasThreeCanvas: !!document.querySelector(".three-plaque-preview canvas"),
    threeDisplay: window.getComputedStyle(document.querySelector(".three-plaque-preview")).display,
    threeTexture: document.querySelector(".three-plaque-preview")?.getAttribute("data-texture"),
  }));
  assert(desktopExpandState.expanded, "Desktop floating proof button should expand the proof stage.");
  assert(!desktopExpandState.modalOpen, "Desktop floating proof button should not open the realistic-preview modal.");
  assert(desktopExpandState.buttonPressed === "true", "Desktop floating proof button should expose pressed state.");
  assert(desktopExpandState.hasThreeCanvas, "Expanded desktop proof should mount a Three.js canvas.");
  assert(desktopExpandState.threeDisplay !== "none", "Expanded desktop proof should visibly show the Three.js preview.");
  assert(desktopExpandState.threeTexture === "svg", `Desktop Three.js preview should use the live SVG proof texture. State: ${JSON.stringify(desktopExpandState)}`);
  const desktopPixelState = await page.evaluate(() => {
    const canvas = document.querySelector(".three-plaque-preview canvas");
    if (!canvas) return { samples: 0, nonBlank: 0, colours: 0 };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { samples: 0, nonBlank: 0, colours: 0 };

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const points = [
      [0.35, 0.35], [0.5, 0.35], [0.65, 0.35],
      [0.35, 0.5], [0.5, 0.5], [0.65, 0.5],
      [0.35, 0.65], [0.5, 0.65], [0.65, 0.65],
    ];
    const colours = new Set();
    let nonBlank = 0;
    const pixel = new Uint8Array(4);
    for (const [px, py] of points) {
      gl.readPixels(Math.floor(w * px), Math.floor(h * py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const key = Array.from(pixel).join(",");
      colours.add(key);
      if (pixel[3] > 0 && (pixel[0] + pixel[1] + pixel[2]) > 18) nonBlank += 1;
    }
    return { samples: points.length, nonBlank, colours: colours.size };
  });
  assert(desktopPixelState.nonBlank >= 3, `Desktop Three.js preview should render nonblank pixels. Pixel state: ${JSON.stringify(desktopPixelState)}`);
  assert(desktopPixelState.colours >= 2, `Desktop Three.js preview should render more than one sampled colour. Pixel state: ${JSON.stringify(desktopPixelState)}`);
  await page.getByRole("button", { name: /Close expanded 3D proof/i }).click();
  await page.waitForFunction(() => !document.querySelector(".proofbench-stage")?.classList.contains("is-expanded"), null, { timeout: 5000 });

  await page.getByRole("button", { name: /Go to Size\/Shape/i }).click();
  await page.getByRole("button", { name: /Bench plaque/i }).click();
  await page.waitForFunction(() => {
    const svg = document.querySelector(".proofbench-svg-preview svg");
    return svg?.viewBox.baseVal.width === 150 && svg?.viewBox.baseVal.height === 50;
  }, null, { timeout: 5000 });
  await page.getByRole("button", { name: /Go to Fixings and border/i }).click();
  await page.getByRole("button", { name: /^Border$/i }).click();
  if (/off/i.test(await page.getByRole("button", { name: /^Border (on|off)$/i }).textContent())) {
    await page.getByRole("button", { name: /^Border off$/i }).click();
  }
  const benchBorderMenu = await page.evaluate(() => ({
    hasInsetOption: Array.from(document.querySelectorAll("button")).some((button) => /^Inset\b/i.test((button.textContent || "").trim())),
    hasScallopedOption: Array.from(document.querySelectorAll("button")).some((button) => /^Scalloped/i.test((button.textContent || "").trim())),
    hasDoubleScallopedOption: Array.from(document.querySelectorAll("button")).some((button) => /^Double scalloped/i.test((button.textContent || "").trim())),
  }));
  assert(!benchBorderMenu.hasInsetOption, "Bench plaque border menu should not offer Inset.");
  assert(!benchBorderMenu.hasScallopedOption && !benchBorderMenu.hasDoubleScallopedOption, "Bench plaque class sizes should not offer scalloped borders.");
  await page.getByRole("button", { name: /Expand proof into 3D preview/i }).click();
  await page.waitForFunction(() => document.querySelector(".three-plaque-preview")?.getAttribute("data-ready") === "true", null, { timeout: 12000 });
  const benchPixelState = await page.evaluate(() => {
    const canvas = document.querySelector(".three-plaque-preview canvas");
    if (!canvas) return { samples: 0, darkPixels: 0, texture: null };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { samples: 0, darkPixels: 0, texture: null };

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const pixel = new Uint8Array(4);
    let samples = 0;
    let darkPixels = 0;
    for (let x = 0.28; x <= 0.72; x += 0.025) {
      for (let y = 0.36; y <= 0.60; y += 0.025) {
        gl.readPixels(Math.floor(w * x), Math.floor(h * (1 - y)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples += 1;
        if (pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] < 160) darkPixels += 1;
      }
    }
    return {
      samples,
      darkPixels,
      texture: document.querySelector(".three-plaque-preview")?.getAttribute("data-texture"),
    };
  });
  assert(benchPixelState.texture === "svg", `Bench plaque 3D preview should use the live SVG proof texture. State: ${JSON.stringify(benchPixelState)}`);
  assert(benchPixelState.darkPixels >= 3,
    `Bench plaque 3D preview should show the proof text/face texture, not only the brown side material. State: ${JSON.stringify(benchPixelState)}`);
  await page.getByRole("button", { name: /Close expanded 3D proof/i }).click();
  await page.waitForFunction(() => !document.querySelector(".proofbench-stage")?.classList.contains("is-expanded"), null, { timeout: 5000 });
  await page.getByRole("button", { name: /Go to Wood/i }).click();
  await page.getByRole("button", { name: /^Add £69$/i }).click();
  await page.waitForFunction(() => !!document.querySelector(".wood-backing"), null, { timeout: 5000 });
  const benchWoodState = await page.evaluate(() => ({
    hasWood: !!document.querySelector(".wood-backing"),
    text: document.body.innerText,
  }));
  assert(benchWoodState.hasWood, "Bench-format plaques should allow customers to add a wood backing.");
  assert(/Added £69/.test(benchWoodState.text), "Bench wood toggle should show the selected wood add-on price.");

  await page.getByRole("button", { name: /Go to Material/i }).click();
  await page.getByRole("button", { name: /Brushed steel/i }).click();
  await page.waitForFunction(() => {
    const cutLine = document.querySelector(".cut-line");
    return cutLine?.getAttribute("fill") === "url(#brushedSteel)";
  }, null, { timeout: 5000 });
  const woodBackedSteelTexture = await page.evaluate(() => {
    const pattern = document.querySelector("#brushedSteelTexture");
    const image = pattern?.querySelector("image");
    const overlay = Array.from(document.querySelectorAll("#plate-group > .visual-effect"))
      .find((node) => node.getAttribute("fill") === "url(#brushedSteelTexture)");
    return {
      viewBox: document.querySelector(".proofbench-svg-preview svg")?.getAttribute("viewBox"),
      hasWood: !!document.querySelector(".wood-backing"),
      patternX: pattern?.getAttribute("x"),
      patternY: pattern?.getAttribute("y"),
      imageX: image?.getAttribute("x"),
      imageY: image?.getAttribute("y"),
      imageWidth: image?.getAttribute("width"),
      imageHeight: image?.getAttribute("height"),
      overlayX: overlay?.getAttribute("x"),
      overlayY: overlay?.getAttribute("y"),
      overlayWidth: overlay?.getAttribute("width"),
      overlayHeight: overlay?.getAttribute("height"),
    };
  });
  assert(woodBackedSteelTexture.hasWood, `Stainless texture regression should run with wood backing active. State: ${JSON.stringify(woodBackedSteelTexture)}`);
  assert(woodBackedSteelTexture.patternX === "12.5" && woodBackedSteelTexture.patternY === "12.5",
    `Wood-backed metal texture pattern should be anchored to the inset metal face. State: ${JSON.stringify(woodBackedSteelTexture)}`);
  assert(woodBackedSteelTexture.imageX === "0" && woodBackedSteelTexture.imageY === "0",
    `Wood-backed stainless texture image should start inside its pattern tile, not be offset a second time. State: ${JSON.stringify(woodBackedSteelTexture)}`);
  assert(woodBackedSteelTexture.overlayX === "12.5" && woodBackedSteelTexture.overlayY === "12.5",
    `Wood-backed stainless overlay should still sit on the metal face. State: ${JSON.stringify(woodBackedSteelTexture)}`);
  assert(woodBackedSteelTexture.imageWidth === woodBackedSteelTexture.overlayWidth && woodBackedSteelTexture.imageHeight === woodBackedSteelTexture.overlayHeight,
    `Wood-backed stainless scan should be sized to the metal face, not the wood board. State: ${JSON.stringify(woodBackedSteelTexture)}`);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });

  const clickMobileButton = async (pattern) => {
    await mobile.evaluate((source) => {
      const re = new RegExp(source, "i");
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        re.test((candidate.textContent || "").replace(/\s+/g, " ").trim()),
      );
      if (!button) throw new Error(`Mobile button not found: ${source}`);
      button.click();
    }, pattern.source);
    await mobile.waitForTimeout(100);
  };

  await clickMobileButton(/Colour/);
  await clickMobileButton(/^Cream$/);
  await clickMobileButton(/Fixings/);
  await clickMobileButton(/Decorative caps/);
  await clickMobileButton(/Wood/);
  await clickMobileButton(/^Add £/);
  await clickMobileButton(/Bevel edge/);

  await mobile.getByRole("button", { name: /Expand proof into 3D preview/i }).click();
  await mobile.waitForFunction(() => document.querySelector(".proofbench-stage")?.classList.contains("is-expanded"), null, { timeout: 5000 });
  await mobile.waitForFunction(() => document.querySelector(".three-plaque-preview")?.getAttribute("data-ready") === "true", null, { timeout: 10000 });
  const mobileState = await mobile.evaluate(() => ({
    expanded: document.querySelector(".proofbench-stage")?.classList.contains("is-expanded") || false,
    modalOpen: !!document.querySelector("[role='dialog']"),
    buttonPressed: document.querySelector(".proofbench-expand-button")?.getAttribute("aria-pressed"),
    hasThreeCanvas: !!document.querySelector(".three-plaque-preview canvas"),
    threeDisplay: window.getComputedStyle(document.querySelector(".three-plaque-preview")).display,
    threeTexture: document.querySelector(".three-plaque-preview")?.getAttribute("data-texture"),
    fontsOutlined: document.querySelector(".three-plaque-preview")?.getAttribute("data-fonts-outlined"),
    metalThicknessMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-metal-thickness-mm"),
    woodThicknessMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-wood-thickness-mm"),
    woodOverhangMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-wood-overhang-mm"),
    woodEdge: document.querySelector(".three-plaque-preview")?.getAttribute("data-wood-edge"),
    woodBevelSizeMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-wood-bevel-size-mm"),
    woodBevelSides: document.querySelector(".three-plaque-preview")?.getAttribute("data-wood-bevel-sides"),
    capThicknessMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-cap-thickness-mm"),
    faceWidthMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-face-width-mm"),
    faceHeightMm: document.querySelector(".three-plaque-preview")?.getAttribute("data-face-height-mm"),
    proofTextFills: Array.from(document.querySelectorAll("#ai-text-layer text, #ai-text-layer tspan")).map((node) =>
      window.getComputedStyle(node).fill,
    ),
  }));
  assert(mobileState.expanded, "Mobile floating proof button should expand the proof stage.");
  assert(!mobileState.modalOpen, "Mobile floating proof button should not open the realistic-preview modal.");
  assert(mobileState.buttonPressed === "true", "Mobile floating proof button should expose pressed state.");
  assert(mobileState.hasThreeCanvas, "Expanded mobile proof should mount a Three.js canvas.");
  assert(mobileState.threeDisplay !== "none", "Expanded mobile proof should show the Three.js preview.");
  assert(mobileState.threeTexture === "svg", `Three.js preview should use the live SVG proof texture, not a fallback. Texture: ${mobileState.threeTexture}`);
  assert(mobileState.fontsOutlined === "true", `Three.js SVG proof texture should outline live text before rasterizing so preview fonts match 2D. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.metalThicknessMm === "1.5", `3D preview should model the plaque face as 1.5mm metal. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.woodThicknessMm === "15", `3D preview should model the wood backing as 15mm. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.woodOverhangMm === "12.5", `3D preview should model the wood backing as 12.5mm wider on each edge. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.woodEdge === "bevel", `3D preview should expose the selected bevelled wood edge. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.woodBevelSizeMm === "8.4", `3D preview should add a reduced but still visible real bevel to the bevelled wood edge. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.woodBevelSides === "front", `3D preview should bevel only the visible/front face of the wood backing, not both front and back. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.capThicknessMm === "2", `3D preview should model decorative caps as 2mm raised hardware. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.faceWidthMm === "297" && mobileState.faceHeightMm === "210",
    `3D proof texture should be cropped to the metal plaque face, not stretched over the larger wood board. State: ${JSON.stringify(mobileState)}`);
  assert(mobileState.proofTextFills.some((fill) => fill === "rgb(245, 230, 200)"),
    `3D preview source SVG should preserve selected cream text colour. Fills: ${mobileState.proofTextFills.join(", ")}`);

  const pixelState = await mobile.evaluate(() => {
    const canvas = document.querySelector(".three-plaque-preview canvas");
    if (!canvas) return { samples: 0, nonBlank: 0, colours: 0 };
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { samples: 0, nonBlank: 0, colours: 0 };

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const points = [
      [0.35, 0.35], [0.5, 0.35], [0.65, 0.35],
      [0.35, 0.5], [0.5, 0.5], [0.65, 0.5],
      [0.35, 0.65], [0.5, 0.65], [0.65, 0.65],
    ];
    const colours = new Set();
    let nonBlank = 0;
    const pixel = new Uint8Array(4);
    for (const [px, py] of points) {
      gl.readPixels(Math.floor(w * px), Math.floor(h * py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const key = Array.from(pixel).join(",");
      colours.add(key);
      if (pixel[3] > 0 && (pixel[0] + pixel[1] + pixel[2]) > 18) nonBlank += 1;
    }
    return { samples: points.length, nonBlank, colours: colours.size };
  });
  assert(pixelState.nonBlank >= 3, `Three.js preview should render nonblank pixels. Pixel state: ${JSON.stringify(pixelState)}`);
  assert(pixelState.colours >= 2, `Three.js preview should render more than one sampled colour. Pixel state: ${JSON.stringify(pixelState)}`);

  await browser.close();
  console.log("Fixings/border UI starts blank, and the floating proof button opens the physically layered Three.js preview on desktop and mobile.");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
