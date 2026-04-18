import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { C } from '../theme';
import api from '../services/api';

const STATUS_COLOR = {
  draft:    C.muted,
  sent:     C.blue,
  approved: C.green,
  void:     C.dim,
};

const FILTERS = [
  { key: 'all',      label: 'All',      statuses: null },
  { key: 'draft',    label: 'Draft',    statuses: 'draft' },
  { key: 'sent',     label: 'Sent',     statuses: 'sent' },
  { key: 'approved', label: 'Approved', statuses: 'approved' },
];

export default function EstimatesScreen({ navigation }) {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { type: 'estimate' };
      const f = FILTERS.find(f => f.key === filter);
      if (f?.statuses) params.status = f.statuses;
      const res = await api.get('/api/invoices', { params });
      setEstimates(res.data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const u = navigation.addListener('focus', () => load()); return u; }, [navigation, load]);

  const renderItem = ({ item: est }) => {
    const color = STATUS_COLOR[est.status] || C.muted;
    const hasOptions = est.options && est.options.length > 0;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('EstimateDetail', { estimateId: est.id })}
        activeOpacity={0.75}
      >
        <View style={[styles.bar, { backgroundColor: color }]}/>
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.customer}>{est.customer_name}</Text>
            <View style={[styles.pill, { backgroundColor: color+'22', borderColor: color+'66' }]}>
              <Text style={[styles.pillText, { color }]}>{est.status?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.meta}>#{est.invoice_number} · {dayjs(est.created_at).format('MMM D, YYYY')}</Text>
          {hasOptions && (
            <View style={styles.optionsRow}>
              {est.options.sort((a,b)=>a.sort_order-b.sort_order).map(o => (
                <View key={o.id} style={[styles.optionTag, o.selected && styles.optionTagSelected]}>
                  <Text style={[styles.optionTagText, o.selected && styles.optionTagTextSelected]}>{o.label}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.total}>${parseFloat(est.total||0).toFixed(2)}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)}
            style={[styles.tab, filter===f.key && styles.tabActive]}>
            <Text style={[styles.tabText, filter===f.key && styles.tabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={C.green} size="large"/></View> : (
        <FlatList
          data={estimates}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green}/>}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>📄</Text>
              <Text style={styles.emptyText}>No estimates found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  tabs: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabActive: { backgroundColor: C.green+'22', borderColor: C.green },
  tabText: { fontSize: 12, color: C.muted, fontWeight: '500' },
  tabTextActive: { color: C.green, fontWeight: '700' },
  card: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, flexDirection: 'row', overflow: 'hidden' },
  bar: { width: 4 },
  body: { flex: 1, padding: 14, gap: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  pill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  meta: { fontSize: 12, color: C.muted },
  optionsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  optionTag: { borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3 },
  optionTagSelected: { backgroundColor: C.green+'22', borderColor: C.green },
  optionTagText: { fontSize: 11, color: C.muted, fontWeight: '600' },
  optionTagTextSelected: { color: C.green },
  total: { fontSize: 16, fontWeight: '700', color: C.text },
  chevron: { fontSize: 22, color: C.muted, alignSelf: 'center', paddingRight: 12 },
  emptyText: { fontSize: 14, color: C.muted },
});
