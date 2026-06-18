import React from 'react';

interface Props {
  onNavigate: (view: 'plaque' | 'vector') => void;
  priceLabel: string;
}

export const Header: React.FC<Props> = ({ onNavigate, priceLabel }) => {
  return (
    <header className="proofbench-titlebar print:hidden">
      <div className="mx-auto flex h-full max-w-[1540px] items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="proofbench-mark-wrap flex min-w-0 cursor-pointer items-center gap-3" onClick={() => onNavigate('plaque')}>
            <div className="proofbench-mark">
              P
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-black uppercase tracking-[0.28em] text-[#f5d27b]">
                Proof Bench
              </span>
              <span className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-[#9baaa2] sm:block">Real-time plaque proofing</span>
            </div>
          </div>
        </div>

        <div className="proofbench-price-chip" aria-label={`Current price ${priceLabel} including UK delivery`}>
          <span>Price inc UK delivery</span>
          <strong>{priceLabel}</strong>
        </div>
      </div>
    </header>
  );
};
