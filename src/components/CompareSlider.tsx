import React, { useRef, useState, useEffect } from 'react';

interface CompareSliderProps {
  originalUrl: string; // The baseline image (can be the pure original, or a previous history step data URL)
  processedUrl: string; // The current actively edited state
  baselineLabel?: string;
  processedLabel?: string;
  aspectRatio?: number;
}

export const CompareSlider: React.FC<CompareSliderProps> = ({
  originalUrl,
  processedUrl,
  baselineLabel = "Asli",
  processedLabel = "Hasil",
  aspectRatio
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState<number>(50); // percentage (0 to 100)
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pos);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    if (e.touches && e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      id="compare-slider-container"
      className="relative w-full h-[450px] md:h-[550px] lg:h-[600px] overflow-hidden select-none rounded-xl border border-slate-800 bg-slate-950 shadow-2xl cursor-ew-resize"
      onMouseDown={(e) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onMouseMove={handleMouseMove}
      onTouchStart={(e) => {
        setIsDragging(true);
        if (e.touches && e.touches[0]) {
          handleMove(e.touches[0].clientX);
        }
      }}
      onTouchMove={handleTouchMove}
    >
      {/* Original Image (Left Side background) */}
      <img
        src={originalUrl}
        alt="Original"
        className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
        id="compare-slider-original-img"
      />
      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-xs px-2.5 py-1 rounded-md text-slate-300 font-semibold border border-slate-700 pointer-events-none transition-opacity duration-200">
        {baselineLabel}
      </div>

      {/* Processed Image (Right Side and clip-path overlay) */}
      <div
        className="absolute top-0 left-0 h-full w-full pointer-events-none"
        id="compare-slider-overlay-wrapper"
        style={{
          clipPath: `polygon(${sliderPos}% 0%, 100% 0%, 100% 100%, ${sliderPos}% 100%)`
        }}
      >
        <img
          src={processedUrl}
          alt="Hasil"
          className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
          id="compare-slider-processed-img"
        />
        <div className="absolute top-3 right-3 bg-blue-500/90 text-white text-xs px-2.5 py-1 rounded-md font-semibold pointer-events-none shadow-lg">
          {processedLabel}
        </div>
      </div>

      {/* Slider Divider Bar */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        id="compare-slider-divider"
        style={{ left: `${sliderPos}%` }}
      >
        <div className="absolute w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center shadow-lg transform -translate-x-1/2">
          <svg className="w-4 h-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
};
