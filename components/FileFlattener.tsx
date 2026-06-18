import React, { useState, useRef } from 'react';

const Icons = {
  Upload: () => (
    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Printer: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
  FileWarning: () => (
    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Ruler: () => (
    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20" />
      <path d="M6 12v-2" />
      <path d="M10 12v-3" />
      <path d="M14 12v-2" />
      <path d="M18 12v-3" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
};

const FileFlattener = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Dimensions in Millimeters
  const [widthMm, setWidthMm] = useState(300);
  const [heightMm, setHeightMm] = useState(200);
  const [detectedSize, setDetectedSize] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setFileType(selectedFile.type);

    // Create a local URL for the file
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    // If it's an SVG, try to read the dimensions
    if (selectedFile.type === "image/svg+xml") {
      parseSvgDimensions(selectedFile);
    } else {
      setDetectedSize(false);
    }
  };

  // Helper to read SVG file text and find width/height
  const parseSvgDimensions = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svg = doc.querySelector("svg");

      if (svg) {
        let w = svg.getAttribute("width");
        let h = svg.getAttribute("height");

        const toMm = (val: string | null) => {
          if (!val) return null;
          val = val.toLowerCase();
          if (val.includes("mm")) return parseFloat(val);
          if (val.includes("cm")) return parseFloat(val) * 10;
          if (val.includes("in")) return parseFloat(val) * 25.4;
          if (val.includes("px") || !isNaN(Number(val))) return parseFloat(val) * 0.264583;
          return parseFloat(val);
        };

        const numW = toMm(w);
        const numH = toMm(h);

        if (numW && numH) {
          setWidthMm(numW);
          setHeightMm(numH);
          setDetectedSize(true);
        } else {
          // Fallback: try viewBox
          const viewBox = svg.getAttribute("viewBox");
          if (viewBox) {
            const parts = viewBox.split(" ");
            if (parts.length === 4) {
              setWidthMm(parseFloat(parts[2]) * 0.264583);
              setHeightMm(parseFloat(parts[3]) * 0.264583);
              setDetectedSize(true);
            }
          }
        }
      }
    };
    reader.readAsText(file);
  };

  const handlePrint = () => {
    if (!file) return;

    // Set title for the saved file name
    document.title = file.name.replace(/\.[^/.]+$/, "") + "_flattened";

    // Small timeout ensures the UI updates and browser is ready for the print command
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const openInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const isPdf = fileType === 'application/pdf';

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-800">

      {/* ---------------- CONTROL PANEL (Hidden on Print) ---------------- */}
      <div className="bg-white border-b border-gray-300 p-6 print:hidden shadow-sm z-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">

          {/* Upload Section */}
          <div className="flex-1">
            <h1 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Icons.Upload />
              SVG/PDF Flattener
            </h1>
            <input
              type="file"
              accept=".svg,.pdf,.png,.jpg,.jpeg,.webp,.avif"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-2">
              Best for: Fixing glitchy SVGs for CorelDRAW by baking them into a clean PDF.
            </p>
          </div>

          {/* Dimension Controls */}
          <div className="flex-1 bg-gray-50 p-4 rounded-lg border border-gray-200">
             <div className="flex items-center gap-2 mb-3">
                <Icons.Ruler />
                <span className="font-semibold text-sm">Output Page Size (mm)</span>
                {detectedSize && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Icons.CheckCircle /> Auto-detected</span>}
             </div>

             <div className="flex items-center gap-4">
               <div>
                 <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Width</label>
                 <input
                    type="number"
                    value={widthMm}
                    onChange={(e) => setWidthMm(parseFloat(e.target.value))}
                    className="w-24 p-2 border rounded font-mono text-center focus:ring-2 focus:ring-blue-500 outline-none"
                 />
               </div>
               <span className="text-gray-400 mt-5">x</span>
               <div>
                 <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Height</label>
                 <input
                    type="number"
                    value={heightMm}
                    onChange={(e) => setHeightMm(parseFloat(e.target.value))}
                    className="w-24 p-2 border rounded font-mono text-center focus:ring-2 focus:ring-blue-500 outline-none"
                 />
               </div>
             </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col gap-2">
            {/* Primary Action Button */}
            {isPdf ? (
              <button
                onClick={openInNewTab}
                disabled={!file}
                className="px-6 py-3 rounded-lg font-bold shadow-sm flex items-center gap-2 transition-all bg-green-600 text-white hover:bg-green-700 hover:shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
                title="Opens raw file in new tab. Use Browser Print (Ctrl+P) there for best results."
              >
                <Icons.ExternalLink />
                Open & Flatten (New Tab)
              </button>
            ) : (
              <button
                onClick={handlePrint}
                disabled={!file}
                className="px-6 py-3 rounded-lg font-bold shadow-sm flex items-center gap-2 transition-all bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Icons.Printer />
                Print / Save PDF
              </button>
            )}

            {/* Secondary/Fallback Links */}
            {file && (
              <div className="text-center">
                 {isPdf && <p className="text-[10px] text-gray-500 max-w-[200px] leading-tight mb-1">PDFs flatten best when printed from their own tab.</p>}
                 <button onClick={handlePrint} className="text-xs text-blue-500 underline">
                   {isPdf ? "Force Print Here" : "Trouble printing? Try Open in New Tab"}
                 </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ---------------- PREVIEW AREA (The "Paper") ---------------- */}
      <div className="flex-1 overflow-auto p-8 flex items-start justify-center bg-gray-200 print:p-0 print:bg-white print:block">

        {!previewUrl ? (
          <div className="text-center text-gray-400 mt-20">
            <Icons.FileWarning />
            <p>No file loaded yet.</p>
          </div>
        ) : (
          <div
            id="print-container"
            className="bg-white shadow-2xl mx-auto relative overflow-hidden print:shadow-none print:m-0"
            style={{
              width: `${widthMm}mm`,
              height: `${heightMm}mm`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* CONTENT RENDERER */}
            {fileType === 'application/pdf' ? (
              <embed
                src={previewUrl}
                type="application/pdf"
                className="w-full h-full"
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <img
                src={previewUrl}
                alt="Upload Preview"
                className="w-full h-full object-contain"
              />
            )}
          </div>
        )}
      </div>

      {/* ---------------- DYNAMIC PRINT STYLES ---------------- */}
      <style>{`
        @media print {
          @page {
            /* Sets the PDF page size to match the document exactly */
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            height: 100%;
            width: 100%;
          }
          /* Hide everything except the root app and print container */
          body > *:not(#root) { display: none; }

          /* Hide UI elements inside the app */
          .print\\:hidden { display: none !important; }

          /* Force the preview area to align top-left */
          #print-container {
            width: ${widthMm}mm !important;
            height: ${heightMm}mm !important;
            position: absolute;
            top: 0;
            left: 0;
            box-shadow: none !important;
            margin: 0 !important;
            overflow: visible !important;
          }

          /* Ensures SVGs render at high quality */
          img {
            max-width: 100% !important;
            max-height: 100% !important;
          }
        }
      `}</style>

    </div>
  );
};

export default FileFlattener;
