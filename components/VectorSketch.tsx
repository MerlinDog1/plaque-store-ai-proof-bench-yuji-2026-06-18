
import React, { useState, useEffect, useRef } from 'react';
import { hasBrowserGeminiProxy, getGeminiClient } from "../services/geminiClient";

// --- Types & Globals ---
declare global {
  interface Window {
    cv: any;
    ImageTracer: any;
    paper: any;
    ClipperLib: any;
  }
}

type ViewMode = 'sketch' | 'style' | 'prompt' | 'vectorize';

const STYLE_MAP: Record<string, { name: string, prompt: string }> = {
  'line-art': { name: 'Line Art', prompt: "A detailed black and white line art illustration, featuring clean, bold outlines and intricate details, with no solid shading – instead using cross‐hatched lines for any shadows. The style is monochromatic, high-contrast, with the simple, classic look of pen-and-ink line art on white paper." },
  'halftone': { name: 'Halftone', prompt: "A halftone-style black and white image, composed of thousands of tiny ink dots – larger and denser in the shadows, and fine and sparse in the highlights. The overall look is high-contrast and monochrome, with a classic printed texture that captures the retro halftone feel." },
  'woodcut': { name: 'Woodcut', prompt: "An intricate woodcut-style illustration, depicted with bold, carved outlines and dense hatched textures where shadows fall, while highlights are the paper showing through. The image has the slightly rough, organic line quality of a traditional woodblock print, with high-contrast blacks and whites." },
  'pen-ink': { name: 'Pen & Ink', prompt: "An intricate pen-and-ink drawing in black and white. Every texture is rendered with fine ink lines – using cross-hatching for shaded sides and stippling to imply depth. The style emphasizes precise, thin outlines and meticulous detail, with no solid washes of gray." },
  'engraving': { name: 'Engraving', prompt: "An engraving-style black and white illustration. The image is composed of fine, meticulous line work, with features rendered with hundreds of tiny engraved lines and cross-hatches to show dark areas. The overall style mimics an 18th-century intaglio print – extremely detailed and line-heavy." },
  'stippling': { name: 'Stippling', prompt: "A stippling-style black and white illustration. The entire image is composed of tiny black ink dots on white – the highest concentration of dots forms the darkest parts, while the lightest areas have only a few speckled dots. There are no drawn lines; instead, shape emerges from the patterns of dots." },
  'vector-logo': { name: 'Vector Logo', prompt: "A high-contrast, minimalist vector logo in pure black and white. The design must be composed entirely of solid black shapes with sharp, clean edges against a white background. There should be absolutely no gradients, shading, textures, or fine details. The style is bold, graphic, and modern." },
  'noir-comic': { name: 'Noir Comic', prompt: "A comic-book noir style illustration, in pure black and white. The scene uses heavy shadows and high contrast. The inking is strong and graphic – thick outlines on figures, and deep black ink used for shadows. No gray tones; all shading is achieved through stark black shapes." },
};

const getCreativityPrompt = (val: number) => {
  if (val >= 90) return "The final image must be a highly faithful and accurate reproduction of the subject and composition.";
  if (val >= 70) return "Adhere closely to the subject and composition, allowing for minor stylistic interpretation.";
  if (val >= 40) return "Maintain the general subject and composition, but feel free to take some artistic liberties with the details and mood.";
  if (val >= 20) return "Use the provided input as inspiration for a more creative and varied interpretation.";
  return "Take significant creative freedom. Use the input merely as a starting point for a loose, artistic, and imaginative reinterpretation.";
};

// --- Helpers ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(blob);
  });
};

export const VectorSketch: React.FC = () => {
  // State
  const [view, setView] = useState<ViewMode>('sketch');
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [libsLoaded, setLibsLoaded] = useState(false);

  // Inputs
  const [sfpImage, setSfpImage] = useState<{data: string, mime: string} | null>(null);
  const [stBase, setStBase] = useState<{data: string, mime: string} | null>(null);
  const [stStyle, setStStyle] = useState<{data: string, mime: string} | null>(null);
  const [prompt, setPrompt] = useState("");

  // Settings
  const [activeStyle, setActiveStyle] = useState("line-art");
  const [creativity, setCreativity] = useState(50);
  const [isolateSubject, setIsolateSubject] = useState(true);

  // Results
  const [generatedImage, setGeneratedImage] = useState<string | null>(null); // Data URL
  const [finalSvg, setFinalSvg] = useState<string | null>(null);

  // Advanced Engine State
  const [ut, setUt] = useState({
    prescale: 4,
    brightness: 0,
    contrast: 0,
    binMode: 'off', // off, global, adaptive, canny
    threshold: 128,
    adaptiveBlock: 11,
    adaptiveC: 2,
    canny1: 50,
    canny2: 100,
    blur: false, blurK: 3,
    unsharp: false, unsharpR: 1.5, unsharpA: 1.0,
    median: false, medianK: 3,
    morphOp: 'none', morphK: 3,
    // Tracer
    tiled: true, tileSize: 512, overlap: 256,
    ltres: 0.5, qtres: 0.5, pathomit: 1,
    colorsampling: 2, numberofcolors: 2, mincolorratio: 0, colorquantcycles: 3,
    blurradius: 0, blurdelta: 20, strokewidth: 0,
    // Post
    smoothTolerance: 1.0,
    union: false
  });

  const canvasOrigRef = useRef<HTMLCanvasElement>(null);
  const canvasPreRef = useRef<HTMLCanvasElement>(null);

  // --- 1. Load Libraries ---
  useEffect(() => {
    let mounted = true;
    const scripts = [
      "https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js",
      "https://docs.opencv.org/4.8.0/opencv.js",
      "https://cdn.jsdelivr.net/npm/paper@0.12.17/dist/paper-full.min.js",
      "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js"
    ];

    const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = reject;
      document.body.appendChild(s);
    });

    Promise.all(scripts.map(loadScript)).then(() => {
      // Wait for OpenCV init
      const checkCV = setInterval(() => {
        if (window.cv && window.cv.Mat && mounted) {
          clearInterval(checkCV);
          setLibsLoaded(true);
        }
      }, 100);
    }).catch(e => console.error("Lib load error", e));

    return () => { mounted = false; };
  }, []);

  // --- 2. AI Logic ---
  const handleGenerate = async () => {
    if (!(await hasBrowserGeminiProxy())) { alert("Connect GEMINI_API_KEY on the server first."); return; }

    setLoadingMsg("AI is thinking...");
    setFinalSvg(null); // Reset result

    try {
      const ai = getGeminiClient();
      const styleInfo = STYLE_MAP[activeStyle];
      const creativityText = getCreativityPrompt(creativity);
      let resultData: string | undefined;

      // MODE: SKETCH FROM PHOTO
      if (view === 'sketch') {
        if (!sfpImage) throw new Error("Upload an image.");
        let p = `Transform this image into a black and white sketch. Style: ${styleInfo.prompt}.`;
        if (isolateSubject) p += " Isolate the main subject on a pure white background.";
        if (prompt) p += ` Additional instructions: ${prompt}.`;
        p += ` ${creativityText}`;

        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { text: p },
              { inlineData: { mimeType: sfpImage.mime, data: sfpImage.data } }
            ]
          }
        });
        resultData = resp.candidates?.[0]?.content?.parts?.find(x => x.inlineData)?.inlineData?.data;
      }

      // MODE: STYLE TRANSFER
      else if (view === 'style') {
        if (!stBase || !stStyle) throw new Error("Upload base and style images.");
        setLoadingMsg("Analyzing style...");

        // Step 1: Analyze Style
        const analysisResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { text: "Describe the artistic style of this image in detail (medium, texture, linework, mood)." },
              { inlineData: { mimeType: stStyle.mime, data: stStyle.data } }
            ]
          }
        });
        const styleDesc = analysisResp.text;
        if (!styleDesc) throw new Error("Could not analyze style.");

        // Step 2: Apply Style
        setLoadingMsg("Applying style...");
        let p = `Transform this base image into a black and white sketch. The style must strictly follow this description: "${styleDesc}".`;
        if (prompt) p += ` Refinement: ${prompt}.`;
        p += ` ${creativityText}`;

        const genResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { text: p },
              { inlineData: { mimeType: stBase.mime, data: stBase.data } }
            ]
          }
        });
        resultData = genResp.candidates?.[0]?.content?.parts?.find(x => x.inlineData)?.inlineData?.data;
      }

      // MODE: PROMPT
      else if (view === 'prompt') {
        if (!prompt) throw new Error("Enter a prompt.");
        const p = `${prompt}. ${creativityText} Style: ${styleInfo.prompt} Black and white vector style.`;

        // Using Imagen 3 for pure text gen
        const resp = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: p,
          config: { numberOfImages: 1, aspectRatio: '1:1' }
        });
        resultData = resp.generatedImages?.[0]?.image?.imageBytes;
      }

      if (resultData) {
        setGeneratedImage(`data:image/png;base64,${resultData}`);
        setView('vectorize');
      } else {
        throw new Error("No image returned.");
      }

    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingMsg(null);
    }
  };

  // --- 3. UltraTrace Logic ---

  // Load image into canvas when view switches to vectorize or image updates
  useEffect(() => {
    if (view === 'vectorize' && generatedImage && canvasOrigRef.current) {
      const img = new Image();
      img.onload = () => {
        const cvs = canvasOrigRef.current!;
        cvs.width = img.width;
        cvs.height = img.height;
        const ctx = cvs.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        runPreprocess(); // Auto-run pre-process
      };
      img.src = generatedImage;
    }
  }, [view, generatedImage]);

  const runPreprocess = () => {
    if (!window.cv || !canvasOrigRef.current || !canvasPreRef.current) return;
    try {
      const src = window.cv.imread(canvasOrigRef.current);
      const dst = new window.cv.Mat();

      // 1. Resize (Prescale)
      let dsize = new window.cv.Size(src.cols * ut.prescale, src.rows * ut.prescale);
      window.cv.resize(src, dst, dsize, 0, 0, window.cv.INTER_LINEAR);

      // 2. Convert to Gray
      window.cv.cvtColor(dst, dst, window.cv.COLOR_RGBA2GRAY, 0);

      // 3. Brightness/Contrast
      if (ut.brightness !== 0 || ut.contrast !== 0) {
        const alpha = (ut.contrast + 100) / 100;
        dst.convertTo(dst, -1, alpha, ut.brightness);
      }

      // 4. Noise Reduction
      if (ut.blur) {
        let k = ut.blurK % 2 === 0 ? ut.blurK + 1 : ut.blurK;
        window.cv.GaussianBlur(dst, dst, new window.cv.Size(k, k), 0, 0, window.cv.BORDER_DEFAULT);
      }
      if (ut.median) {
        let k = ut.medianK % 2 === 0 ? ut.medianK + 1 : ut.medianK;
        window.cv.medianBlur(dst, dst, k);
      }
      if (ut.unsharp) {
        let blurred = new window.cv.Mat();
        window.cv.GaussianBlur(dst, blurred, new window.cv.Size(0,0), ut.unsharpR);
        window.cv.addWeighted(dst, 1 + ut.unsharpA, blurred, -ut.unsharpA, 0, dst);
        blurred.delete();
      }
      if (ut.morphOp !== 'none') {
        let k = ut.morphK;
        let M = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(k, k));
        let op = ut.morphOp === 'open' ? window.cv.MORPH_OPEN : window.cv.MORPH_CLOSE;
        window.cv.morphologyEx(dst, dst, op, M);
        M.delete();
      }

      // 5. Binarization
      if (ut.binMode === 'global') {
        window.cv.threshold(dst, dst, ut.threshold, 255, window.cv.THRESH_BINARY);
      } else if (ut.binMode === 'adaptive') {
        window.cv.adaptiveThreshold(dst, dst, 255, window.cv.ADAPTIVE_THRESH_MEAN_C, window.cv.THRESH_BINARY, ut.adaptiveBlock, ut.adaptiveC);
      } else if (ut.binMode === 'canny') {
        window.cv.Canny(dst, dst, ut.canny1, ut.canny2);
      }

      // Display
      window.cv.imshow(canvasPreRef.current, dst);
      src.delete();
      dst.delete();
    } catch (e) { console.error("CV Error", e); }
  };

  const runTrace = async () => {
    if (!canvasPreRef.current || !window.ImageTracer) return;
    setLoadingMsg("Tracing...");

    // Allow UI update
    await new Promise(r => setTimeout(r, 50));

    try {
      const ctx = canvasPreRef.current.getContext('2d');
      const imgData = ctx!.getImageData(0, 0, canvasPreRef.current.width, canvasPreRef.current.height);

      const opts = {
        ltres: ut.ltres, qtres: ut.qtres, pathomit: ut.pathomit,
        colorsampling: ut.colorsampling, numberofcolors: ut.numberofcolors,
        mincolorratio: ut.mincolorratio, colorquantcycles: ut.colorquantcycles,
        blurradius: ut.blurradius, blurdelta: ut.blurdelta, strokewidth: ut.strokewidth,
        linefilter: true,
        pal: [{r:0,g:0,b:0,a:255}, {r:255,g:255,b:255,a:255}] // B/W
      };

      let svgStr = window.ImageTracer.imagedataToSVG(imgData, opts);

      // Post-Processing: Union & Smooth (Paper.js)
      if (ut.union || ut.smoothTolerance > 0) {
        if (!window.paper) throw new Error("Paper.js not loaded");

        const canvas = document.createElement('canvas');
        const scope = new window.paper.PaperScope();
        scope.setup(canvas);

        const item = scope.project.importSVG(svgStr, { expandShapes: true });

        // Collect Paths
        const paths: any[] = [];
        const traverse = (node: any) => {
          if (node instanceof scope.Path || node instanceof scope.CompoundPath) {
            // Keep dark paths
            if (node.fillColor && node.fillColor.gray < 0.5) {
              paths.push(node);
            }
          }
          if (node.children) node.children.forEach(traverse);
        };
        traverse(item);

        let resultPath: any = null;

        // UNION
        if (ut.union && paths.length > 0) {
          resultPath = paths[0];
          for (let i = 1; i < paths.length; i++) {
            const temp = resultPath.unite(paths[i]);
            resultPath.remove(); // cleanup old
            paths[i].remove();
            resultPath = temp;
          }
        } else {
          // Just keep them as they are in a group if no union, but we need a root
          // For simplicity here, just re-export if no union requested is tricky with paper
          // So usually we just modify in place
        }

        // SMOOTH
        if (ut.smoothTolerance > 0) {
           if (resultPath) resultPath.simplify(ut.smoothTolerance);
           else paths.forEach(p => p.simplify(ut.smoothTolerance));
        }

        // Export
        scope.project.activeLayer.removeChildren();
        if (resultPath) {
          resultPath.fillColor = 'black';
          scope.project.activeLayer.addChild(resultPath);
        } else {
          paths.forEach(p => scope.project.activeLayer.addChild(p));
        }

        svgStr = scope.project.exportSVG({ asString: true });
      }

      setFinalSvg(svgStr);

    } catch (e: any) {
      alert("Trace error: " + e.message);
    } finally {
      setLoadingMsg(null);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: any) => void) => {
    const f = e.target.files?.[0];
    if (f) {
      fileToBase64(f).then(b64 => setter({ data: b64, mime: f.type }));
    }
  };

  const download = () => {
    if (!finalSvg) return;
    const blob = new Blob([finalSvg], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vector_${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full flex flex-col gap-6 font-sans text-gray-200">

      {/* --- HEADER TABS --- */}
      <div className="flex justify-center mb-4">
        <div className="glass-panel p-1 rounded-xl flex gap-1 bg-black/40">
          {[
            { id: 'sketch', label: 'Sketch Photo', icon: '📷' },
            { id: 'style', label: 'Style Transfer', icon: '🎨' },
            { id: 'prompt', label: 'Prompt Sketch', icon: '⌨️' },
            { id: 'vectorize', label: 'Vector Engine', icon: '⚙️', disabled: !generatedImage }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setView(tab.id as ViewMode)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${view === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'} ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">

        {/* --- LEFT PANEL: CONTROLS --- */}
        <div className="glass-panel p-6 rounded-2xl space-y-6 bg-[#14161a] border-gray-800">

          {/* VIEW: SKETCH */}
          {view === 'sketch' && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-2">Photo to Sketch</h2>

              {!sfpImage ? (
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-600 rounded-xl hover:border-indigo-500 hover:bg-gray-800 cursor-pointer transition-all">
                  <span className="text-gray-400 text-sm">Click to Upload Image</span>
                  <input type="file" className="hidden" accept="image/*" onChange={e => handleUpload(e, setSfpImage)} />
                </label>
              ) : (
                <div className="relative h-40 rounded-xl overflow-hidden border border-gray-700 group">
                  <img src={`data:${sfpImage.mime};base64,${sfpImage.data}`} className="w-full h-full object-cover opacity-60" />
                  <button onClick={() => setSfpImage(null)} className="absolute inset-0 m-auto w-max h-max px-4 py-2 bg-red-600 text-white rounded font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                </div>
              )}

              <div className="space-y-4">
                <label className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-gray-700">
                  <input type="checkbox" checked={isolateSubject} onChange={e => setIsolateSubject(e.target.checked)} className="accent-indigo-500 w-5 h-5" />
                  <span className="text-gray-300 text-sm">Isolate Subject (Remove Background)</span>
                </label>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(STYLE_MAP).map(k => (
                      <button key={k} onClick={() => setActiveStyle(k)} className={`text-xs py-2 px-3 rounded border transition-colors ${activeStyle === k ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {STYLE_MAP[k].name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Creative Freedom</span>
                    <span>{creativity}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={creativity} onChange={e => setCreativity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>Creative</span>
                    <span>Faithful</span>
                  </div>
                </div>

                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Additional instructions..." className="w-full bg-black/30 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" rows={2} />
              </div>
            </div>
          )}

          {/* VIEW: STYLE TRANSFER */}
          {view === 'style' && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-2">Style Transfer</h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase">1. Base Image</p>
                  {!stBase ? (
                    <label className="flex items-center justify-center h-24 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-indigo-500"><input type="file" className="hidden" onChange={e => handleUpload(e, setStBase)} /><span className="text-2xl text-gray-500">+</span></label>
                  ) : (
                    <div className="relative h-24 rounded-lg overflow-hidden border border-gray-700"><img src={`data:${stBase.mime};base64,${stBase.data}`} className="w-full h-full object-cover" /><button onClick={() => setStBase(null)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button></div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase">2. Style Ref</p>
                  {!stStyle ? (
                    <label className="flex items-center justify-center h-24 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-indigo-500"><input type="file" className="hidden" onChange={e => handleUpload(e, setStStyle)} /><span className="text-2xl text-gray-500">+</span></label>
                  ) : (
                    <div className="relative h-24 rounded-lg overflow-hidden border border-gray-700"><img src={`data:${stStyle.mime};base64,${stStyle.data}`} className="w-full h-full object-cover" /><button onClick={() => setStStyle(null)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button></div>
                  )}
                </div>
              </div>

              <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Creative Freedom</span>
                    <span>{creativity}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={creativity} onChange={e => setCreativity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>

              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Refinement instructions..." className="w-full bg-black/30 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" rows={2} />
            </div>
          )}

          {/* VIEW: PROMPT */}
          {view === 'prompt' && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-2">Text to Sketch</h2>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe your sketch (e.g. 'A majestic lion in a geometric style')..." className="w-full bg-black/30 border border-gray-700 rounded-lg p-4 text-white min-h-[120px] focus:border-indigo-500 outline-none" />

              <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(STYLE_MAP).map(k => (
                      <button key={k} onClick={() => setActiveStyle(k)} className={`text-xs py-2 px-3 rounded border transition-colors ${activeStyle === k ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
                        {STYLE_MAP[k].name}
                      </button>
                    ))}
                  </div>
              </div>

              <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Creative Freedom</span><span>{creativity}%</span></div>
                  <input type="range" min="0" max="100" value={creativity} onChange={e => setCreativity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
            </div>
          )}

          {/* VIEW: VECTORIZE (UltraTrace Engine) */}
          {view === 'vectorize' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <h2 className="text-xl font-bold text-white">UltraTrace™ Engine</h2>
                <div className={`px-2 py-0.5 rounded text-[10px] font-mono border ${libsLoaded ? 'border-green-800 bg-green-900/30 text-green-400' : 'border-red-800 text-red-400'}`}>{libsLoaded ? 'CORE READY' : 'LOADING LIBS...'}</div>
              </div>

              {/* 1. Preprocess */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase">1. OpenCV Pre-process</h3>

                <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="text-[10px] text-gray-500 uppercase block">Scale</label>
                     <input type="number" min="1" max="16" value={ut.prescale} onChange={e => setUt({...ut, prescale: Number(e.target.value)})} className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
                   </div>
                   <div>
                     <label className="text-[10px] text-gray-500 uppercase block">Binarize Mode</label>
                     <select value={ut.binMode} onChange={e => setUt({...ut, binMode: e.target.value})} className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm text-white">
                        <option value="off">Off (Gray)</option>
                        <option value="global">Global Threshold</option>
                        <option value="adaptive">Adaptive</option>
                        <option value="canny">Canny Edge</option>
                     </select>
                   </div>
                </div>

                {ut.binMode === 'global' && (
                   <div><label className="text-[10px] text-gray-500 uppercase">Threshold: {ut.threshold}</label><input type="range" min="0" max="255" value={ut.threshold} onChange={e => setUt({...ut, threshold: Number(e.target.value)})} className="w-full h-1 bg-gray-700 accent-indigo-500 rounded appearance-none" /></div>
                )}

                <div className="grid grid-cols-2 gap-2">
                   <button onClick={() => setUt({...ut, blur: !ut.blur})} className={`py-1 px-2 text-xs border rounded ${ut.blur ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200' : 'border-gray-700 text-gray-500'}`}>Blur</button>
                   <button onClick={() => setUt({...ut, unsharp: !ut.unsharp})} className={`py-1 px-2 text-xs border rounded ${ut.unsharp ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200' : 'border-gray-700 text-gray-500'}`}>Unsharp Mask</button>
                   <button onClick={() => setUt({...ut, median: !ut.median})} className={`py-1 px-2 text-xs border rounded ${ut.median ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200' : 'border-gray-700 text-gray-500'}`}>Median</button>
                   <select value={ut.morphOp} onChange={e => setUt({...ut, morphOp: e.target.value})} className="bg-black/30 border border-gray-700 text-xs rounded text-gray-400"><option value="none">Morph: None</option><option value="open">Open</option><option value="close">Close</option></select>
                </div>

                <button onClick={runPreprocess} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold text-white transition-colors">Apply Pre-process</button>
              </div>

              {/* 2. Trace */}
              <div className="space-y-4 border-t border-gray-800 pt-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase">2. Trace & Post-process</h3>

                <div className="grid grid-cols-3 gap-2">
                   <div><label className="text-[10px] text-gray-500 block">Detail</label><input type="number" step="0.1" value={ut.ltres} onChange={e => setUt({...ut, ltres: Number(e.target.value)})} className="w-full bg-black/30 border border-gray-700 rounded px-1 py-1 text-xs text-white" /></div>
                   <div><label className="text-[10px] text-gray-500 block">Smooth</label><input type="number" step="0.1" value={ut.qtres} onChange={e => setUt({...ut, qtres: Number(e.target.value)})} className="w-full bg-black/30 border border-gray-700 rounded px-1 py-1 text-xs text-white" /></div>
                   <div><label className="text-[10px] text-gray-500 block">Colors</label><input type="number" value={ut.numberofcolors} onChange={e => setUt({...ut, numberofcolors: Number(e.target.value)})} className="w-full bg-black/30 border border-gray-700 rounded px-1 py-1 text-xs text-white" /></div>
                </div>

                <div className="flex items-center gap-4">
                   <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={ut.union} onChange={e => setUt({...ut, union: e.target.checked})} className="accent-indigo-500" /> Union Shapes</label>
                   <label className="flex items-center gap-2 text-xs text-gray-300">Simplify: <input type="number" step="0.1" className="w-12 bg-black/30 border border-gray-700 rounded px-1 text-xs" value={ut.smoothTolerance} onChange={e => setUt({...ut, smoothTolerance: Number(e.target.value)})} /></label>
                </div>

                <button onClick={runTrace} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 rounded-lg text-sm font-bold text-white shadow-lg transition-all">Trace Vector</button>
              </div>

            </div>
          )}

          {/* GENERATE BUTTON (Common for Sketch/Style/Prompt) */}
          {view !== 'vectorize' && (
            <button
              onClick={handleGenerate}
              disabled={!!loadingMsg}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loadingMsg ? <span className="animate-pulse">{loadingMsg}</span> : "Generate"}
            </button>
          )}

        </div>

        {/* --- RIGHT PANEL: PREVIEW --- */}
        <div className="space-y-6">
          <div className="glass-panel p-2 rounded-2xl min-h-[500px] flex items-center justify-center bg-[#0b0c0f] relative border border-gray-800 overflow-hidden">

             {/* Transparency Grid */}
             <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'conic-gradient(#808080 0 90deg, transparent 0 180deg, #808080 0 270deg, transparent 0)', backgroundSize: '20px 20px' }} />

             {!generatedImage ? (
               <div className="text-center text-gray-600 z-10">
                 <div className="w-16 h-16 rounded-full bg-white/5 mx-auto flex items-center justify-center mb-4 text-2xl">🎨</div>
                 <p>Output Preview</p>
               </div>
             ) : (
               <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 gap-4">

                 {view === 'vectorize' && (
                   <div className="w-full grid grid-cols-2 gap-4 mb-4 h-64">
                      <div className="relative border border-gray-700 rounded bg-black/50 flex flex-col">
                        <span className="absolute top-2 left-2 bg-black/70 text-[10px] px-2 py-1 rounded text-gray-300">Original / Pre-process</span>
                        <canvas ref={canvasOrigRef} className="hidden" />
                        <canvas ref={canvasPreRef} className="w-full h-full object-contain" />
                      </div>
                      <div className="relative border border-gray-700 rounded bg-white flex items-center justify-center overflow-hidden">
                        <span className="absolute top-2 left-2 bg-black/10 text-[10px] px-2 py-1 rounded text-black font-bold z-20">Vector Result</span>
                        {finalSvg ? (
                          <div className="w-full h-full p-2 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{__html: finalSvg}} />
                        ) : (
                          <span className="text-gray-300 text-xs italic">Waiting to trace...</span>
                        )}
                      </div>
                   </div>
                 )}

                 {view !== 'vectorize' && (
                   <img src={generatedImage} className="max-w-full max-h-[500px] shadow-2xl rounded-lg border border-gray-700" />
                 )}

               </div>
             )}
          </div>

          {finalSvg && (
            <div className="flex gap-4">
              <button onClick={download} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl border border-gray-700 transition-colors">Download SVG</button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
