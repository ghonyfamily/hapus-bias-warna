import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  Image as ImageIcon,
  Sliders,
  Contrast,
  Sun,
  RefreshCw,
  Download,
  Sparkles,
  Trash2,
  GitCompare,
  MousePointer,
  Check,
  Bookmark,
  FileDown,
  Info,
  Layers,
  ChevronRight,
  ChevronDown,
  Eye,
  RotateCcw,
  Maximize2
} from 'lucide-react';

import { RGB, CorrectionParams, Preset, ComparisonItem } from './types';
import {
  applyCorrections,
  generateCubeLUT_fromWB,
  wbGainsFromNeutralRGB,
  clamp,
  computeLuminanceHistogram
} from './colorCastAlgorithms';
import { createDemoImage } from './demoImages';
import { CompareSlider } from './components/CompareSlider';

// Helper component for Levels Histogram visualization
const LevelsHistogramView = ({ 
  histogram, 
  params, 
  setParams 
}: { 
  histogram: number[], 
  params: CorrectionParams, 
  setParams: React.Dispatch<React.SetStateAction<CorrectionParams>> 
}) => {
  if (!histogram || histogram.length === 0) return null;
  
  const maxVal = Math.max(...histogram) || 1;
  
  // Calculate SVG points normalized to 100x100 space
  const points = histogram.map((count, val) => {
    const x = (val / 255) * 100;
    const y = 100 - (count / maxVal) * 92; // 8% offset at top
    return `${x},${y}`;
  });
  
  const pointsStr = points.join(' ');
  const fillPointsStr = `0,100 ${pointsStr} 100,100`;
  
  // Mathematical representation of shadows, highlights and midtones gamma
  const shRange = params.highlights - params.shadows;
  const shadowPercent = (params.shadows / 255) * 100;
  const highlightPercent = (params.highlights / 255) * 100;
  
  // exact gamma midpoint projection level: shadows + range * Math.pow(0.5, midtones)
  const midValue = params.shadows + shRange * Math.pow(0.5, params.midtones);
  const midPercent = (Math.max(0, Math.min(255, midValue)) / 255) * 100;
  
  return (
    <div className="relative bg-slate-950 border border-slate-800/80 rounded-xl p-2.5 overflow-hidden h-28 flex flex-col justify-end select-none" id="levels-histogram-container">
      {/* Dynamic Overlay grids */}
      <div className="absolute inset-x-0 bottom-0 h-full flex justify-between px-1 opacity-5 pointer-events-none">
        <div className="border-r border-slate-400 h-full" />
        <div className="border-r border-slate-400 h-full" />
        <div className="border-r border-slate-400 h-full" />
        <div className="border-r border-slate-400 h-full" />
        <div className="border-r border-slate-400 h-full" />
      </div>

      {/* SVG Canvas */}
      <svg className="w-full h-20 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Fill Area representing pixels */}
        <polygon points={fillPointsStr} fill="url(#histGradient)" className="opacity-40" />
        {/* Stroke Line on top */}
        <polyline points={pointsStr} fill="none" stroke="#60a5fa" strokeWidth="1" className="opacity-70" />
        
        {/* Gradient Definition */}
        <defs>
          <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Vertical lines representing active sliders */}
        {/* Shadows indicator */}
        <line x1={shadowPercent} y1="0" x2={shadowPercent} y2="100" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="2,2" />
        {/* Highlights indicator */}
        <line x1={highlightPercent} y1="0" x2={highlightPercent} y2="100" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="2,2" />
        {/* Midtones (Gamma) indicator */}
        <line x1={midPercent} y1="0" x2={midPercent} y2="100" stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="2,1" />
      </svg>
      
      {/* Tiny indicators */}
      <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-1 pointer-events-none z-15 px-0.5" id="levels-labels-bar">
        <span className="text-slate-400 font-medium font-mono">B:{params.shadows}</span>
        <span className="text-blue-400 font-medium font-mono">G:{params.midtones.toFixed(2)}</span>
        <span className="text-amber-400 font-medium font-mono">H:{params.highlights}</span>
      </div>
    </div>
  );
};

export default function App() {
  // --- States ---
  const [imgSrc, setImgSrc] = useState<string>('');
  const [imgName, setImgName] = useState<string>('sample_underwater');
  const [imgExt, setImgExt] = useState<string>('jpg');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Correction Parameters
  const [params, setParams] = useState<CorrectionParams>({
    method: 'none',
    neutralColor: null,
    strength: 1.0,
    shadows: 0,
    midtones: 1.0,
    highlights: 255,
    brightness: 0,
    contrast: 0,
  });

  // UI state variables
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);
  const [isHoveringCanvas, setIsHoveringCanvas] = useState<boolean>(false);
  const [hoverData, setHoverData] = useState<{
    x: number;
    y: number;
    imageX: number;
    imageY: number;
    color: RGB;
  } | null>(null);

  // Split control refining tabs ('bc' | 'levels')
  const [refinementTab, setRefinementTab] = useState<'bc' | 'levels'>('bc');
  
  // Real-time luminance histogram state
  const [luminanceHistogram, setLuminanceHistogram] = useState<number[]>([]);

  // Crisp High Quality compare previews caching map (in-memory to bypass localStorage limits)
  const [hdPreviews, setHdPreviews] = useState<Record<string, string>>({});

  // Drag and drop border indicator
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Active comparison and presets
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonItem[]>([]);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [showCompareSlider, setShowCompareSlider] = useState<boolean>(false);

  // Export resolution and cascade stage (accordion active index) selection
  const [exportResolution, setExportResolution] = useState<'hd' | 'fhd' | '2k' | '4k' | 'original'>('original');
  const [activeStage, setActiveStage] = useState<number>(1);

  // --- Refs ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load localStorage Preset on Mount
  useEffect(() => {
    try {
      const storedFull = localStorage.getItem('rcc_preset_full_v1');
      if (storedFull) {
        const parsed = JSON.parse(storedFull);
        setActivePreset({
          id: 'stored-preset',
          name: parsed.neutralColor && parsed.method === 'eyedropper' ? 'Saved White Balance Preset' : 'Preset Penyempurnaan Gambar',
          neutralColor: parsed.neutralColor || { r: 128, g: 128, b: 128 },
          method: parsed.method,
          strength: parsed.strength,
          shadows: parsed.shadows,
          midtones: parsed.midtones,
          highlights: parsed.highlights,
          brightness: parsed.brightness,
          contrast: parsed.contrast,
          createdAt: new Date().toLocaleDateString('id-ID'),
        } as any);
      } else {
        const stored = localStorage.getItem('rcc_preset_rgb_v1');
        if (stored) {
          const parsed = JSON.parse(stored);
          setActivePreset({
            id: 'stored-preset',
            name: 'Saved White Balance Preset',
            neutralColor: parsed,
            createdAt: new Date().toLocaleDateString('id-ID'),
          });
        }
      }
    } catch (e) {
      console.error('Failed to read preset from storage', e);
    }

    try {
      const storedComparisons = localStorage.getItem('rcc_comparisons_history');
      if (storedComparisons) {
        setComparisons(JSON.parse(storedComparisons));
      }
    } catch (e) {
      console.error('Failed to read comparisons history', e);
    }

    // App loads initially with no image loaded, active panel 1 open by default
  }, []);

  // Save comparison queue to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem('rcc_comparisons_history', JSON.stringify(comparisons));
    } catch (e) {
      console.error('Failed to write comparisons', e);
    }
  }, [comparisons]);

  // Load File Utility
  const loadFile = (file: File) => {
    const parts = file.name.split('.');
    const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || 'jpg' : 'jpg';
    const baseName = parts.join('.').replace(/\s+/g, '_');

    setImgName(baseName);
    setImgExt(ext);
    
    // Create local object URL
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    
    // Clear state
    setParams({
      method: 'none',
      neutralColor: null,
      strength: 1.0,
      shadows: 0,
      midtones: 1.0,
      highlights: 255,
      brightness: 0,
      contrast: 0,
    });
    setCompareTargetId(null);
    setShowCompareSlider(false);
    setActiveStage(2);
  };

  // Load Demo Image Utility
  const loadDemoImage = (theme: 'underwater' | 'indoor' | 'forest') => {
    const dataUrl = createDemoImage(theme);
    setImgSrc(dataUrl);
    setImgExt('png');
    setParams({
      method: 'none',
      neutralColor: null,
      strength: 1.0,
      shadows: 0,
      midtones: 1.0,
      highlights: 255,
      brightness: 0,
      contrast: 0,
    });
    setCompareTargetId(null);
    setShowCompareSlider(false);
    setActiveStage(2);

    if (theme === 'underwater') {
      setImgName('biota_bawah_air_cyan_cast');
    } else if (theme === 'indoor') {
      setImgName('kamar_klasik_tungsten_cast');
    } else {
      setImgName('hutan_kabut_green_cast');
    }
  };

  // Redraw / Re-execute corrections on source img update or parameter update
  const applyParams = useCallback(() => {
    const canvas = canvasRef.current;
    const imgData = originalImageDataRef.current;
    if (!canvas || !imgData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply color cast remover algorithms
    const correctedData = applyCorrections(imgData, params);
    ctx.putImageData(correctedData, 0, 0);
  }, [params]);

  // Handle active image loading and buffer initialization
  useEffect(() => {
    if (!imgSrc) return;

    const img = new Image();
    img.onload = () => {
      originalImgRef.current = img;
      
      // Determine viewport size - Cap maximum dimension to 1600px for lightning smooth real-time performance
      const maxDim = 1600;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setDisplaySize({ w, h });

      // Create main workspace canvas
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          // Extract and store baseline unaltered pixel data
          const rawData = ctx.getImageData(0, 0, w, h);
          originalImageDataRef.current = rawData;
          
          // Compute luminance levels distribution curves
          const levelsHist = computeLuminanceHistogram(rawData);
          setLuminanceHistogram(levelsHist);

          // Re-apply current parameters immediately
          applyParams();
        }
      }
    };
    img.src = imgSrc;
  }, [imgSrc, applyParams]);

  // Execute corrections whenever params changed
  useEffect(() => {
    applyParams();
  }, [params, applyParams]);

  // Generate lightweight comparison thumbnail (JPEG format for storage optimization)
  const getCanvasThumbnailUrl = (sourceCanvas: HTMLCanvasElement, maxDim = 120): string => {
    const thumb = document.createElement('canvas');
    let w = sourceCanvas.width;
    let h = sourceCanvas.height;
    if (w > h) {
      if (w > maxDim) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      }
    } else {
      if (h > maxDim) {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    thumb.width = w;
    thumb.height = h;
    const tCtx = thumb.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(sourceCanvas, 0, 0, w, h);
    }
    return thumb.toDataURL('image/jpeg', 0.85);
  };

  // Helper to add current state into Comparison history list
  const addComparisonItem = useCallback((neutral: RGB | null, customMethod?: 'eyedropper' | 'whitepatch' | 'grayworld' | 'none') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const chosenMethod = customMethod || params.method;
    const neutralValue = neutral || params.neutralColor;
    
    let label = 'Ubah Warna';
    if (chosenMethod === 'eyedropper' && neutralValue) {
      label = `Sampel R:${Math.round(neutralValue.r)} G:${Math.round(neutralValue.g)} B:${Math.round(neutralValue.b)}`;
    } else if (chosenMethod === 'grayworld') {
      label = 'Auto Gray-World';
    } else if (chosenMethod === 'whitepatch') {
      label = 'White Patch (Sorotan)';
    } else {
      label = 'Penyesuaian Manual';
    }

    const previewUrl = getCanvasThumbnailUrl(canvas, 140);
    const hdUrl = [120, 140].indexOf(canvas.width) === -1 ? getCanvasThumbnailUrl(canvas, 900) : previewUrl;
    const newItemId = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    setHdPreviews(prev => ({ ...prev, [newItemId]: hdUrl }));
    
    const newItem: ComparisonItem = {
      id: newItemId,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      name: label,
      neutralColor: neutralValue,
      method: chosenMethod,
      strength: params.strength,
      shadows: params.shadows,
      midtones: params.midtones,
      highlights: params.highlights,
      brightness: params.brightness,
      contrast: params.contrast,
      previewUrl
    };

    setComparisons(prev => [newItem, ...prev].slice(0, 20)); // Cap history to 20 states
  }, [params]);

  // Canvas Mouse Move callback for custom Eyedropper magnification loupe
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const originalData = originalImageDataRef.current;
    if (!canvas || !originalData) return;

    const rect = canvas.getBoundingClientRect();
    // Normalized position
    const xFraction = (e.clientX - rect.left) / rect.width;
    const yFraction = (e.clientY - rect.top) / rect.height;

    // Actual pixel coordinate inside canvas size (which is Display width/height)
    const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(xFraction * canvas.width)));
    const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(yFraction * canvas.height)));

    // Get RGB color around this coordinate from original baseline image
    const idx = (py * canvas.width + px) * 4;
    const r = originalData.data[idx];
    const g = originalData.data[idx + 1];
    const b = originalData.data[idx + 2];

    const bounds = e.currentTarget.parentElement?.getBoundingClientRect();
    const lX = e.clientX - (bounds?.left || 0);
    const lY = e.clientY - (bounds?.top || 0) - 30; // Float slightly above mouse coord

    setHoverData({
      x: e.clientX,
      y: e.clientY,
      imageX: px,
      imageY: py,
      color: { r, g, b },
    });

    // Draw magnification area under the mouse on loupe canvas
    const loupe = loupeCanvasRef.current;
    if (loupe) {
      const loupeCtx = loupe.getContext('2d');
      if (loupeCtx) {
        loupeCtx.imageSmoothingEnabled = false;
        // Draw 9x9 crop from main canvas
        loupeCtx.clearRect(0, 0, 100, 100);
        
        // Grab crop centered around px, py from the active corrected canvas
        loupeCtx.drawImage(
          canvas,
          px - 4, py - 4, 9, 9, // source bounding box (9x9)
          0, 0, 100, 100        // blown up onto 100x100 loupe canvas
        );

        // Render central hair tracker
        loupeCtx.strokeStyle = '#2563eb'; // blue focus border
        loupeCtx.lineWidth = 2;
        loupeCtx.strokeRect(44, 44, 12, 12); // surrounding central pixel
      }
    }
  };

  // Canvas Click: Samples the targeted color and applies correction algorithm
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropperActive || !canvasRef.current || !originalImageDataRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;

    const px = Math.floor(xFrac * canvas.width);
    const py = Math.floor(yFrac * canvas.height);

    // Compute average over a 7x7 neighborhood to reduce noise (such as grain or aberrations)
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sampleSize = 7;
    const hs = Math.floor(sampleSize / 2);
    const sx = Math.max(0, px - hs);
    const sy = Math.max(0, py - hs);
    const sw = Math.min(sampleSize, canvas.width - sx);
    const sh = Math.min(sampleSize, canvas.height - sy);

    const dataBlock = ctx.getImageData(sx, sy, sw, sh).data;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;

    for (let i = 0; i < dataBlock.length; i += 4) {
      sumR += dataBlock[i];
      sumG += dataBlock[i + 1];
      sumB += dataBlock[i + 2];
      count++;
    }

    const avgR = clamp(Math.round(sumR / count || 1));
    const avgG = clamp(Math.round(sumG / count || 1));
    const avgB = clamp(Math.round(sumB / count || 1));

    const sampledNeutral: RGB = { r: avgR, g: avgG, b: avgB };

    // Apply the correction
    setParams(prev => ({
      ...prev,
      method: 'eyedropper',
      neutralColor: sampledNeutral,
    }));

    setEyedropperActive(false);

    // Trigger state changes after update settles
    setTimeout(() => {
      addComparisonItem(sampledNeutral, 'eyedropper');
    }, 100);
  };

  // Apply other correction shortcuts
  const applyWhitePatchGlobal = () => {
    setParams(prev => ({ ...prev, method: 'whitepatch', neutralColor: null }));
    setTimeout(() => addComparisonItem(null, 'whitepatch'), 100);
  };

  const applyGrayWorldGlobal = () => {
    setParams(prev => ({ ...prev, method: 'grayworld', neutralColor: null }));
    setTimeout(() => addComparisonItem(null, 'grayworld'), 100);
  };

  const resetAll = () => {
    setParams({
      method: 'none',
      neutralColor: null,
      strength: 1.0,
      shadows: 0,
      midtones: 1.0,
      highlights: 255,
      brightness: 0,
      contrast: 0,
    });
    setCompareTargetId(null);
    setShowCompareSlider(false);
  };

  // Keyboard hooks implementation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement?.tagName;
      if (activeEl === 'INPUT' || activeEl === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (key === 'r') {
        setEyedropperActive(prev => !prev);
      } else if (key === 'd') {
        handleExportJpg();
      } else if (key === 'z') {
        resetAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save specific Neutral coordinate as browser-persistent Preset
  const savePresetToStorage = () => {
    try {
      const targetColor = params.neutralColor || { r: 128, g: 128, b: 128 };
      
      const fullPresetData = {
        neutralColor: params.neutralColor, // Keep actual neutralColor (can be null if only sliders changed)
        method: params.method,
        strength: params.strength,
        shadows: params.shadows,
        midtones: params.midtones,
        highlights: params.highlights,
        brightness: params.brightness,
        contrast: params.contrast,
      };

      if (params.neutralColor) {
        localStorage.setItem('rcc_preset_rgb_v1', JSON.stringify(params.neutralColor));
      } else {
        localStorage.removeItem('rcc_preset_rgb_v1');
      }
      localStorage.setItem('rcc_preset_full_v1', JSON.stringify(fullPresetData));
      
      setActivePreset({
        id: `local-preset-${Date.now()}`,
        name: params.neutralColor ? 'Preset Kustom Disimpan' : 'Preset Penyempurnaan Gambar',
        neutralColor: targetColor,
        method: params.method,
        strength: params.strength,
        shadows: params.shadows,
        midtones: params.midtones,
        highlights: params.highlights,
        brightness: params.brightness,
        contrast: params.contrast,
        createdAt: new Date().toLocaleDateString('id-ID'),
      } as any);
    } catch (e) {
      console.error(e);
    }
  };

  // Delete preset history (keep canvas image preview intact)
  const deletePreset = () => {
    try {
      localStorage.removeItem('rcc_preset_rgb_v1');
      localStorage.removeItem('rcc_preset_full_v1');
      setActivePreset(null);
    } catch (e) {
      console.error('Failed to delete preset', e);
    }
  };

  // Apply stored preset
  const applyPreset = () => {
    if (!activePreset) return;
    setParams(prev => {
      const p = activePreset as any;
      return {
        ...prev,
        method: p.method !== undefined ? p.method : 'eyedropper',
        neutralColor: p.neutralColor !== undefined ? p.neutralColor : activePreset.neutralColor,
        strength: p.strength !== undefined ? p.strength : prev.strength,
        shadows: p.shadows !== undefined ? p.shadows : prev.shadows,
        midtones: p.midtones !== undefined ? p.midtones : prev.midtones,
        highlights: p.highlights !== undefined ? p.highlights : prev.highlights,
        brightness: p.brightness !== undefined ? p.brightness : prev.brightness,
        contrast: p.contrast !== undefined ? p.contrast : prev.contrast,
      };
    });
  };

  // Download export as high quality JPG format with selected resolution (HD to 4K)
  const handleExportJpg = () => {
    const img = originalImgRef.current;
    if (!img) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${imgName}_remove_color_cast_${exportResolution}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 'image/jpeg', 0.95);
      } catch (err) {
        alert('Gagal mengekspor gambar (kemungkinan taint canvas silang-asal).');
      }
      return;
    }

    try {
      // Calculate target dimensions based on selected resolution
      let targetWidth = img.naturalWidth;
      let targetHeight = img.naturalHeight;

      let maxDim = 0;
      if (exportResolution === 'hd') maxDim = 1280;
      else if (exportResolution === 'fhd') maxDim = 1920;
      else if (exportResolution === '2k') maxDim = 2560;
      else if (exportResolution === '4k') maxDim = 3840;

      if (maxDim > 0) {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            targetHeight = Math.round((h * maxDim) / w);
            targetWidth = maxDim;
          } else {
            targetWidth = Math.round((w * maxDim) / h);
            targetHeight = maxDim;
          }
        }
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = targetWidth;
      tempCanvas.height = targetHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const rawData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);
      const correctedData = applyCorrections(rawData, params);
      tempCtx.putImageData(correctedData, 0, 0);

      tempCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${imgName}_remove_color_cast_${exportResolution.toUpperCase()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);
    } catch (err) {
      alert('Gagal mengekspor gambar berkualitas tinggi (kemungkinan taint canvas silang-asal).');
    }
  };

  // Auto Gray World then download convenience pipeline
  const handleAutoThenDownload = () => {
    setParams(prev => ({ ...prev, method: 'grayworld', neutralColor: null }));
    setTimeout(() => {
      handleExportJpg();
    }, 150);
  };

  // Generate and export Photoshop-compatible LUT .cube file
  const handleExportCubeLUT = () => {
    if (!params.neutralColor) {
      alert('Gunakan Eyedropper atau pilih area netral sebelum mengekspor LUT (.cube).');
      return;
    }

    const { gR, gG, gB } = wbGainsFromNeutralRGB(params.neutralColor);
    const content = generateCubeLUT_fromWB(gR, gG, gB, 33);

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${imgName}_ColorBalance.cube`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadFile(e.dataTransfer.files[0]);
    }
  };

  // Remove comparison from left side panel history queue
  const removeComparisonItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent executing comparison load
    setComparisons(prev => prev.filter(item => item.id !== id));
    if (compareTargetId === id) {
      setCompareTargetId(null);
      setShowCompareSlider(false);
    }
  };

  // Choose a history record to trigger live split-screen slider comparison
  const toggleSelectComparison = (item: ComparisonItem) => {
    if (compareTargetId === item.id) {
      setCompareTargetId(null);
      setShowCompareSlider(false);
    } else {
      setCompareTargetId(item.id);
      setShowCompareSlider(true);
    }
  };

  // Restore baseline values from history Item
  const applyComparisonStateBack = (item: ComparisonItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setParams({
      method: item.method,
      neutralColor: item.neutralColor,
      strength: item.strength,
      shadows: item.shadows,
      midtones: item.midtones,
      highlights: item.highlights,
      brightness: item.brightness ?? 0,
      contrast: item.contrast ?? 0,
    });
  };

  // Neutral color preview blocks
  const getMethodNameIndonesia = (method: string) => {
    switch (method) {
      case 'grayworld': return 'Abu-abu Otomatis';
      case 'whitepatch': return 'White Patch';
      case 'eyedropper': return 'Pencari Warna (Neutral)';
      default: return 'No Color Cast Correction';
    }
  };

  return (
    <div className="min-h-screen text-slate-100 font-sans selection:bg-blue-500/30 selection:text-blue-300">
      {/* Background radial soft light gradient */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0f172a] via-[#070b13] to-[#030712] -z-10" />
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full filter blur-[120px] -z-10 pointer-events-none" />
      <div className="fixed bottom-10 right-1/4 w-[400px] h-[400px] bg-teal-500/5 rounded-full filter blur-[100px] -z-10 pointer-events-none" />

      {/* Main container */}
      <div className="max-w-full mx-auto px-4 lg:px-8 xl:px-12 py-6 md:py-8 flex flex-col justify-between min-h-screen">
        
        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1" id="app-workspace">
          
          {/* COLUMN 1: LEFT SIDEBAR WITH HEADER & COMPARISONS */}
          <div className="lg:col-span-3 flex flex-col gap-5 self-stretch animate-fadeIn" id="sidebar-left">
            
            {/* Header Section */}
            <header className="flex flex-col gap-3 pb-5 border-b border-slate-800/60" id="app-header">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="bg-blue-600/10 text-blue-400 text-[10px] px-2.5 py-0.5 rounded-full font-bold border border-blue-500/20 tracking-wider uppercase font-display leading-none">
                    Studio Pro Engine
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono leading-none">Ver 1.2 • Lokal</span>
                </div>
                <h1 className="text-xl md:text-2xl font-bold font-display tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent leading-snug">
                  Hapus Bias Warna (Remove Color Cast)
                </h1>
                <p className="text-slate-400 text-[11px] leading-relaxed mt-1.5">
                  Hilangkan bias cahaya lampu, air laut, atau kesalahan white balance seperti fitur legendaris aplikasi desktop pro.
                </p>
              </div>
              
              <div className="flex flex-col gap-1.5 bg-slate-900/65 backdrop-blur-md px-3 py-2.5 rounded-xl border border-slate-800/80 text-[11.5px] text-slate-400 font-display" id="shortcut-helper">
                <span className="font-bold text-slate-200 text-[10px] uppercase tracking-wider">Pintasan Keyboard</span>
                <div className="grid grid-cols-3 gap-1">
                  <span className="flex items-center gap-1 leading-none"><kbd className="bg-slate-800 text-slate-100 px-1 py-0.5 rounded border border-slate-700 font-mono text-[10px] font-bold">R</kbd> Picker</span>
                  <span className="flex items-center gap-1 leading-none"><kbd className="bg-slate-800 text-slate-100 px-1 py-0.5 rounded border border-slate-700 font-mono text-[10px] font-bold">Z</kbd> Reset</span>
                  <span className="flex items-center gap-1 leading-none"><kbd className="bg-slate-800 text-slate-100 px-1 py-0.5 rounded border border-slate-700 font-mono text-[10px] font-bold">D</kbd> Save</span>
                </div>
              </div>
            </header>

            {/* LEFT COMPARISON SIDEBAR queue */}
            <div className="flex flex-col bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 overflow-hidden flex-1" id="sidebar-comparisons">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <h3 className="font-display font-semibold text-sm text-slate-200">Pratinjau Komparasi</h3>
              </div>
              <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-medium">
                {comparisons.length}/20 state
              </span>
            </div>

            {/* Hint & Save manually trigger */}
            <div className="mb-3">
              <button
                onClick={() => addComparisonItem(null)}
                disabled={params.method === 'none'}
                className="w-full text-left bg-slate-800/50 hover:bg-slate-800 border border-slate-700/65 rounded-xl px-3 py-2 text-xs flex justify-between items-center transition duration-200 disabled:opacity-40 disabled:pointer-events-none group"
                id="btn-save-current-compare"
              >
                <span className="text-slate-300 font-medium group-hover:text-white transition">💾 Simpan State Aktif</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-0.5 transition" />
              </button>
            </div>

            {/* List with scroll container */}
            <div className="flex-1 overflow-y-auto max-h-[380px] lg:max-h-[580px] pr-1" style={{ scrollbarWidth: 'thin' }}>
              <AnimatePresence initial={false}>
                {comparisons.map((item) => {
                  const isActiveForSlider = compareTargetId === item.id;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className={`group relative mb-2.5 p-2 rounded-xl transition duration-200 border cursor-pointer select-none flex items-start gap-2.5 ${
                        isActiveForSlider 
                          ? 'bg-blue-950/40 border-blue-500/80 shadow-md ring-1 ring-blue-500/30' 
                          : 'bg-slate-900/50 hover:bg-slate-800/80 border-slate-800/90'
                      }`}
                      onClick={() => toggleSelectComparison(item)}
                      id={`compare-item-${item.id}`}
                    >
                      {/* Image Thumbnail with split compare state identifier */}
                      <div className="relative w-20 aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0">
                        <img src={item.previewUrl} alt="prev" className="w-full h-full object-cover" />
                        {isActiveForSlider && (
                          <div className="absolute inset-0 bg-blue-600/35 flex items-center justify-center">
                            <GitCompare className="w-4 h-4 text-white animate-pulse" />
                          </div>
                        )}
                      </div>

                      {/* Item Parameters Info */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-1.5 mb-1 justify-between">
                          <span className="text-[10px] text-slate-500 font-mono">{item.timestamp}</span>
                          {item.neutralColor && (
                            <span 
                              className="w-3.5 h-2.5 rounded-sm border border-slate-700/60 block" 
                              style={{ backgroundColor: `rgb(${item.neutralColor.r},${item.neutralColor.g},${item.neutralColor.b})` }} 
                              title="Warna dinetralkan"
                            />
                          )}
                        </div>
                        <h4 className="text-[11.5px] font-medium text-slate-300 truncate tracking-tight">{item.name}</h4>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          Metode: <span className="font-semibold text-slate-400">{getMethodNameIndonesia(item.method)}</span>
                        </p>
                      </div>

                      {/* Small floating quick restore and delete actions */}
                      <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition duration-150">
                        <button
                          onClick={(e) => applyComparisonStateBack(item, e)}
                          title="Terapkan kembali pengaturan state ini"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition"
                          id={`restore-item-${item.id}`}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => removeComparisonItem(item.id, e)}
                          className="p-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-800/40 text-red-400 hover:text-red-200 transition"
                          title="Hapus pratinjau ini dari panel"
                          id={`delete-item-${item.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {comparisons.length === 0 && (
                <div className="text-center py-10 px-4 text-slate-500 border border-dashed border-slate-800 rounded-xl" id="zero-comparisons">
                  <GitCompare className="w-8 h-8 mx-auto mb-2.5 opacity-30 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-400 font-display">Belum ada komparasi disimpan</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Setiap Anda klik di foto dalam mode Eyedropper, hasilnya otomatis disimpan di sini untuk dibandingkan side-by-side.
                  </p>
                </div>
              )}
            </div>

            {/* Clear all comparisons history link */}
            {comparisons.length > 0 && (
              <button
                onClick={() => {
                  setComparisons([]);
                  setCompareTargetId(null);
                  setShowCompareSlider(false);
                }}
                className="mt-4 text-center text-[11px] text-red-400/90 hover:text-red-300 font-medium transition py-1"
                id="btn-clear-comparisons"
              >
                Hapus Semua Pratinjau Komparasi
              </button>
            )}
          </div>
          </div>

          {/* COLUMN 2: CENTER VIEWPORT (Workspace viewport) */}
          <div className="lg:col-span-6 flex flex-col gap-4 self-stretch" id="center-workspace">
            
            {/* Header: drag action trigger indicator or notification banner */}
            {eyedropperActive ? (
              <div className="bg-blue-600/10 border border-blue-500/30 text-blue-300 px-4 py-2.5 rounded-xl flex items-center gap-3 animate-pulse" id="alert-eyedropper-active">
                <MousePointer className="w-4 h-4 text-blue-400 flex-shrink-0 animate-bounce" />
                <div className="text-xs leading-relaxed">
                  <span className="font-semibold text-white font-display">Mode Eyedropper Aktif.</span> Klik area abu-abu semen, bayangan netral, atau putih kusam pada foto Anda untuk menetralkan color cast.
                </div>
              </div>
            ) : showCompareSlider && compareTargetId ? (
              <div className="bg-slate-900/60 border border-slate-800 text-slate-300 px-4 py-2 rounded-xl flex items-center justify-between text-xs" id="alert-compare-slider">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Sedang membandingkan dengan : <strong>{comparisons.find(c => c.id === compareTargetId)?.name}</strong></span>
                </div>
                <button 
                  onClick={() => {
                    setShowCompareSlider(false);
                    setCompareTargetId(null);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-[11px] px-2.5 py-1 rounded font-semibold text-slate-300 transition"
                  id="btn-exit-slider-compare"
                >
                  Tutup Komparasi
                </button>
              </div>
            ) : null}

            {/* Canvas Interactive viewport container */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative flex-1 flex flex-col items-center justify-center min-h-[480px] md:min-h-[580px] lg:min-h-[660px] rounded-2xl border transition-all duration-200 overflow-hidden bg-slate-950 p-3 select-none ${
                isDraggingOver 
                  ? 'border-blue-500 bg-blue-950/10 shadow-lg shadow-blue-500/5' 
                  : 'border-slate-800/80 shadow-2xl'
              }`}
              id="canvas-box"
            >
              {!imgSrc ? (
                <div className="flex flex-col items-center justify-center text-center p-8 max-w-md animate-fadeIn" id="empty-canvas-placeholder">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-center text-slate-400 mb-4 shadow-xl">
                    <ImageIcon className="w-8 h-8 text-blue-400/80" />
                  </div>
                  <h3 className="font-display font-semibold text-sm text-slate-200 mb-1">
                    Belum Ada Gambar Dimuat
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    Mulai dengan memilih gambar dari Panel 1 di samping kanan, atau seret gambar Anda langsung ke area ini.
                  </p>
                  
                  {/* File Upload Trigger Button */}
                  <label 
                    htmlFor="canvasFileInput"
                    className="py-2.5 px-5 bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/10 text-white font-semibold text-xs rounded-xl cursor-pointer transition flex items-center gap-2 mb-4"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Pilih Gambar Sekarang
                  </label>
                  <input 
                    id="canvasFileInput" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        loadFile(e.target.files[0]);
                      }
                    }}
                  />
                  
                  <span className="text-[10px] text-slate-500 font-display">
                    Pintasan: Seret & lepas file di area mana saja
                  </span>
                </div>
              ) : (
                /* Main Preview (Active editing OR Drag Slider) */
                <div className="relative w-full h-full flex items-center justify-center">
                  
                  {/* 1. If slider mode is triggered, render CompareSlider */}
                  <div className={`w-full h-full flex items-center justify-center py-2 antialiased ${showCompareSlider && compareTargetId ? '' : 'hidden'}`}>
                    {showCompareSlider && compareTargetId && (
                      <CompareSlider 
                        key={compareTargetId}
                        originalUrl={hdPreviews[compareTargetId] || comparisons.find(c => c.id === compareTargetId)?.previewUrl || imgSrc}
                        processedUrl={canvasRef.current?.toDataURL('image/jpeg', 0.95) || imgSrc}
                        baselineLabel={comparisons.find(c => c.id === compareTargetId)?.name}
                        processedLabel="Hasil Aktif"
                      />
                    )}
                  </div>

                  {/* 2. Standard Canvas view mode (always mounted to prevent context loss!) */}
                  <div 
                    className={`relative max-w-full cursor-pointer overflow-hidden rounded-lg outline-none ${showCompareSlider && compareTargetId ? 'hidden' : ''}`}
                    style={{
                      cursor: eyedropperActive ? 'crosshair' : 'default',
                    }}
                    onMouseEnter={() => setIsHoveringCanvas(true)}
                    onMouseLeave={() => {
                      setIsHoveringCanvas(false);
                      setHoverData(null);
                    }}
                    onMouseMove={handleCanvasMouseMove}
                    onClick={handleCanvasClick}
                    id="main-canvas-wrapper"
                  >
                    <canvas 
                      ref={canvasRef}
                      className="max-w-full h-auto max-h-[70vh] block object-contain shadow-2xl"
                    />
                  </div>
                </div>
              )}

              {/* Eyedropper Magnifier Loupe absolute overlay bubble (floating over parent viewport) */}
              {imgSrc && eyedropperActive && isHoveringCanvas && hoverData && (
                <div 
                  className="absolute z-40 bg-slate-900 border-2 border-blue-500 rounded-full shadow-2xl overflow-hidden flex flex-col items-center justify-center select-none"
                  id="eyedropper-loupe-bubble"
                  style={{
                    left: `${hoverData.x - (canvasRef.current?.getBoundingClientRect().left || 0) + 16}px`,
                    top: `${hoverData.y - (canvasRef.current?.getBoundingClientRect().top || 0) - 110}px`,
                    width: '100px',
                    height: '100px',
                  }}
                >
                  <canvas 
                    ref={loupeCanvasRef} 
                    width={100} 
                    height={100} 
                    className="w-full h-full block rounded-full"
                  />
                  {/* Absolute small coordinate indicator overlay */}
                  <div className="absolute bottom-1 bg-slate-950/80 text-[8px] font-mono px-2 py-0.5 rounded text-white tracking-widest leading-none">
                    {hoverData.color.r},{hoverData.color.g},{hoverData.color.b}
                  </div>
                </div>
              )}

              {/* Drag and drop overlay when dragging locally */}
              {isDraggingOver && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
                  <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-bold text-white font-display">Lepas gambar untuk mengedit</h4>
                  <p className="text-xs text-slate-400">Mendukung format PNG, JPG, JPEG, WebP</p>
                </div>
              )}
            </div>

            {/* Display status detail under the canvas */}
            {imgSrc && (
              <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-900/30 p-3 rounded-xl border border-slate-800/80 text-xs text-slate-400" id="canvas-footer-bar">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-500" />
                <span className="font-mono text-slate-300 antialiased truncate max-w-[200px]" title={imgName}>
                  {imgName}.{imgExt}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 text-[11px] font-mono">
                  Origin: {naturalSize.w} × {naturalSize.h}px
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 text-[11px] font-mono">
                  Display: {displaySize.w} × {displaySize.h}px
                </span>
              </div>

              <div className="flex items-center gap-2">
                {params.method !== 'none' && (
                  <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 py-0.5 px-2 rounded-md border border-blue-500/20 text-[11px] font-medium leading-none">
                    Aktif: {getMethodNameIndonesia(params.method)}
                    {params.neutralColor && (
                      <span 
                        className="w-2 h-2 rounded-sm border border-slate-600/40 inline-block shrink-0" 
                        style={{ backgroundColor: `rgb(${params.neutralColor.r},${params.neutralColor.g},${params.neutralColor.b})` }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>

          {/* COLUMN 3: RIGHT PANEL (Correction Params control) */}
          <div className="lg:col-span-3 flex flex-col gap-4 self-stretch" id="right-control-panel">
            
            {/* Control Group 1: Choose File, drag area info & Demo presets */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col transition-all duration-300" id="ctrl-group-source">
              <button
                type="button"
                onClick={() => setActiveStage(activeStage === 1 ? 0 : 1)}
                className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800/60 cursor-pointer hover:opacity-95 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-teal-400" />
                  <h3 className="font-display font-semibold text-xs text-slate-300">1) Masukkan Gambar</h3>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${activeStage === 1 ? 'rotate-180' : ''}`} />
              </button>

              {activeStage === 1 && (
                <div className="flex flex-col gap-3 pt-3">
                  {/* Drag zone click button info */}
                  <div className="relative">
                    <label 
                      htmlFor="fileInput"
                      className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-800 hover:border-slate-700 rounded-xl bg-slate-950/40 hover:bg-slate-950/80 hover:shadow-inner cursor-pointer transition text-center group"
                    >
                      <Upload className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition mb-1" />
                      <span className="text-[11.5px] font-semibold text-slate-300">Pilih gambar dari komputer</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">atau seret file ke sini</span>
                    </label>
                    <input 
                      id="fileInput" 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          loadFile(e.target.files[0]);
                        }
                      }}
                    />
                  </div>

                  {/* Quick load demo assets */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-medium block mb-2 font-display">Atau uji langsung dengan gambar bias warna bawaan:</label>
                    <div className="grid grid-cols-3 gap-1.5" id="demo-triggers">
                      <button 
                        onClick={() => loadDemoImage('underwater')}
                        className="bg-sky-950/40 hover:bg-sky-950/80 border border-sky-800/40 hover:border-sky-700/60 transition py-1.5 px-1 rounded-lg text-[10.5px] font-semibold text-sky-300 flex flex-col items-center gap-1 cursor-pointer"
                        id="demo-underwater"
                      >
                        <span className="w-4 h-4 rounded-full bg-cyan-500/30 flex items-center justify-center text-[8px]">🌊</span>
                        Laut Biru
                      </button>
                      <button 
                        onClick={() => loadDemoImage('indoor')}
                        className="bg-amber-950/40 hover:bg-amber-950/80 border border-amber-800/40 hover:border-amber-700/60 transition py-1.5 px-1 rounded-lg text-[10.5px] font-semibold text-amber-300 flex flex-col items-center gap-1 cursor-pointer"
                        id="demo-indoor"
                      >
                        <span className="w-4 h-4 rounded-full bg-amber-500/30 flex items-center justify-center text-[8px]">💡</span>
                        Lampu Lilin
                      </button>
                      <button 
                        onClick={() => loadDemoImage('forest')}
                        className="bg-emerald-950/40 hover:bg-emerald-950/80 border border-emerald-800/40 hover:border-emerald-700/60 transition py-1.5 px-1 rounded-lg text-[10.5px] font-semibold text-emerald-300 flex flex-col items-center gap-1 cursor-pointer"
                        id="demo-forest"
                      >
                        <span className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-[8px]">🌲</span>
                        Hutan Hijau
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Control Group 2: Algorithmic Balance removers */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col transition-all duration-300" id="ctrl-group-algorithms">
              <button
                type="button"
                onClick={() => setActiveStage(activeStage === 2 ? 0 : 2)}
                className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800/60 cursor-pointer hover:opacity-95 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  <h3 className="font-display font-semibold text-xs text-slate-300">2) Penetralan Bias</h3>
                </div>
                <div className="flex items-center gap-2">
                  {params.method !== 'none' && (
                    <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono font-bold leading-none animate-pulse">
                      AKTIF
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${activeStage === 2 ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {activeStage === 2 && (
                <div className="flex flex-col gap-3.5 pt-3 animate-fadeIn">
                  <div className="flex justify-end -mt-0.5 mb-1 animate-fadeIn">
                    {params.method !== 'none' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); resetAll(); }}
                        className="text-[10.5px] font-semibold text-red-550/90 hover:text-red-400 flex items-center gap-1 transition"
                        id="btn-action-reset"
                        title="Ulangi seperti gambar awal"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Semua
                      </button>
                    )}
                  </div>

                  {/* Eyedropper calibration trigger */}
                  <button
                    type="button"
                    onClick={() => setEyedropperActive(!eyedropperActive)}
                    className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer ${
                      eyedropperActive 
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 border border-blue-400' 
                        : 'bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white'
                    }`}
                    id="btn-eyedropper-trigger"
                  >
                    <MousePointer className={`w-3.5 h-3.5 ${eyedropperActive ? 'animate-pulse' : ''}`} />
                    {eyedropperActive ? 'Eyedropper: Aktif' : 'Aktifkan Eyedropper'}
                  </button>
                  
                  <div className="grid grid-cols-2 gap-2 font-display">
                    <button
                      type="button"
                      onClick={applyWhitePatchGlobal}
                      className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer text-center ${
                        params.method === 'whitepatch'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/40 font-bold'
                          : 'bg-slate-800/20 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300'
                      }`}
                      id="btn-whitepatch"
                      title="Hilangkan bias warna berdasarkan intensitas sorotan sRGB maksimum"
                    >
                      White Patch
                    </button>
                    <button
                      type="button"
                      onClick={applyGrayWorldGlobal}
                      className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer text-center ${
                        params.method === 'grayworld'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/40 font-bold'
                          : 'bg-slate-800/20 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300'
                      }`}
                      id="btn-grayworld"
                      title="Gunakan algoritma Gray-World untuk menyeimbangkan rata-rata warna RGB"
                    >
                      Auto Gray-World
                    </button>
                  </div>

                  {/* Slider for calibration strength */}
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 flex flex-col gap-1.5 font-display">
                    <div className="flex justify-between items-center text-xs">
                      <label className="text-slate-500 font-medium">Kekuatan (Strength)</label>
                      <span className="font-mono text-slate-300 font-medium">
                        {Math.round(params.strength * 100)}%
                      </span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      value={params.strength * 100}
                      onChange={(e) => setParams(prev => ({ ...prev, strength: Number(e.target.value) / 100 }))}
                      className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      id="slider-strength"
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Control Group 3: Fine tuning image adjustments (Tabs for Brightness/Contrast & Levels) */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col transition-all duration-300" id="ctrl-group-fine-tune">
              <button
                type="button"
                onClick={() => setActiveStage(activeStage === 3 ? 0 : 3)}
                className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800/60 cursor-pointer hover:opacity-95 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-pink-400" />
                  <h3 className="font-display font-semibold text-xs text-slate-300">3) Penyempurnaan Gambar</h3>
                </div>
                <div className="flex items-center gap-2">
                  {(params.brightness !== 0 || params.contrast !== 0 || params.shadows !== 0 || params.midtones !== 1.0 || params.highlights !== 255) && (
                    <span className="text-[9px] bg-pink-500/10 text-pink-400 px-1.5 py-0.5 rounded border border-pink-500/20 font-mono font-bold leading-none">
                      DIUBAH
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${activeStage === 3 ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {activeStage === 3 && (
                <div className="flex flex-col gap-3.5 pt-3 animate-fadeIn">
                  {/* Tab selector buttons */}
                  <div className="flex bg-slate-950 p-1 rounded-xl gap-1 border border-slate-800/60" id="refinement-tabs-bar">
                    <button
                      type="button"
                      onClick={() => setRefinementTab('bc')}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all text-center cursor-pointer ${
                        refinementTab === 'bc'
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20 shadow-inner'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                      id="tab-bc"
                    >
                      Brightness/Contrast
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefinementTab('levels')}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all text-center cursor-pointer ${
                        refinementTab === 'levels'
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20 shadow-inner'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                      id="tab-levels"
                    >
                      Levels
                    </button>
                  </div>

                  {/* Tab 1: Brightness & Contrast controls */}
                  {refinementTab === 'bc' && (
                    <div className="flex flex-col gap-3.5 animate-fadeIn" id="tab-content-bc">
                      {/* Brightness slider with manual typing box */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 flex items-center gap-1 font-semibold">Brightness (Kecerahan)</span>
                          <input 
                            type="number"
                            min="-100"
                            max="100"
                            value={params.brightness}
                            onChange={(e) => {
                              let val = Math.min(Math.max(-100, Number(e.target.value)), 100);
                              if (isNaN(val)) val = 0;
                              setParams(prev => ({ ...prev, brightness: val }));
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 text-center text-slate-200 font-mono text-xs rounded py-0.5 px-1 focus:outline-none focus:border-blue-500 hover:border-slate-700 transition"
                          />
                        </div>
                        <input 
                          type="range"
                          min="-100"
                          max="100"
                          value={params.brightness}
                          onChange={(e) => setParams(prev => ({ ...prev, brightness: Number(e.target.value) }))}
                          className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          id="slider-brightness"
                        />
                      </div>

                      {/* Contrast slider with manual typing box */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 flex items-center gap-1 font-semibold">Contrast (Kontras)</span>
                          <input 
                            type="number"
                            min="-100"
                            max="100"
                            value={params.contrast}
                            onChange={(e) => {
                              let val = Math.min(Math.max(-100, Number(e.target.value)), 100);
                              if (isNaN(val)) val = 0;
                              setParams(prev => ({ ...prev, contrast: val }));
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 text-center text-slate-200 font-mono text-xs rounded py-0.5 px-1 focus:outline-none focus:border-blue-500 hover:border-slate-700 transition"
                          />
                        </div>
                        <input 
                          type="range"
                          min="-100"
                          max="100"
                          value={params.contrast}
                          onChange={(e) => setParams(prev => ({ ...prev, contrast: Number(e.target.value) }))}
                          className="w-full accent-amber-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          id="slider-contrast"
                        />
                      </div>

                      {/* Reset indicator */}
                      {(params.brightness !== 0 || params.contrast !== 0) && (
                        <button
                          onClick={() => setParams(prev => ({ ...prev, brightness: 0, contrast: 0 }))}
                          className="text-[10px] text-right text-slate-500 hover:text-slate-300 transition mt-1 underline cursor-pointer"
                          id="btn-reset-bc-tab"
                        >
                          Reset Brightness & Contrast
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Levels adjustments controls with luminance graph representation */}
                  {refinementTab === 'levels' && (
                    <div className="flex flex-col gap-3.5 animate-fadeIn" id="tab-content-levels">
                      {/* Luminance histogram graph representation */}
                      <LevelsHistogramView 
                        histogram={luminanceHistogram} 
                        params={params} 
                        setParams={setParams} 
                      />

                      {/* Shadows (Bayangan) Slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 flex items-center gap-1 font-semibold">Shadows (Sisi Gelap)</span>
                          <input 
                            type="number"
                            min="0"
                            max={Math.max(0, params.highlights - 5)}
                            value={params.shadows}
                            onChange={(e) => {
                              let val = Math.min(Math.max(0, Number(e.target.value)), Math.max(0, params.highlights - 5));
                              if (isNaN(val)) val = 0;
                              setParams(prev => ({ ...prev, shadows: val }));
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 text-center text-slate-200 font-mono text-xs rounded py-0.5 px-1 focus:outline-none focus:border-blue-500 hover:border-slate-700 transition"
                          />
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max={Math.max(0, params.highlights - 5)}
                          value={params.shadows}
                          onChange={(e) => setParams(prev => ({ ...prev, shadows: Number(e.target.value) }))}
                          className="w-full accent-slate-400 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          id="slider-shadows"
                        />
                      </div>

                      {/* Midtones (Nada Tengah / Gamma) Slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 flex items-center gap-1 font-semibold">Midtones (Gamma Tengah)</span>
                          <input 
                            type="number"
                            min="0.10"
                            max="9.90"
                            step="0.05"
                            value={Number(params.midtones.toFixed(2))}
                            onChange={(e) => {
                              let val = Math.min(Math.max(0.10, Number(e.target.value)), 9.90);
                              if (isNaN(val)) val = 1.0;
                              setParams(prev => ({ ...prev, midtones: val }));
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 text-center text-slate-200 font-mono text-xs rounded py-0.5 px-1 focus:outline-none focus:border-blue-500 hover:border-slate-700 transition"
                          />
                        </div>
                        <input 
                          type="range"
                          min="0.10"
                          max="9.90"
                          step="0.05"
                          value={params.midtones}
                          onChange={(e) => setParams(prev => ({ ...prev, midtones: Number(e.target.value) }))}
                          className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          id="slider-midtones"
                        />
                      </div>

                      {/* Highlights (Sorotan Sisi Terang) Slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 flex items-center gap-1 font-semibold">Highlights (Sorotan Terang)</span>
                          <input 
                            type="number"
                            min={Math.min(255, params.shadows + 5)}
                            max="255"
                            value={params.highlights}
                            onChange={(e) => {
                              let val = Math.max(Math.min(255, Number(e.target.value)), Math.min(255, params.shadows + 5));
                              if (isNaN(val)) val = 255;
                              setParams(prev => ({ ...prev, highlights: val }));
                            }}
                            className="w-16 bg-slate-950 border border-slate-800 text-center text-slate-200 font-mono text-xs rounded py-0.5 px-1 focus:outline-none focus:border-blue-500 hover:border-slate-700 transition"
                          />
                        </div>
                        <input 
                          type="range"
                          min={Math.min(255, params.shadows + 5)}
                          max="255"
                          value={params.highlights}
                          onChange={(e) => setParams(prev => ({ ...prev, highlights: Number(e.target.value) }))}
                          className="w-full accent-amber-400 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          id="slider-highlights"
                        />
                      </div>

                      {/* Reset indicator */}
                      {(params.shadows !== 0 || params.midtones !== 1.0 || params.highlights !== 255) && (
                        <button
                          onClick={() => setParams(prev => ({ ...prev, shadows: 0, midtones: 1.0, highlights: 255 }))}
                          className="text-[10px] text-right text-slate-500 hover:text-slate-300 transition mt-1 underline cursor-pointer"
                          id="btn-reset-levels-tab"
                        >
                          Reset Levels
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Control Group 4: Local Preset Manager (localStorage) */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col transition-all duration-300" id="ctrl-group-presets">
              <button
                type="button"
                onClick={() => setActiveStage(activeStage === 4 ? 0 : 4)}
                className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800/60 cursor-pointer hover:opacity-95 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-display font-semibold text-xs text-slate-300">4) Preset White Balance</h3>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${activeStage === 4 ? 'rotate-180' : ''}`} />
              </button>

              {activeStage === 4 && (
                <div className="flex flex-col gap-3 pt-3 animate-fadeIn">
                  {/* Stored Block info */}
                  {activePreset ? (
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 flex items-start justify-between gap-2.5 text-xs text-slate-400 font-display" id="preset-block-display">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-6 h-6 rounded-md border border-slate-750 block shrink-0"
                          style={{ backgroundColor: `rgb(${activePreset.neutralColor.r},${activePreset.neutralColor.g},${activePreset.neutralColor.b})` }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11.5px] font-semibold text-slate-300 truncate">
                            {activePreset.name === 'Preset Penyempurnaan Gambar' 
                              ? 'Refinement Preset' 
                              : `R:${Math.round(activePreset.neutralColor.r)} G:${Math.round(activePreset.neutralColor.g)} B:${Math.round(activePreset.neutralColor.b)}`}
                          </p>
                          <p className="text-[10px] text-slate-500">{activePreset.createdAt}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-center shrink-0">
                        <button 
                          type="button"
                          onClick={applyPreset}
                          className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 px-2.5 py-1 rounded-lg font-semibold text-[10.5px] border border-indigo-500/20 transition cursor-pointer"
                          id="btn-preset-apply"
                        >
                          Terapkan
                        </button>
                        <button 
                          type="button"
                          onClick={deletePreset}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-1.5 rounded-lg border border-red-500/15 transition cursor-pointer"
                          id="btn-preset-delete"
                          title="Hapus Preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic py-1 text-center font-display" id="no-preset-hint">
                      Belum ada preset terdaftar di browser ini.
                    </div>
                  )}

                  {/* Trigger to save custom color cast configuration */}
                  <button
                    type="button"
                    disabled={!imgSrc}
                    onClick={savePresetToStorage}
                    className="w-full py-1.5 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold transition disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer text-center font-display"
                    id="btn-preset-save"
                    title="Simpan gain netral saat ini ke memori browser lokal"
                  >
                    Simpan Preset Saat Ini
                  </button>
                </div>
              )}
            </div>

            {/* Control Group 5: Final high quality Exports */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col transition-all duration-300" id="ctrl-group-exports">
              <button
                type="button"
                onClick={() => setActiveStage(activeStage === 5 ? 0 : 5)}
                className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800/60 cursor-pointer hover:opacity-95 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <FileDown className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-display font-semibold text-xs text-slate-300">5) Publikasikan & Ekspor</h3>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${activeStage === 5 ? 'rotate-180' : ''}`} />
              </button>

              {activeStage === 5 && (
                <div className="flex flex-col gap-3.5 pt-3 animate-fadeIn font-display">
                  {/* Resolution Selector UI */}
                  <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 flex flex-col gap-2">
                    <label className="text-[10.5px] text-slate-400 font-bold tracking-wide uppercase">Pilih Resolusi Ekspor</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setExportResolution('original')}
                        className={`py-1.5 px-2 rounded text-[11px] font-mono font-medium border text-center transition cursor-pointer ${
                          exportResolution === 'original'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-900/50 border-slate-800 text-slate-404 hover:text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        Asli (Original)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportResolution('hd')}
                        className={`py-1.5 px-2 rounded text-[11px] font-mono font-medium border text-center transition cursor-pointer ${
                          exportResolution === 'hd'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-900/50 border-slate-800 text-slate-404 hover:text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        HD (720p)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportResolution('fhd')}
                        className={`py-1.5 px-2 rounded text-[11px] font-mono font-medium border text-center transition cursor-pointer ${
                          exportResolution === 'fhd'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-900/50 border-slate-800 text-slate-404 hover:text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        Full HD (1080p)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportResolution('2k')}
                        className={`py-1.5 px-2 rounded text-[11px] font-mono font-medium border text-center transition cursor-pointer ${
                          exportResolution === '2k'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-900/50 border-slate-800 text-slate-404 hover:text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        QHD 2K
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportResolution('4k')}
                        className={`col-span-2 py-1.5 px-2 rounded text-[11px] font-mono font-medium border text-center transition cursor-pointer ${
                          exportResolution === '4k'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-900/50 border-slate-800 text-slate-404 hover:text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        🔥 Ultra HD 4K (3840px)
                      </button>
                    </div>
                  </div>

                  {/* Download actions */}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleExportJpg}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/10 cursor-pointer"
                      id="btn-download-jpg"
                    >
                      <Download className="w-4 h-4" />
                      Unduh (.JPG)
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleExportCubeLUT}
                      disabled={!params.neutralColor}
                      className="w-full bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                      id="btn-export-cube-lut"
                      title="Ekspor LUT 3D untuk dimasukkan di Premiere Pro, Lightroom, DaVinci Resolve atau software editing profesional lainnya"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Ekspor LUT (.CUBE)
                    </button>
                  </div>

                  {/* Convenience direct Auto-Apply and Download pipeline */}
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={handleAutoThenDownload}
                      className="w-full py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-750 text-slate-400 hover:text-slate-300 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                      id="btn-auto-download-convenience"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      Auto-Balance ➔ Unduh Langsung
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Footer info system panel */}
        <footer className="mt-12 text-center text-slate-600 text-[11px] flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-900 pt-5 pr-1" id="app-footer">
          <p>© 2026 Remove Color Cast Engine. Diproses sepenuhnya di samping klien Anda untuk menjaga kerahasiaan & keamanan data.</p>
          <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-full border border-slate-900 text-[10px] text-slate-500">
            <Info className="w-3 h-3 text-slate-600" />
            <span>Format output didukung: <strong>JPEG 92% (High-Quality RGB)</strong></span>
          </div>
        </footer>

      </div>
    </div>
  );
}
