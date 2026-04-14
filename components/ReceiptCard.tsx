import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native';
import type { Database } from '../lib/supabase';

type Receipt = Database['public']['Tables']['receipts']['Row'];

interface ReceiptCardProps {
  receipt: Receipt;
  onPress: () => void;
  onDelete?: () => void;
  highlightQuery?: string;
}

export function ReceiptCard({ receipt, onPress, onDelete, highlightQuery }: ReceiptCardProps) {
  const date = new Date(receipt.created_at).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const statusConfig = {
    processing: { label: 'Procesando...', color: '#f59e0b', bg: '#fffbeb' },
    done:       { label: 'Listo',         color: '#22c55e', bg: '#f0fdf4' },
    failed:     { label: 'Error OCR',     color: '#ef4444', bg: '#fef2f2' },
  };
  const status = statusConfig[receipt.status as keyof typeof statusConfig] ?? statusConfig.processing;

  // Muestra un fragmento del texto extraído, resaltando la búsqueda si existe
  const previewText = receipt.extracted_text
    ? getPreview(receipt.extracted_text, highlightQuery)
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        {/* Thumbnail */}
        <Image
          source={{ uri: receipt.image_url }}
          style={styles.thumbnail}
          resizeMode="cover"
        />

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.topRow}>
            <Text style={styles.date}>{date}</Text>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>

          {previewText ? (
            <Text style={styles.preview} numberOfLines={2}>
              {previewText}
            </Text>
          ) : receipt.status === 'processing' ? (
            <Text style={styles.placeholderText}>Extrayendo texto...</Text>
          ) : (
            <Text style={styles.placeholderText}>Sin texto disponible</Text>
          )}

          {receipt.quality_score !== null && (
            <Text style={styles.quality}>
              Calidad: {receipt.quality_score}/100
            </Text>
          )}

          {receipt.parsed_amount !== null && (
            <Text style={styles.amount}>
              $ {receipt.parsed_amount.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          )}
        </View>

        {/* Eliminar */}
        {onDelete && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteIcon}>🗑</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Devuelve un fragmento del texto centrado alrededor de la búsqueda,
 * o las primeras líneas si no hay búsqueda.
 */
function getPreview(text: string, query?: string): string {
  const clean = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!query) return clean.slice(0, 120);

  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, 120);

  const start = Math.max(0, idx - 40);
  const end = Math.min(clean.length, idx + query.length + 60);
  const snippet = (start > 0 ? '...' : '') + clean.slice(start, end) + (end < clean.length ? '...' : '');
  return snippet;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    flexShrink: 0,
  },
  info: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  date: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  preview: { fontSize: 13, color: '#374151', lineHeight: 18 },
  placeholderText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  quality: { fontSize: 11, color: '#9ca3af', marginTop: 5 },
  amount: { fontSize: 14, color: '#16a34a', fontWeight: '700', marginTop: 4 },
  deleteBtn: { paddingLeft: 4 },
  deleteIcon: { fontSize: 16 },
});
