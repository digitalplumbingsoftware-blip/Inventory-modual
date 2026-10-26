import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { C } from '../theme';
import api from '../services/api';

const STATUS_COLOR = {
  current:   C.blue,
  unpaid:    C.amber,
  paid:      C.green,
  overdue:   C.red,
  completed: C.purple,
  void:      C.dim,
};

const FILTERS = [
  { key: 'all',      label: 'All',      statuses: null },
  { key: 'draft',    label: 'Draft',    statuses: 'draft' },
  { key: 'sent',     label: 'Sent',     statuses: 'sent' },
  { key: 'approved', label: 'Approved', statuses: 'approved' },
  { key: 'paid',     label: 'Paid',     statuses: 'paid' },
  { key: 'void',     label: 'Void',     statuses: 'void' },
];

export default function InvoicesScreen({ navigation, route }) {
  const jobId       = route.params?.jobId;
  const jobNumber   = route.params?.jobNumber;
  const customerId  = route.params?.customerId;
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const f = FILTERS.find(f => f.key === filter);
      const params = { type: 'invoice' };
      if (f?.statuses) params.status = f.statuses;
      if (jobId) params.job_id = jobId;
      else if (customerId) params.customer_id = customerId;
      const res = await api.get('/api/invoices', { params });
      setInvoices(res.data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, jobId, customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const u = navigation.addListener('focus', () => load()); return u; }, [navigation, load]);

  const renderItem = ({ item: inv }) => {
    const color = STATUS_COLOR[inv.status] || C.muted;
    const amountPaid = parseFloat(inv.amount_paid || 0);
    const total = parseFloat(inv.total || 0);
    const remaining = total - amountPaid;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('InvoiceDetail', { invoice: inv })}
        activeOpacity={0.75}
      >
        <View style={[styles.bar, { backgroundColor: color }]}/>
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.customer}>{inv.customer_name}</Text>
            <View style={[styles.pill, { backgroundColor: color+'22', borderColor: color+'66' }]}>
              <Text style={[styles.pillText, { color }]}>{inv.status?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.meta}>{inv.display_number || `#${inv.invoice_number}`} · {dayjs(inv.created_at).format('MMM D, YYYY')}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.total}>${total.toFixed(2)}</Text>
            {amountPaid > 0 && amountPaid < total && (
              <Text style={styles.remaining}>Remaining: ${remaining.toFixed(2)}</Text>
            )}
            {amountPaid >= total && total > 0 && (
              <Text style={styles.paidFull}>Paid in full</Text>
            )}
          </View>
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
          data={invoices}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green}/>}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🧾</Text>
              <Text style={styles.emptyText}>No {filter} invoices</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg },
  center: { flex:1, justifyContent:'center', alignItems:'center', paddingTop:60 },
  tabs: { flexDirection:'row', padding:10, gap:6, borderBottomWidth:1, borderBottomColor:C.border },
  tab: { flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
  tabActive: { backgroundColor:C.amber+'22', borderColor:C.amber },
  tabText: { fontSize:10, color:C.muted, fontWeight:'500' },
  tabTextActive: { color:C.amber, fontWeight:'700' },
  card: { backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.border, flexDirection:'row', overflow:'hidden' },
  bar: { width:4 },
  body: { flex:1, padding:14, gap:5 },
  row: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  customer: { fontSize:15, fontWeight:'700', color:C.text, flex:1 },
  pill: { borderWidth:1, borderRadius:4, paddingHorizontal:8, paddingVertical:2 },
  pillText: { fontSize:9, fontWeight:'700', letterSpacing:0.5 },
  meta: { fontSize:12, color:C.muted },
  amountRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  total: { fontSize:18, fontWeight:'800', color:C.text },
  remaining: { fontSize:12, color:C.amber, fontWeight:'600' },
  paidFull: { fontSize:12, color:C.green, fontWeight:'600' },
  chevron: { fontSize:22, color:C.muted, alignSelf:'center', paddingRight:12 },
  emptyText: { fontSize:14, color:C.muted },
});
