import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { analyzeImageQuality, qualityColor } from '../../lib/imageQuality';
import type { QualityResult } from '../../lib/imageQuality';

type Step = 'idle' | 'analyzing' | 'reviewing' | 'uploading' | 'done';

export default function CameraScreen() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('idle');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityResult | null>(null);
  const [progress, setProgress] = useState('');

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permiso denegado',
        'Necesitamos acceso a tu cámara para escanear recibos. Actívalo en Configuración.'
      );
      return;
    }

    // Abre la CÁMARA NATIVA del celular con máxima calidad
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 1,           // Calidad máxima (sin compresión)
      exif: true,           // Incluir datos EXIF para análisis de calidad
      allowsEditing: false, // Sin recorte para conservar la imagen completa
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setStep('analyzing');

    const qualityResult = await analyzeImageQuality(asset);
    setQuality(qualityResult);
    setStep('reviewing');
  };

  const retakePhoto = () => {
    setPhotoUri(null);
    setQuality(null);
    setStep('idle');
  };

  const uploadReceipt = async () => {
    if (!photoUri || !user) return;

    setStep('uploading');

    try {
      // 1. Leer imagen como base64
      setProgress('Preparando imagen...');
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const contentType = 'image/jpeg';
      const filename = `${user.id}/${Date.now()}.jpg`;

      // 2. Subir al Storage de Supabase
      setProgress('Subiendo imagen...');
      const { data: storageData, error: storageError } = await supabase.storage
        .from('receipts')
        .upload(filename, decode(base64), { contentType, upsert: false });

      if (storageError) throw storageError;

      // 3. Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(storageData.path);

      // 4. Crear registro en la base de datos
      setProgress('Guardando registro...');
      const { data: receipt, error: dbError } = await supabase
        .from('receipts')
        .insert({
          user_id: user.id,
          image_url: publicUrl,
          quality_score: quality?.score ?? null,
          quality_issues: quality?.issues ?? [],
          status: 'processing',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // 5. Comprimir imagen para OCR (< 1 MB requerido por OCR.space free)
      setProgress('Preparando OCR...');
      const compressed = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1000 } }],
        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG }
      );
      const ocrBase64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 6. Invocar Edge Function para OCR
      setProgress('Extrayendo texto...');
      await supabase.functions.invoke('process-receipt', {
        body: { receiptId: receipt.id, imageUrl: publicUrl, ocrBase64 },
      });

      setStep('done');
      setProgress('');
    } catch (err: any) {
      setStep('reviewing');
      setProgress('');
      Alert.alert('Error al subir', err.message ?? 'Inténtalo nuevamente.');
    }
  };

  // ── Pantalla: idle ──────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.idleContent}>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.title}>Escanear recibo</Text>
          <Text style={styles.subtitle}>
            Abre la cámara de tu celular para fotografiar un recibo, boleta o factura
          </Text>

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Consejos para mejor resultado:</Text>
            {[
              '☀️  Asegúrate de tener buena iluminación',
              '📐  El recibo debe estar plano y recto',
              '🔍  Encuadra todo el contenido del recibo',
              '✋  Mantén el celular quieto al tomar la foto',
            ].map((tip, i) => (
              <Text key={i} style={styles.tip}>{tip}</Text>
            ))}
          </View>

          <TouchableOpacity style={styles.cameraButton} onPress={openCamera}>
            <Text style={styles.cameraButtonText}>Abrir cámara</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Pantalla: analyzing ────────────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <View style={styles.container}>
        <View style={styles.idleContent}>
          {photoUri && (
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: 220, borderRadius: 12, marginBottom: 24 }} resizeMode="contain" />
          )}
          <ActivityIndicator size="large" color="#2563eb" style={{ marginBottom: 16 }} />
          <Text style={styles.title}>Analizando calidad...</Text>
          <Text style={styles.subtitle}>Detectando nitidez e iluminación</Text>
        </View>
      </View>
    );
  }

  // ── Pantalla: reviewing ─────────────────────────────────────────────────────
  if (step === 'reviewing' && photoUri && quality) {
    const color = qualityColor(quality.level);
    const label = quality.level === 'good' ? 'Buena calidad ✓' : quality.level === 'acceptable' ? 'Calidad aceptable' : 'Calidad baja ✗';

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
        <Text style={styles.title}>Revisar foto</Text>

        {/* Preview */}
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />

        {/* Badge de calidad */}
        <View style={[styles.qualityBadge, { backgroundColor: color + '20', borderColor: color }]}>
          <Text style={[styles.qualityLabel, { color }]}>{label}</Text>
          <Text style={[styles.qualityScore, { color }]}>Puntuación: {quality.score}/100</Text>
        </View>

        {/* Problemas encontrados */}
        {quality.issues.length > 0 && (
          <View style={styles.issuesBox}>
            <Text style={styles.issuesTitle}>Observaciones:</Text>
            {quality.issues.map((issue, i) => (
              <Text key={i} style={styles.issue}>⚠️  {issue}</Text>
            ))}
          </View>
        )}

        {/* Aviso si calidad es muy baja */}
        {!quality.passed && (
          <Text style={styles.warningText}>
            La calidad es baja. Recomendamos retomar la foto para mejor extracción de texto.
          </Text>
        )}

        {/* Acciones */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
            <Text style={styles.retakeText}>Retomar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmButton} onPress={uploadReceipt}>
            <Text style={styles.confirmText}>
              {quality.passed ? 'Guardar recibo' : 'Guardar de todas formas'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Pantalla: uploading ─────────────────────────────────────────────────────
  if (step === 'uploading') {
    return (
      <View style={styles.container}>
        <View style={styles.idleContent}>
          <ActivityIndicator size="large" color="#2563eb" style={{ marginBottom: 20 }} />
          <Text style={styles.title}>Procesando recibo</Text>
          <Text style={styles.subtitle}>{progress}</Text>
        </View>
      </View>
    );
  }

  // ── Pantalla: done ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.idleContent}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>✅</Text>
        <Text style={styles.title}>¡Recibo guardado!</Text>
        <Text style={styles.subtitle}>
          El texto se está extrayendo en segundo plano. Aparecerá en "Mis Recibos" en segundos.
        </Text>
        <TouchableOpacity style={styles.cameraButton} onPress={() => setStep('idle')}>
          <Text style={styles.cameraButtonText}>Escanear otro recibo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Convierte base64 a Uint8Array para subirlo al Storage de Supabase */
function decode(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const bufferLength = base64.length * 0.75 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(bufferLength);
  let p = 0;

  for (let i = 0; i < base64.length; i += 4) {
    const e1 = lookup[base64.charCodeAt(i)];
    const e2 = lookup[base64.charCodeAt(i + 1)];
    const e3 = lookup[base64.charCodeAt(i + 2)];
    const e4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  idleContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 60,
  },
  reviewContent: {
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  icon: { fontSize: 72, marginBottom: 20 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  tipsCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 10,
  },
  tip: { fontSize: 13, color: '#374151', marginBottom: 6, lineHeight: 20 },
  cameraButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  cameraButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  preview: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  qualityBadge: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  qualityLabel: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  qualityScore: { fontSize: 13 },
  issuesBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 12,
  },
  issuesTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 6 },
  issue: { fontSize: 13, color: '#374151', marginBottom: 4 },
  warningText: {
    fontSize: 13,
    color: '#b91c1c',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
    marginBottom: 20,
  },
  retakeButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  retakeText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  confirmButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
