import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ReceiptCard } from '../../components/ReceiptCard';
import type { Database } from '../../lib/supabase';

type Receipt = Database['public']['Tables']['receipts']['Row'];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const term = query.trim();
    if (!term) return;

    setLoading(true);
    setSearched(true);

    // Búsqueda full-text en PostgreSQL usando tsvector (columna search_vector)
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .textSearch('search_vector', term, {
        type: 'websearch',
        config: 'spanish',
      })
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      // Fallback a ILIKE si el full-text falla (ej. columna aún no indexada)
      const { data: fallback } = await supabase
        .from('receipts')
        .select('*')
        .ilike('extracted_text', `%${term}%`)
        .order('created_at', { ascending: false });
      setResults(fallback ?? []);
    } else {
      setResults(data ?? []);
    }
  }, [query]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Buscar en recibos</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="Ej: escoba, farmacia, total..."
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.searchBtn, !query.trim() && styles.searchBtnDisabled]}
            onPress={handleSearch}
            disabled={!query.trim()}
          >
            <Text style={styles.searchBtnText}>Buscar</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Busca cualquier palabra que aparezca en el texto de tus recibos
        </Text>
      </View>

      {/* Resultados */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Buscando...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ReceiptCard
              receipt={item}
              onPress={() => router.push(`/(app)/receipt/${item.id}`)}
              highlightQuery={query}
            />
          )}
          contentContainerStyle={results.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            searched ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>Sin resultados</Text>
                <Text style={styles.emptySubtitle}>
                  No se encontraron recibos con "{query}".{'\n'}
                  Verifica que el recibo esté procesado (estado: listo).
                </Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>Busca en tus recibos</Text>
                <Text style={styles.emptySubtitle}>
                  Escribe cualquier palabra que recuerdes haber visto en un recibo
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnDisabled: { backgroundColor: '#93c5fd' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#6b7280', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  emptyContainer: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 56, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
});
