import React, { useEffect, useRef } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  isLoading: boolean;
}

export const RealisticPreviewModal: React.FC<Props> = ({ isOpen, onClose, imageUrl, isLoading }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="realistic-preview-title">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#fffaf0] border border-[rgba(84, 72, 52, 0.16)] rounded-lg w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[rgba(84, 72, 52, 0.12)] flex justify-between items-center bg-[#fffaf0]">
          <div className="flex items-center gap-2">
            <h3 id="realistic-preview-title" className="text-[#1b231f] font-bold text-lg">Realistic preview</h3>
            <span className="text-[10px] bg-[#14251f] text-[#1f755f] px-2 py-0.5 rounded border border-[#2f7f69]/35">Visual mockup</span>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Close realistic preview" className="text-[#6a746d] hover:text-[#1b231f] transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-8 flex-1 flex items-center justify-center bg-[#080806] min-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[#6a746d] animate-pulse">Creating your realistic plaque preview...</p>
            </div>
          ) : imageUrl ? (
            <img src={`data:image/png;base64,${imageUrl}`} alt="Realistic Plaque" className="max-w-full max-h-full rounded-lg shadow-lg object-contain" />
          ) : (
            <p className="text-red-400">Failed to generate image. Please try again.</p>
          )}
        </div>

        <div className="p-4 bg-[#fffaf0] border-t border-[rgba(84, 72, 52, 0.12)] text-center">
          {imageUrl && !isLoading && (
            <a
              href={`data:image/png;base64,${imageUrl}`}
              download="plaque-context-4k.png"
              className="mb-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#b98235] px-5 text-sm font-black text-[#1b231f] transition-colors hover:bg-[#c49c4e]"
            >
              Download 4K PNG
            </a>
          )}
          <p className="text-xs text-[#7a8278]">
            AI generated visualization. Actual product finish may vary slightly due to lighting conditions.
          </p>
        </div>
      </div>
    </div>
  );
};
