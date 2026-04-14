import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { qualityColor } from '../../../lib/imageQuality';
import { ZoomableImage } from '../../../components/ZoomableImage';
import type { Database } from '../../../lib/supabase';

type Receipt = Database['public']['Tables']['receipts']['Row'];

const PROCESSING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomVisible, setZoomVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('receipts')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          Alert.alert('Error', 'No se pudo cargar el recibo.');
          router.back();
        } else {
          setReceipt(data);
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!receipt) return null;

  const date = new Date(receipt.created_at).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const statusLabel: Record<string, string> = {
    processing: '⏳ Procesando...',
    done: '✅ Texto extraído',
    failed: '❌ Error en extracción',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Botón volver */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Volver</Text>
      </TouchableOpacity>

      {/* Imagen — toca para ampliar */}
      <TouchableOpacity onPress={() => setZoomVisible(true)} activeOpacity={0.9}>
        <Image source={{ uri: receipt.image_url }} style={styles.image} resizeMode="contain" />
        <Text style={styles.zoomHint}>🔍 Toca para ampliar</Text>
      </TouchableOpacity>

      {/* Modal de zoom */}
      <Modal visible={zoomVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBg}>
          <ZoomableImage uri={receipt.image_url} />
          <TouchableOpacity style={styles.closeBtn} onPress={() => setZoomVisible(false)}>
            <Text style={styles.closeBtnText}>✕ Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Meta */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Información</Text>
        <Row label="Fecha" value={date} />
        <Row label="Estado" value={statusLabel[receipt.status] ?? receipt.status} />

        {receipt.quality_score !== null && (
          <Row
            label="Calidad"
            value={`${receipt.quality_score}/100`}
            valueColor={qualityColor(
              receipt.quality_score >= 70 ? 'good' :
              receipt.quality_score >= 45 ? 'acceptable' : 'poor'
            )}
          />
        )}

        {receipt.quality_issues && receipt.quality_issues.length > 0 && (
          <View style={styles.issuesRow}>
            <Text style={styles.rowLabel}>Observaciones</Text>
            {receipt.quality_issues.map((issue, i) => (
              <Text key={i} style={styles.issue}>⚠️  {issue}</Text>
            ))}
          </View>
        )}
      </View>

      {/* Texto extraído */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Texto extraído</Text>
        {receipt.status === 'processing' ? (
          <View>
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.processingText}>Extrayendo texto...</Text>
            </View>
            {Date.now() - new Date(receipt.created_at).getTime() > PROCESSING_TIMEOUT_MS && (
              <View style={styles.timeoutBox}>
                <Text style={styles.timeoutText}>
                  ⚠️ Esto está tardando más de lo esperado. Puede que la extracción haya fallado silenciosamente.{' '}
                  Verifica los logs en Supabase → Edge Functions → process-receipt.
                </Text>
              </View>
            )}
          </View>
        ) : receipt.status === 'failed' ? (
          <Text style={styles.failText}>No se pudo extraer el texto. Intenta con una foto de mejor calidad.</Text>
        ) : (
          <Text style={styles.extractedText} selectable>
            {receipt.extracted_text ?? 'Sin texto extraído'}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor, fontWeight: '700' } : {}]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  zoomHint: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  modalBg: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  timeoutBox: {
    marginTop: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  timeoutText: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500', flex: 1 },
  rowValue: { fontSize: 13, color: '#111827', flex: 2, textAlign: 'right' },
  issuesRow: { paddingVertical: 6 },
  issue: { fontSize: 13, color: '#374151', marginTop: 4 },
  extractedText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    fontFamily: 'monospace',
  },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processingText: { fontSize: 13, color: '#6b7280' },
  failText: { fontSize: 14, color: '#dc2626' },
});
