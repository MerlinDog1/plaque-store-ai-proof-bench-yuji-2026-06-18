import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import PlaquePreview from './components/PlaquePreview';
import { Controls } from './components/Controls';
import { RealisticPreviewModal } from './components/RealisticPreviewModal';
import { BorderStyle, DesignStyle, EtchmasterImageMode, EtchmasterShapeMask, Fixing, INITIAL_STATE, Material, MemorialImageMethod, MemorialImagePlacement, MemorialImageShape, PlaqueState, Shape, TextColor, TypographyEngine } from './types';
import { generatePlaqueDesign, generateRealisticView, GenerationPhase } from './services/geminiService';
import { downloadCorelSvg, downloadPdf, svgToPngBase64 } from './services/exportService';
import { getInscriptionLayout } from './services/inscriptionLayout';
import { estimatePlaquePrice } from './services/pricing';

const VectorSketch = lazy(async () => {
  const module = await import('./components/VectorSketch');
  return { default: module.VectorSketch };
});

const ThreePlaquePreview = lazy(async () => {
  const module = await import('./components/ThreePlaquePreview');
  return { default: module.ThreePlaquePreview };
});

const SUPPORTED_MEMORIAL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

const PROOF_BENCH_INITIAL_STATE: PlaqueState = {
  ...INITIAL_STATE,
  width: 297,
  height: 210,
  material: Material.BrushedBrass,
  textColor: TextColor.Black,
  reverseEtch: false,
  border: false,
  borderStyle: BorderStyle.Single,
  fixing: Fixing.None,
  capSize: 10,
  cornerRadius: 0,
  generatedSvgContent: null,
  aiReasoning: null,
  typographyEngine: TypographyEngine.GeminiAuthored,
};

type StudioBrief = {
  id: string;
  label: string;
  strapline: string;
  promise: string;
  material: Material;
  swatch: string;
  priceMood: string;
  prompt: string;
  guidance: string;
  changes: Partial<PlaqueState>;
  nextStep: number;
};

const STUDIO_BRIEFS: StudioBrief[] = [
  {
    id: 'memorial-portrait',
    label: 'Portrait Memorial',
    strapline: 'warm, solemn, finished',
    promise: 'Preloads a brass memorial layout with portrait space, calm typography, safe margins, and proof-first guidance.',
    material: Material.BrushedBrass,
    swatch: '/materials/brushed-brass-satin.png',
    priceMood: 'popular family choice',
    prompt: 'In loving memory of Margaret Ellis. Beloved wife, mum and grandmother. Her kindness lives on in every story we tell. 1948-2026.',
    guidance: 'Keep the tribute dignified and spacious. Prioritise a clear name line, restrained script accent, and generous space for a portrait on the left.',
    changes: {
      width: 297,
      height: 210,
      shape: Shape.Rect,
      material: Material.BrushedBrass,
      textColor: TextColor.Black,
      designStyle: DesignStyle.MemorialSolemn,
      border: true,
      borderStyle: BorderStyle.Double,
      fixing: Fixing.Caps,
      capSize: 10,
      wood: true,
      woodTone: 'dark',
      woodEdge: 'bevel',
      memorialImageEnabled: true,
      memorialImageMethod: MemorialImageMethod.Engraved,
      memorialImagePlacement: MemorialImagePlacement.PortraitLeft,
      memorialImageShape: MemorialImageShape.Circle,
      memorialImageScale: 1.55,
      safeMargin: 8,
    },
    nextStep: 5,
  },
  {
    id: 'heritage-marker',
    label: 'Heritage Marker',
    strapline: 'civic, historic, permanent',
    promise: 'Sets up a formal heritage plaque with aged brass, border discipline, and a layout suited to public buildings.',
    material: Material.AgedBrass,
    swatch: '/materials/brushed-brass-satin.png',
    priceMood: 'architectural finish',
    prompt: 'The Old Mill House. Built in 1864 and restored for the community in 2026. A landmark of local craft, industry and renewal.',
    guidance: 'Make this feel official and old-world without becoming fussy. Strong title, balanced small caps, heritage ornament only if it earns its place.',
    changes: {
      width: 300,
      height: 200,
      shape: Shape.Rect,
      material: Material.AgedBrass,
      textColor: TextColor.Black,
      designStyle: DesignStyle.HeritagePlaque,
      border: true,
      borderStyle: BorderStyle.Double,
      fixing: Fixing.Screws,
      wood: false,
      memorialImageEnabled: false,
      safeMargin: 9,
    },
    nextStep: 5,
  },
  {
    id: 'bench-tribute',
    label: 'Bench Tribute',
    strapline: 'compact, readable, outdoor',
    promise: 'Preloads the correct compact bench format with no scalloped border and a short tribute that will actually fit.',
    material: Material.BrushedSteel,
    swatch: '/materials/brushed-stainless-satin.png',
    priceMood: 'outdoor durable',
    prompt: 'For Alan. Sit awhile, watch the trees, and remember the laughter.',
    guidance: 'This is a small bench plaque. Be ruthless with wording, keep it legible from arm length, and do not crowd the border.',
    changes: {
      width: 150,
      height: 50,
      shape: Shape.Rect,
      material: Material.BrushedSteel,
      textColor: TextColor.Black,
      designStyle: DesignStyle.ModernMinimal,
      border: true,
      borderStyle: BorderStyle.Single,
      fixing: Fixing.Screws,
      wood: false,
      memorialImageEnabled: false,
      safeMargin: 7,
    },
    nextStep: 5,
  },
  {
    id: 'opening-plaque',
    label: 'Opening Plaque',
    strapline: 'official, crisp, ceremony-ready',
    promise: 'Creates a polished presentation plaque for openings, donor walls, awards, and institutional moments.',
    material: Material.PolishedSteel,
    swatch: '/materials/mirror-stainless.png',
    priceMood: 'presentation grade',
    prompt: 'Officially opened by Dr Amelia Hart on 18 June 2026. Celebrating innovation, service and a place built for the future.',
    guidance: 'Use a confident institutional hierarchy. Date and opener should be clear, with no sentimental styling.',
    changes: {
      width: 300,
      height: 200,
      shape: Shape.Rect,
      material: Material.PolishedSteel,
      textColor: TextColor.Black,
      designStyle: DesignStyle.Institutional,
      border: true,
      borderStyle: BorderStyle.Single,
      fixing: Fixing.Caps,
      capSize: 15,
      wood: true,
      woodTone: 'light',
      woodEdge: 'square',
      memorialImageEnabled: false,
      safeMargin: 8,
    },
    nextStep: 5,
  },
];

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the uploaded image.'));
  reader.readAsDataURL(file);
});

const convertImageDataUrlToPng = (dataUrl: string): Promise<string> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not prepare a canvas for this image.'));
      return;
    }
    ctx.drawImage(img, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  };
  img.onerror = () => reject(new Error('This browser could not decode the AVIF image.'));
  img.src = dataUrl;
});

async function prepareMemorialImageUpload(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  return file.type === 'image/avif' ? convertImageDataUrlToPng(dataUrl) : dataUrl;
}

const App: React.FC = () => {
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [currentView, setCurrentView] = useState<'plaque' | 'vector'>('plaque');
  const [activeStep, setActiveStep] = useState(0);

  const [state, setState] = useState<PlaqueState>(PROOF_BENCH_INITIAL_STATE);
  const [inscriptionPrompt, setInscriptionPrompt] = useState('');
  const [inscriptionGuidance, setInscriptionGuidance] = useState('');
  const [generatedLayoutSignature, setGeneratedLayoutSignature] = useState<string | null>(null);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [realisticPreviewPrompt, setRealisticPreviewPrompt] = useState('');
  const [realisticPreviewAspectRatio, setRealisticPreviewAspectRatio] = useState('16:9');
  const [modalOpen, setModalOpen] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>(null);
  const [isProofExpanded, setIsProofExpanded] = useState(false);
  const [memorialSourceImage, setMemorialSourceImage] = useState<string | null>(null);
  const [isGeneratingMemorial, setIsGeneratingMemorial] = useState(false);
  const [memorialStatus, setMemorialStatus] = useState<string | null>(null);
  const [proofSaved, setProofSaved] = useState(false);
  const [basketAdded, setBasketAdded] = useState(false);
  const [activeBriefId, setActiveBriefId] = useState<string>('memorial-portrait');
  const [guidedBriefMode, setGuidedBriefMode] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);

  // --- Auth & Startup Logic ---
  useEffect(() => {
    const checkAccess = async () => {
      try {
        // Check if running in AI Studio environment
        if ((window as any).aistudio?.hasSelectedApiKey) {
          const hasKey = await (window as any).aistudio.hasSelectedApiKey();
          setHasAccess(hasKey);
        } else {
          // Running locally - Gemini calls are handled by the same-origin server proxy.
          console.log("Running locally with Gemini server proxy");
          setHasAccess(true);
        }
      } catch (e) {
        console.error("Failed to check API key status", e);
        // Fallback: allow access for local development
        setHasAccess(true);
      } finally {
        setIsCheckingAccess(false);
      }
    };
    checkAccess();
  }, []);

  const handleConnectApiKey = async () => {
    try {
      await (window as any).aistudio.openSelectKey();
      setHasAccess(true);
    } catch (e) {
      console.error("API Key selection failed", e);
      alert("Failed to connect API Key. Please try again.");
    }
  };

  const handleApiError = (error: any) => {
    const msg = error?.toString()?.toLowerCase() || "";
    if (msg.includes("permission_denied") || msg.includes("403") || msg.includes("requested entity was not found")) {
      setHasAccess(false); // Reset access to force re-selection
      alert("Session expired or invalid permissions. Please reconnect your API key (Must be a paid project for Image Generation).");
    } else {
      alert("AI Generation failed: " + (error.message || "Unknown error"));
    }
  };

  // --- Core App Logic ---

  const price = React.useMemo(() => {
    return estimatePlaquePrice(state);
  }, [state]);

  const getLayoutSignature = (prompt: string) => JSON.stringify({
    prompt: prompt.trim(),
    guidance: inscriptionGuidance.trim(),
    width: state.width,
    height: state.height,
    shape: state.shape,
    designStyle: state.designStyle,
    memorialImageEnabled: state.memorialImageEnabled,
    memorialImageMethod: state.memorialImageMethod,
    memorialImagePlacement: state.memorialImagePlacement,
    memorialImageShape: state.memorialImageShape,
    memorialImageScale: state.memorialImageScale,
    safeMargin: state.safeMargin,
  });

  const getInscriptionContext = (prompt: string) => {
    const normalizedPrompt = prompt.toLowerCase();
    const purpose = state.memorialImageEnabled
      || state.designStyle === DesignStyle.MemorialSolemn
      || /\b(in (?:loving )?memory|remembered|beloved|forever in our hearts|rest in peace)\b/.test(normalizedPrompt)
        ? 'memorial' as const
        : state.designStyle === DesignStyle.HeritagePlaque
          || /\b(heritage|listed|built|established|founded|anno domini)\b/.test(normalizedPrompt)
            ? 'heritage' as const
            : state.designStyle === DesignStyle.Institutional
              || /\b(dedicated|commemorating|opened by|officially opened)\b/.test(normalizedPrompt)
                ? 'commemorative' as const
                : 'commercial' as const;

    return {
      purpose,
      portraitRelationship: state.memorialImageEnabled
        ? `Image artwork uses the ${state.memorialImagePlacement} production layout. The available inscription box already excludes the artwork area. Compose the text as the image's deliberate visual partner without crowding it.`
        : 'No image artwork is present. The inscription is the primary composition.',
      layoutGuidance: inscriptionGuidance.trim() || undefined,
    };
  };

  const handleStateChange = (changes: Partial<PlaqueState>) => {
    setProofSaved(false);
    setBasketAdded(false);
    setState(prev => {
      const next = { ...prev, ...changes };
      if (next.shape === Shape.Rect) {
        next.cornerRadius = 0;
      }
      if (next.shape === Shape.Heart) {
        next.wood = false;
        next.fixing = Fixing.VHB;
        if (changes.shape === Shape.Heart) {
          next.width = 180;
          next.height = 160;
          next.memorialImageEnabled = false;
        }
      }
      if (changes.etchmasterShapeMask) {
        if (changes.etchmasterShapeMask === EtchmasterShapeMask.Circle) {
          next.memorialImageShape = MemorialImageShape.Circle;
        } else if (changes.etchmasterShapeMask === EtchmasterShapeMask.Heart) {
          next.memorialImageShape = MemorialImageShape.Heart;
        }
      }
      return next;
    });
  };

  const applyStudioBrief = (brief: StudioBrief) => {
    setProofSaved(false);
    setBasketAdded(false);
    setActiveBriefId(brief.id);
    setInscriptionPrompt(brief.prompt);
    setInscriptionGuidance(brief.guidance);
    setGeneratedLayoutSignature(null);
    setMemorialStatus(
      brief.changes.memorialImageEnabled
        ? 'Brief loaded. Upload a portrait or generate artwork when you are ready.'
        : null
    );
    setMemorialSourceImage(null);
    setState(prev => ({
      ...prev,
      ...brief.changes,
      generatedSvgContent: null,
      aiReasoning: 'Studio brief loaded. Generate the inscription layout to turn it into a production proof.',
      conceptImageUrl: null,
      memorialImageSourceUrl: null,
      memorialImageSvg: null,
      memorialImagePreviewUrl: null,
      etchmasterStyleReferenceUrl: null,
    }));
    setActiveStep(brief.nextStep);
    setCurrentView('plaque');
  };

  const handleClearDesign = () => {
    setGeneratedLayoutSignature(null);
    setState(prev => ({
      ...prev,
      generatedSvgContent: null,
      aiReasoning: null,
      conceptImageUrl: null
    }));
  };

  const handleMemorialImageUpload = async (file: File) => {
    if (!SUPPORTED_MEMORIAL_IMAGE_TYPES.includes(file.type)) {
      alert('Please upload a PNG, JPEG, WebP, or AVIF image.');
      return;
    }
    setProofSaved(false);
    setBasketAdded(false);

    try {
      const dataUrl = await prepareMemorialImageUpload(file);
      setMemorialSourceImage(dataUrl);
      setState(prev => ({
        ...prev,
        memorialImageEnabled: true,
        memorialImageSourceUrl: dataUrl,
        memorialImagePreviewUrl: dataUrl,
        memorialImageSvg: null,
        memorialImageScale: prev.memorialImageScale === 1 ? 1.75 : prev.memorialImageScale,
        memorialImageZoom: 1,
        memorialImageOffsetX: 0,
        memorialImageOffsetY: 0,
      }));
      setMemorialStatus(
        state.memorialImageMethod === MemorialImageMethod.UvPrinted
          ? 'Photo ready for full-colour UV print. Choose a layout and the proof will fit the whole image by default.'
          : 'Photo ready. Choose a production layout, then generate the engraving.'
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not prepare that image. Try converting it to PNG first.');
    }
  };

  const handleStyleReferenceUpload = async (file: File) => {
    if (!SUPPORTED_MEMORIAL_IMAGE_TYPES.includes(file.type)) {
      alert('Please upload a PNG, JPEG, WebP, or AVIF style image.');
      return;
    }
    try {
      const dataUrl = await prepareMemorialImageUpload(file);
      handleStateChange({ etchmasterStyleReferenceUrl: dataUrl });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not prepare that style image.');
    }
  };

  const handleGenerateMemorialImage = async () => {
    if (state.etchmasterMode !== EtchmasterImageMode.Prompt && !memorialSourceImage) {
      alert('Upload artwork first.');
      return;
    }
    if (state.etchmasterMode === EtchmasterImageMode.SubjectStyle && !state.etchmasterStyleReferenceUrl) {
      alert('Upload a style reference image first.');
      return;
    }

    setIsGeneratingMemorial(true);
    setMemorialStatus(state.etchmasterEnhancePrompt ? 'Enhancing EtchMaster prompt...' : 'Preparing detailed etchable artwork...');

    try {
      const { enhanceEtchingPrompt, generateMemorialEngraving, vectorizeMemorialImage } = await import('./services/memorialImageService');
      const extraPrompt = state.etchmasterEnhancePrompt && state.etchmasterPrompt.trim()
        ? await enhanceEtchingPrompt(state.etchmasterPrompt)
        : state.etchmasterPrompt;
      const imageDataUrl = await generateMemorialEngraving({
        sourceImageDataUrl: memorialSourceImage,
        styleReferenceDataUrl: state.etchmasterStyleReferenceUrl,
        plaqueWidth: state.width,
        plaqueHeight: state.height,
        plaqueShape: state.shape,
        layout: state.memorialImagePlacement,
        shape: state.memorialImageShape,
        artworkScale: state.memorialImageScale,
        safeMargin: state.safeMargin,
        mode: state.etchmasterMode,
        model: state.etchmasterModel,
        imageSize: state.etchmasterImageSize,
        aspectRatio: state.etchmasterAspectRatio,
        preset: state.etchmasterPreset,
        removeBackground: state.etchmasterRemoveBackground,
        shapeMask: state.etchmasterShapeMask,
        shapeEdge: state.etchmasterShapeEdge,
        extraPrompt,
      });

      setMemorialStatus('Tracing engraving into vector artwork...');
      const svg = await vectorizeMemorialImage(imageDataUrl, state.etchmasterVectorThreshold, setMemorialStatus);

      setState(prev => ({
        ...prev,
        memorialImagePreviewUrl: imageDataUrl,
        memorialImageSvg: svg,
      }));
      setMemorialStatus('Artwork placed on the plaque.');
    } catch (error) {
      handleApiError(error);
      setMemorialStatus('Artwork generation failed.');
    } finally {
      setIsGeneratingMemorial(false);
    }
  };

  const handleClearMemorialImage = () => {
    setProofSaved(false);
    setBasketAdded(false);
    setMemorialSourceImage(null);
    setMemorialStatus(null);
    setState(prev => ({
      ...prev,
      memorialImageSourceUrl: null,
      memorialImageSvg: null,
      memorialImagePreviewUrl: null,
      etchmasterStyleReferenceUrl: null,
      memorialImageEnabled: false,
    }));
  };

  const handleGenerateLayout = async (prompt: string) => {
    setIsGeneratingLayout(true);
    setGenerationPhase(null);
    try {
      const inscriptionBox = getInscriptionLayout(state, prompt);
      const result = await generatePlaqueDesign(
        prompt,
        state.width,
        state.height,
        state.shape,
        state.designStyle,
        null,
        (phase) => setGenerationPhase(phase),
        { width: inscriptionBox.textW, height: inscriptionBox.textH },
        getInscriptionContext(prompt),
        TypographyEngine.GeminiAuthored
      );

      if (result) {
        setGeneratedLayoutSignature(getLayoutSignature(prompt));
        setState(prev => ({
          ...prev,
          generatedSvgContent: result.svgContent,
          conceptImageUrl: result.conceptImageUrl,
          aiReasoning: result.reasoning
        }));
        setActiveStep(5);
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsGeneratingLayout(false);
      setGenerationPhase(null);
    }
  };

  const handlePromptChange = (prompt: string) => {
    setInscriptionPrompt(prompt);
    setProofSaved(false);
    setBasketAdded(false);
  };

  const handleInscriptionGuidanceChange = (guidance: string) => {
    setInscriptionGuidance(guidance);
    setProofSaved(false);
    setBasketAdded(false);
  };

  const handleGeneratedSvgContentChange = (svgContent: string) => {
    setProofSaved(false);
    setBasketAdded(false);
    setState(prev => ({
      ...prev,
      generatedSvgContent: svgContent,
      aiReasoning: 'Manual typography edits applied to the generated layout.',
    }));
  };

  const handleRealPreview = async () => {
    if (!svgRef.current) return;
    setModalOpen(true);
    setGeneratedImage(null);
    setIsGeneratingImage(true);

    try {
      const base64Png = await svgToPngBase64(svgRef.current);
      const result = await generateRealisticView(base64Png, state, {
        prompt: realisticPreviewPrompt,
        aspectRatio: realisticPreviewAspectRatio,
      });
      setGeneratedImage(result);
    } catch (error) {
      handleApiError(error);
      setModalOpen(false);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleProofExpandButton = () => {
    setIsProofExpanded(prev => !prev);
  };

  const readinessWarnings = React.useMemo(() => {
    const warnings: string[] = [];
    if (!state.generatedSvgContent) {
      warnings.push('Generate your inscription layout. The preview is still showing guide text.');
    } else if (generatedLayoutSignature !== getLayoutSignature(inscriptionPrompt)) {
      warnings.push('Update the inscription layout after your latest plaque changes.');
    }
    if (state.memorialImageEnabled && state.memorialImageMethod === MemorialImageMethod.Engraved && !state.memorialImageSvg) {
      warnings.push('Generate the engraved artwork.');
    }
    if (state.memorialImageEnabled && state.memorialImageMethod === MemorialImageMethod.UvPrinted && !state.memorialImageSourceUrl && !state.memorialImagePreviewUrl) {
      warnings.push('Upload the full-colour artwork.');
    }
    return warnings;
  }, [generatedLayoutSignature, inscriptionGuidance, inscriptionPrompt, state.designStyle, state.generatedSvgContent, state.height, state.memorialImageEnabled, state.memorialImageMethod, state.memorialImagePlacement, state.memorialImagePreviewUrl, state.memorialImageScale, state.memorialImageShape, state.memorialImageSourceUrl, state.memorialImageSvg, state.shape, state.typographyEngine, state.width]);

  const isProductionReady = readinessWarnings.length === 0;
  const readinessItems = [
    {
      label: state.generatedSvgContent
        ? generatedLayoutSignature === getLayoutSignature(inscriptionPrompt)
          ? 'Inscription layout is up to date'
          : 'Update the inscription layout after your latest changes'
        : 'Generate your inscription layout',
      ready: !!state.generatedSvgContent && generatedLayoutSignature === getLayoutSignature(inscriptionPrompt),
      step: 5,
    },
    {
      label: !state.memorialImageEnabled
        ? 'Text-only plaque selected'
        : state.memorialImageMethod === MemorialImageMethod.UvPrinted
          ? state.memorialImageSourceUrl || state.memorialImagePreviewUrl
            ? 'Full-colour artwork is ready'
            : 'Upload the full-colour artwork'
          : state.memorialImageSvg
            ? 'Engraved artwork is ready'
            : 'Generate the engraved artwork',
      ready: !state.memorialImageEnabled
        || (state.memorialImageMethod === MemorialImageMethod.UvPrinted
          ? !!(state.memorialImageSourceUrl || state.memorialImagePreviewUrl)
          : !!state.memorialImageSvg),
      step: 6,
    },
  ];

  const confirmReadiness = (action: string) => {
    if (isProductionReady) return true;
    return window.confirm(
      `Create a draft ${action}?\n\n${readinessWarnings.map(warning => `- ${warning}`).join('\n')}\n\nThis is fine for review, but finish the proof before using it for production.`
    );
  };

  const handleExportSvg = async () => {
    if (!svgRef.current) return;
    if (!confirmReadiness('Corel SVG export')) return;
    await downloadCorelSvg(svgRef.current, state);
  };

  const handleExportPdf = async () => {
    if (!svgRef.current) return;
    if (!confirmReadiness('PDF export')) return;
    await downloadPdf(svgRef.current, state);
  };

  const handleNativePrint = () => {
    if (!confirmReadiness('Print')) return;
    window.print();
  };

  const handleSaveProof = () => {
    const savedProof = {
      savedAt: new Date().toISOString(),
      inscriptionPrompt,
      state: {
        ...state,
        conceptImageUrl: null,
        memorialImageSourceUrl: null,
        memorialImagePreviewUrl: null,
      },
      hasPortraitSource: !!(state.memorialImageSourceUrl || state.memorialImagePreviewUrl),
    };
    try {
      localStorage.setItem('plaques-ai-saved-proof', JSON.stringify(savedProof));
      setProofSaved(true);
    } catch {
      alert('This browser could not save the proof locally. Your current design is still open.');
    }
  };

  const handleAddToBasket = () => {
    if (!isProductionReady) {
      goToProof();
      return;
    }
    setBasketAdded(true);
  };

  // --- Render ---
  const steps = ['Material', 'Size/Shape', 'Colour', 'Fixings and border', 'Wood', 'Text', 'Proof'];
  const stepShortLabels = ['Material', 'Size', 'Colour', 'Fixings', 'Wood', 'Text', 'Proof'];
  const progress = ((activeStep + 1) / steps.length) * 100;
  const canGoBack = activeStep > 0;
  const canGoNext = activeStep < steps.length - 1;

  const goBack = () => setActiveStep(step => Math.max(0, step - 1));
  const goNext = () => setActiveStep(step => Math.min(steps.length - 1, step + 1));
  const goToProof = () => {
    setCurrentView('plaque');
    setActiveStep(steps.length - 1);
  };

  if (isCheckingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f1e7]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#b98235] border-t-transparent"></div>
          <p className="text-sm font-bold text-[#6a746d]">Initializing Plaques AI...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f7f1e7] p-4">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#b98235]/10 blur-[120px]" />

        <div className="glass-panel relative z-10 w-full max-w-md rounded-lg p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-[#f2d688] to-[#8d542a] text-3xl font-black text-[#1b231f] shadow-lg shadow-[#b98235]/20">
            P
          </div>

          <h1 className="mb-2 text-3xl font-black tracking-tight text-[#1b231f]">plaques<span className="text-[#9a6a16]">.ai</span></h1>
          <p className="mb-8 text-sm leading-relaxed text-[#6a746d]">
            Welcome to the Pro Designer. To access high-fidelity realistic previews and AI layout generation, please connect your Google Cloud Project.
          </p>

          <div className="space-y-4">
            <button
              onClick={handleConnectApiKey}
              className="studio-press flex w-full items-center justify-center gap-2 rounded-lg bg-[#f2d688] py-3.5 font-black text-[#1b231f] shadow-xl"
            >
              <svg className="h-5 w-5 text-[#7c441e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Connect API Key
            </button>

            <p className="text-[10px] text-[#8a8275]">
              Requires a paid project for Veo/Image generation models. <br />
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-[#9a6a16] hover:underline">
                View billing documentation
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stepIcons = ['▦', '◉', '●', '⌁', '▥', 'T', '✓'];
  const formattedPrice = price.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });
  const activeBrief = STUDIO_BRIEFS.find(brief => brief.id === activeBriefId) || STUDIO_BRIEFS[0];

  return (
    <div className="studio-app-shell proofbench-app flex flex-col bg-transparent text-[#eef4ee]">
      <Header
        onNavigate={setCurrentView}
        currentView={currentView}
        priceLabel={formattedPrice}
      />

      <main className="min-h-0 w-full flex-1 overflow-hidden">

        {currentView === 'vector' ? (
          <div className="h-full overflow-hidden p-3 md:p-4">
            <Suspense fallback={<div className="studio-panel rounded-lg p-6 font-bold text-[#4c554f]">Loading artwork studio...</div>}>
              <VectorSketch />
            </Suspense>
          </div>
        ) : (
          <div className="app-fade-in proofbench-board grid h-full min-h-0 w-full grid-rows-[minmax(0,46%)_minmax(0,54%)] gap-0 p-0 md:grid-cols-[82px_358px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-0 md:px-8 md:pb-7 md:pt-4 xl:grid-cols-[88px_390px_minmax(0,1fr)]">
            <nav className="proofbench-rail no-print hidden min-h-0 flex-col items-center justify-center py-4 md:flex">
              <div className="flex w-full flex-col items-center gap-3">
                {steps.map((label, index) => (
                  <button
                    key={label}
                    onClick={() => setActiveStep(index)}
                    aria-label={`Go to ${label}`}
                    aria-current={index === activeStep ? 'step' : undefined}
                    className={`proofbench-step-button ${index === activeStep ? 'is-active' : ''} ${index < activeStep ? 'is-complete' : ''}`}
                    data-icon={stepIcons[index]}
                    data-short={stepShortLabels[index]}
                  >
                    {index + 1} {label}
                  </button>
                ))}
              </div>
            </nav>

            <aside className="proofbench-customiser no-print row-start-2 min-h-0 min-w-0 overflow-hidden md:col-start-2 md:row-start-1">
              <div className="proofbench-customiser-head hidden md:flex">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d7b66a]">Selected Controls</p>
                  <h2 className="mt-1 text-base font-black text-[#f7f1e3]">{steps[activeStep]}</h2>
                </div>
                <button className="proofbench-kebab" aria-label="More options" type="button">⋮</button>
              </div>
              <div className="proofbench-mobile-tabs md:hidden">
                {steps.map((label, index) => (
                  <button
                    key={label}
                    onClick={() => setActiveStep(index)}
                    className={index === activeStep ? 'is-active' : ''}
                    aria-label={`Go to ${label}`}
                  >
                    <span>{stepIcons[index]}</span>
                    <small>{stepShortLabels[index]}</small>
                  </button>
                ))}
              </div>
              <div className="proofbench-sheet-handle md:hidden" />
              <div className="proofbench-control-scroll">
                <Controls
                  state={state}
                  onChange={handleStateChange}
                  onGenerate={handleGenerateLayout}
                  onClear={handleClearDesign}
                  prompt={inscriptionPrompt}
                  onPromptChange={handlePromptChange}
                  guidance={inscriptionGuidance}
                  onGuidanceChange={handleInscriptionGuidanceChange}
                  onGeneratedSvgContentChange={handleGeneratedSvgContentChange}
                  isGenerating={isGeneratingLayout}
                  generationPhase={generationPhase}
                  onMemorialImageUpload={handleMemorialImageUpload}
                  onStyleReferenceUpload={handleStyleReferenceUpload}
                  onGenerateMemorialImage={handleGenerateMemorialImage}
                  onClearMemorialImage={handleClearMemorialImage}
                  isGeneratingMemorialImage={isGeneratingMemorial}
                  memorialStatus={memorialStatus}
                  activeStep={activeStep}
                  price={price}
                  readinessItems={readinessItems}
                  isProductionReady={isProductionReady}
                  basketAdded={basketAdded}
                  onGoToStep={setActiveStep}
                  onSaveProof={handleSaveProof}
                  onAddToBasket={handleAddToBasket}
                  onRealisticPreview={handleRealPreview}
                  realisticPreviewPrompt={realisticPreviewPrompt}
                  onRealisticPreviewPromptChange={setRealisticPreviewPrompt}
                  realisticPreviewAspectRatio={realisticPreviewAspectRatio}
                  onRealisticPreviewAspectRatioChange={setRealisticPreviewAspectRatio}
                  onExportSvg={handleExportSvg}
                  onExportPdf={handleExportPdf}
                  onPrint={handleNativePrint}
                />
              </div>
            </aside>

            <section className={`proofbench-stage relative row-start-1 min-h-0 min-w-0 overflow-hidden md:col-start-3 md:row-start-1 ${isProofExpanded ? 'is-expanded' : ''}`}>
              <div className="proofbench-director-board no-print hidden md:flex">
                <div className="proofbench-director-summary">
                  <span className="proofbench-director-photo" aria-hidden="true" />
                  <div>
                    <p>Creative Director</p>
                    <strong>{activeBrief.label}</strong>
                    <span>{activeBrief.promise}</span>
                  </div>
                  <div className="proofbench-director-actions">
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => handleGenerateLayout(inscriptionPrompt.trim() || activeBrief.prompt)}
                      disabled={isGeneratingLayout}
                    >
                      {isGeneratingLayout ? 'Generating' : 'Generate'}
                    </button>
                    <button
                      type="button"
                      className={guidedBriefMode ? 'is-active' : ''}
                      onClick={() => setGuidedBriefMode(value => !value)}
                      aria-pressed={guidedBriefMode}
                    >
                      {guidedBriefMode ? 'Guided' : 'Free'}
                    </button>
                  </div>
                </div>
                <div className="proofbench-brief-deck">
                  {STUDIO_BRIEFS.map((brief) => (
                    <button
                      type="button"
                      key={brief.id}
                      onClick={() => applyStudioBrief(brief)}
                      className={brief.id === activeBriefId ? 'is-active' : ''}
                      aria-pressed={brief.id === activeBriefId}
                    >
                      <span className="proofbench-brief-swatch" style={{ backgroundImage: `url(${brief.swatch})` }} />
                      <span className="proofbench-brief-copy">
                        <strong>{brief.label}</strong>
                        <small>{brief.strapline}</small>
                      </span>
                      <em>{brief.priceMood}</em>
                    </button>
                  ))}
                </div>
              </div>

              <div className="proofbench-mobile-top no-print md:hidden">
                <div className="proofbench-rail-logo">P</div>
                <div className="min-w-0 text-center">
                  <p className="text-[11px] font-black text-[#f6ead2]">Proof Bench</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#a9b7ad]">{steps[activeStep]}</p>
                </div>
                <div className="proofbench-mobile-price" aria-label={`Current price ${formattedPrice} including UK delivery`}>
                  <span>Inc UK delivery</span>
                  <strong>{formattedPrice}</strong>
                </div>
              </div>

              <div className="proofbench-dimension-top hidden md:block">{state.width} mm</div>
              <div className="proofbench-dimension-left hidden md:block">{state.height} mm</div>
              <div className="proofbench-proof-pad">
                <div className="proofbench-svg-preview">
                  <PlaquePreview ref={svgRef} state={state} activeStep={activeStep} inscription={inscriptionPrompt} />
                </div>
                {isProofExpanded && (
                  <Suspense
                    fallback={(
                      <div className="three-plaque-preview" aria-label="Loading 3D plaque preview">
                        <div className="three-plaque-preview__label no-print">
                          <strong>3D</strong>
                          <span>loading</span>
                        </div>
                      </div>
                    )}
                  >
                    <ThreePlaquePreview
                      state={state}
                      activeStep={activeStep}
                      inscription={inscriptionPrompt}
                      sourceSvgRef={svgRef}
                    />
                  </Suspense>
                )}
              </div>
              <button
                type="button"
                onClick={handleProofExpandButton}
                className="proofbench-expand-button no-print"
                aria-label={isProofExpanded ? 'Close expanded 3D proof' : 'Expand proof into 3D preview'}
                aria-pressed={isProofExpanded}
              >
                {isProofExpanded ? '×' : '⛶'}
              </button>
            </section>

          </div>
        )}
      </main>

      <div className="no-print">
        <RealisticPreviewModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          isLoading={isGeneratingImage}
          imageUrl={generatedImage}
        />
      </div>
    </div>
  );
};

export default App;
