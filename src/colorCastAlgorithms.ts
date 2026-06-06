import { RGB, CorrectionParams } from './types';

// ======== UTIL: sRGB <-> Linear ========
export function srgbToLinear(u: number): number { // u in [0..1]
  return (u <= 0.04045) ? (u / 12.92) : Math.pow((u + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number { // v in [0..1]
  return (v <= 0.0031308) ? (12.92 * v) : (1.055 * Math.pow(v, 1 / 2.4) - 0.055);
}

// ======== Dapatkan gain WB dari netral (0..255) di ruang linear ========
export function wbGainsFromNeutralRGB(neutral: RGB) {
  const rS = neutral.r / 255;
  const gS = neutral.g / 255;
  const bS = neutral.b / 255;

  const rL = srgbToLinear(rS);
  const gL = srgbToLinear(gS);
  const bL = srgbToLinear(bS);

  const avg = (rL + gL + bL) / 3 || 1e-6; // target abu2 di linear
  const gR = avg / (rL || 1e-6);
  const gG = avg / (gL || 1e-6);
  const gB = avg / (bL || 1e-6);

  return { gR, gG, gB };
}

// ======== Generator .cube yang kompatibel Photoshop ========
export function generateCubeLUT_fromWB(gR: number, gG: number, gB: number, size = 33): string {
  const lines: string[] = [];
  lines.push('TITLE "Eyedropper White Balance"');
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push('DOMAIN_MIN 0.0 0.0 0.0');
  lines.push('DOMAIN_MAX 1.0 1.0 1.0');

  // Urutan: B (outer) -> G (middle) -> R (inner). R berubah paling cepat.
  for (let b = 0; b < size; b++) {
    const bb_s = b / (size - 1);
    const bb_L = srgbToLinear(bb_s);
    for (let g = 0; g < size; g++) {
      const gg_s = g / (size - 1);
      const gg_L = srgbToLinear(gg_s);
      for (let r = 0; r < size; r++) {
        const rr_s = r / (size - 1);
        const rr_L = srgbToLinear(rr_s);

        // Terapkan WB di linear
        let Rlin = rr_L * gR;
        let Glin = gg_L * gG;
        let Blin = bb_L * gB;

        // Clamp linear ke [0,1]
        Rlin = Math.min(1, Math.max(0, Rlin));
        Glin = Math.min(1, Math.max(0, Glin));
        Blin = Math.min(1, Math.max(0, Blin));

        // Kembali ke sRGB
        const Rsrgb = Math.min(1, Math.max(0, linearToSrgb(Rlin)));
        const Gsrgb = Math.min(1, Math.max(0, linearToSrgb(Glin)));
        const Bsrgb = Math.min(1, Math.max(0, linearToSrgb(Blin)));

        lines.push(
          `${Rsrgb.toFixed(6)} ${Gsrgb.toFixed(6)} ${Bsrgb.toFixed(6)}`
        );
      }
    }
  }
  return lines.join('\n') + '\n'; // pastikan newline terakhir
}

// Clamp utility
export function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// Hitung Gain Gray-World
export function getGrayWorldGains(imageData: ImageData): { r: number; g: number; b: number } {
  const src = imageData.data;
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let i = 0; i < src.length; i += 4) {
    sumR += src[i];
    sumG += src[i + 1];
    sumB += src[i + 2];
    count++;
  }
  const avgR = sumR / count || 1;
  const avgG = sumG / count || 1;
  const avgB = sumB / count || 1;
  const target = (avgR + avgG + avgB) / 3;

  return {
    r: target / avgR,
    g: target / avgG,
    b: target / avgB
  };
}

// Hitung Gain White-Patch
export function getWhitePatchGains(imageData: ImageData): { r: number; g: number; b: number } {
  const src = imageData.data;
  let maxR = 1, maxG = 1, maxB = 1;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i] > maxR) maxR = src[i];
    if (src[i + 1] > maxG) maxG = src[i + 1];
    if (src[i + 2] > maxB) maxB = src[i + 2];
  }
  return {
    r: 255 / maxR,
    g: 255 / maxG,
    b: 255 / maxB
  };
}

// Hitung Gain dari Warna Netral (Gains non-linier sederhana seperti di index.html)
export function getEyedropperGains(neutralColor: RGB): { r: number; g: number; b: number } {
  const avgNeutral = (neutralColor.r + neutralColor.g + neutralColor.b) / 3;
  return {
    r: avgNeutral / (neutralColor.r || 1),
    g: avgNeutral / (neutralColor.g || 1),
    b: avgNeutral / (neutralColor.b || 1)
  };
}

export function applyLevelsToChannel(v: number, shadows: number, midtones: number, highlights: number): number {
  const range = highlights - shadows;
  if (range <= 0) return 0;
  const normalized = Math.max(0, Math.min(1, (v - shadows) / range));
  // Apply math.pow for midtones gamma correction
  const withGamma = Math.pow(normalized, 1 / (midtones || 1e-6));
  return clamp(withGamma * 255);
}

// Hitung histogram luminance (abu-abu) untuk visualisasi kurva levels
export function computeLuminanceHistogram(imageData: ImageData): number[] {
  const src = imageData.data;
  const len = src.length;
  const hist = new Array(256).fill(0);
  
  // To protect CPU on oversized images, we subsample based on canvas size
  const step = len > 300000 ? 4 : 1;
  const stepBytes = 4 * step;
  
  for (let i = 0; i < len; i += stepBytes) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    
    // Standard photographic relative luminance
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hist[Math.max(0, Math.min(255, lum))]++;
  }
  return hist;
}

// Terapkan semua parameter (Color Cast + Levels + Brightness/Contrast) ke data pixel
export function applyCorrections(
  originalData: ImageData,
  params: CorrectionParams
): ImageData {
  const { method, neutralColor, strength, shadows, midtones, highlights, brightness, contrast } = params;
  const src = originalData.data;
  const len = src.length;
  const out = new Uint8ClampedArray(len);

  // 1. Tentukan gain adjustment
  let gainR = 1;
  let gainG = 1;
  let gainB = 1;

  if (method === 'grayworld') {
    const gw = getGrayWorldGains(originalData);
    gainR = gw.r;
    gainG = gw.g;
    gainB = gw.b;
  } else if (method === 'whitepatch') {
    const wp = getWhitePatchGains(originalData);
    gainR = wp.r;
    gainG = wp.g;
    gainB = wp.b;
  } else if (method === 'eyedropper' && neutralColor) {
    const ed = getEyedropperGains(neutralColor);
    gainR = ed.r;
    gainG = ed.g;
    gainB = ed.b;
  }

  // 2. Hitung faktor kontras jika contrast !== 0
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    const ri = src[i];
    const gi = src[i + 1];
    const bi = src[i + 2];
    const ai = src[i + 3];

    // Terapkan gain color balance
    const cb_r = clamp(ri * gainR);
    const cb_g = clamp(gi * gainG);
    const cb_b = clamp(bi * gainB);

    // Campur dengan gambar asli berdasarkan strength slider
    let r = ri * (1 - strength) + cb_r * strength;
    let g = gi * (1 - strength) + cb_g * strength;
    let b = bi * (1 - strength) + cb_b * strength;

    // Terapkan Levels adjustments (Shadows, Midtones, Highlights)
    if (shadows !== 0 || midtones !== 1.0 || highlights !== 255) {
      r = applyLevelsToChannel(r, shadows, midtones, highlights);
      g = applyLevelsToChannel(g, shadows, midtones, highlights);
      b = applyLevelsToChannel(b, shadows, midtones, highlights);
    }

    // Terapkan Brightness & Contrast
    if (brightness !== 0 || contrast !== 0) {
      r = clamp(factor * (r - 128) + 128 + brightness);
      g = clamp(factor * (g - 128) + 128 + brightness);
      b = clamp(factor * (b - 128) + 128 + brightness);
    }

    out[i] = Math.round(r);
    out[i + 1] = Math.round(g);
    out[i + 2] = Math.round(b);
    out[i + 3] = ai;
  }

  return new ImageData(out, originalData.width, originalData.height);
}
