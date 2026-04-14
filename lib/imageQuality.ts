import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { ImagePickerAsset } from 'expo-image-picker';

export interface QualityResult {
  score: number;       // 0–100
  level: 'good' | 'acceptable' | 'poor';
  issues: string[];
  passed: boolean;
}

/**
 * Evalúa la calidad de una imagen usando tres técnicas:
 * 1. Resolución mínima para leer texto
 * 2. Detección de desenfoque: redimensiona la imagen a 400px y mide el
 *    tamaño del JPEG resultante. Una imagen nítida con texto tiene muchos
 *    bordes de alta frecuencia → el JPEG comprime menos → archivo más grande.
 *    Una imagen borrosa tiene píxeles mezclados → comprime más → archivo pequeño.
 * 3. ISO del EXIF (indica poca luz / ruido)
 */
export async function analyzeImageQuality(asset: ImagePickerAsset): Promise<QualityResult> {
  const issues: string[] = [];
  let score = 100;

  // ── 1. Resolución mínima ───────────────────────────────────────────────────
  const minDimension = Math.min(asset.width, asset.height);
  if (minDimension < 720) {
    issues.push('Resolución muy baja — acércate más');
    score -= 35;
  } else if (minDimension < 1000) {
    issues.push('Resolución baja — intenta acercarte un poco más');
    score -= 15;
  }

  // ── 2. Detección de desenfoque (resize + compress) ────────────────────────
  // Técnica: una imagen nítida con texto produce un JPEG más grande que una
  // borrosa al mismo tamaño, porque los bordes nítidos resisten la compresión.
  try {
    const resized = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 400 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    const info = await FileSystem.getInfoAsync(resized.uri, { size: true });
    if (info.exists && 'size' in info && info.size !== undefined) {
      const kb = info.size / 1024;
      if (kb < 10) {
        issues.push('Imagen muy borrosa — mantén el celular firme y con buena luz');
        score -= 45;
      } else if (kb < 18) {
        issues.push('Imagen algo borrosa — intenta con mejor iluminación o sin movimiento');
        score -= 20;
      }
    }
  } catch {
    // Si falla el análisis de desenfoque, no penalizar
  }

  // ── 3. EXIF: ISO alto indica poca luz / imagen ruidosa ────────────────────
  if (asset.exif) {
    const iso = asset.exif['ISOSpeedRatings'] ?? asset.exif['PhotographicSensitivity'];
    if (iso && iso > 3200) {
      issues.push('Muy poca iluminación — busca mejor luz');
      score -= 15;
    } else if (iso && iso > 1600) {
      issues.push('Poca iluminación — agrega más luz si puedes');
      score -= 8;
    }
  }

  const finalScore = Math.max(0, score);
  const level = finalScore >= 70 ? 'good' : finalScore >= 45 ? 'acceptable' : 'poor';

  return {
    score: finalScore,
    level,
    issues,
    passed: finalScore >= 45,
  };
}

export function qualityColor(level: QualityResult['level']): string {
  switch (level) {
    case 'good':       return '#22c55e';  // verde
    case 'acceptable': return '#f59e0b';  // amarillo
    case 'poor':       return '#ef4444';  // rojo
  }
}
