import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ReceiptCard } from '../../components/ReceiptCard';
import type { Database } from '../../lib/supabase';

type Receipt = Database['public']['Tables']['receipts']['Row'];

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReceipts = useCallback(async () => {
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', 'No se pudieron cargar los recibos.');
    } else {
      setReceipts(data ?? []);
    }
  }, []);

  useEffect(() => {
    fetchReceipts().finally(() => setLoading(false));

    // Suscripción en tiempo real: actualiza la lista cuando un recibo
    // termina de procesarse (status cambia a 'done')
    const channel = supabase
      .channel('receipts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        () => { fetchReceipts(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchReceipts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReceipts();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Eliminar recibo', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const receipt = receipts.find(r => r.id === id);
          if (receipt?.image_url) {
            // Extraer path relativo del storage
            const path = receipt.image_url.split('/storage/v1/object/public/receipts/')[1];
            if (path) await supabase.storage.from('receipts').remove([path]);
          }
          await supabase.from('receipts').delete().eq('id', id);
          setReceipts(prev => prev.filter(r => r.id !== id));
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Deseas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola 👋</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>
        {receipts.length} {receipts.length === 1 ? 'recibo guardado' : 'recibos guardados'}
      </Text>

      <FlatList
        data={receipts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ReceiptCard
            receipt={item}
            onPress={() => router.push(`/(app)/receipt/${item.id}`)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={receipts.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyTitle}>Sin recibos todavía</Text>
            <Text style={styles.emptySubtitle}>
              Toca <Text style={{ fontWeight: '700' }}>Escanear</Text> para fotografiar tu primer recibo
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  greeting: { fontSize: 20, fontWeight: '700', color: '#111827' },
  email: { fontSize: 13, color: '#6b7280', maxWidth: 220 },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  logoutText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  sectionTitle: {
    fontSize: 13,
    color: '#6b7280',
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontWeight: '500',
  },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyContainer: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
});
