export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface CorrectionParams {
  method: 'eyedropper' | 'whitepatch' | 'grayworld' | 'none';
  neutralColor: RGB | null;
  strength: number; // 0 to 1
  shadows: number; // 0 to 253, default 0
  midtones: number; // 0.1 to 9.9, default 1.0 (gamma)
  highlights: number; // 2 to 255, default 255
  brightness: number; // -100 to 100, default 0
  contrast: number; // -105 to 100, default 0
}

export interface Preset {
  id: string;
  name: string;
  neutralColor: RGB;
  createdAt: string;
}

export interface ComparisonItem {
  id: string;
  timestamp: string;
  name: string;
  neutralColor: RGB | null;
  method: 'eyedropper' | 'whitepatch' | 'grayworld' | 'none';
  strength: number;
  shadows: number;
  midtones: number;
  highlights: number;
  brightness: number;
  contrast: number;
  previewUrl: string; // HIGH quality or standard data url
  // Store canvas dimensions so we can restore perfectly or download
}
