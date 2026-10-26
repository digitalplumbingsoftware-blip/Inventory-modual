import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import dayjs from 'dayjs';
import { C } from '../theme';
import { getEstimates, createEstimate, combineEstimatesIntoInvoice } from '../services/api';

const STATUS_COLOR = {
  draft:     C.muted,
  sent:      C.blue,
  signed:    C.green,
  converted: C.amber,
  declined:  C.red,
  expired:   C.dim,
};

const FILTERS = [
  { key: 'all',      label: 'All',     status: null       },
  { key: 'draft',    label: 'Draft',   status: 'draft'    },
  { key: 'sent',     label: 'Sent',    status: 'sent'     },
  { key: 'signed',   label: 'Signed',  status: 'signed'   },
  { key: 'converted',label: 'Done',    status: 'converted'},
];

export default function EstimatesScreen({ navigation, route }) {
  const jobId      = route.params?.jobId;
  const jobNumber  = route.params?.jobNumber;
  const customerId = route.params?.customerId;
  const customerName = route.params?.customerName;
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const f = FILTERS.find(x => x.key === filter);
      const params = f?.status ? { status: f.status } : {};
      if (jobId) params.job_id = jobId;
      else if (customerId) params.customer_id = customerId;
      const data = await getEstimates(params);
      setEstimates(Array.isArray(data) ? data : (data.estimates || []));
    } catch(e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, jobId, customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const u = navigation.addListener('focus', () => load()); return u; }, [navigation, load]);

  const renderItem = ({ item: est }) => {
    const color = STATUS_COLOR[est.status] || C.muted;
    const itemCount = est.item_count || (est.items || []).length;
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
          <Text style={styles.meta}>{est.display_number ? `${est.display_number} · ` : ''}{dayjs(est.created_at).format('MMM D, YYYY')}{itemCount ? ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}` : ''}</Text>
          {est.job_address ? <Text style={styles.addr}>{est.job_address}</Text> : null}
          <Text style={styles.total}>${parseFloat(est.total||0).toFixed(2)}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const handleCreateEstimate = async () => {
    try {
      const est = await createEstimate({ job_id: jobId || null, customer_id: customerId || null, status: 'draft' });
      navigation.navigate('EstimateDetail', { estimateId: est.id });
    } catch(e) { console.error(e); }
  };

  // Combine-eligible: 2+ approved/signed estimates on this job, all approved today,
  // none already converted. Same-day check uses signed_at (falls back to updated_at).
  const combinable = useMemo(() => {
    if (!jobId) return [];
    const today = dayjs().format('YYYY-MM-DD');
    const eligible = estimates.filter(e => {
      const okStatus = ['approved','signed'].includes(e.status);
      const notConverted = !e.converted_invoice_id;
      const stamp = e.signed_at || e.updated_at;
      const okDay = stamp ? dayjs(stamp).format('YYYY-MM-DD') === today : false;
      return okStatus && notConverted && okDay;
    });
    return eligible;
  }, [estimates, jobId]);

  const handleCombine = () => {
    if (combinable.length < 2) return;
    const total = combinable.reduce((s, e) => s + parseFloat(e.total || 0), 0);
    Alert.alert(
      `Combine ${combinable.length} estimates?`,
      `All approved today for ${String(jobNumber).startsWith('Job-') ? jobNumber : 'Job #'+jobNumber}. This creates ONE invoice for $${total.toFixed(2)}. The estimates will be marked converted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Combine',
          onPress: async () => {
            try {
              const { invoice } = await combineEstimatesIntoInvoice(combinable.map(e => e.id));
              Alert.alert('✅ Combined', `Created invoice #${invoice.id} totaling $${parseFloat(invoice.total).toFixed(2)}.`,
                [{ text: 'Open Invoice', onPress: () => navigation.replace('InvoiceDetail', { invoiceId: invoice.id }) }]);
              load();
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.error || e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {jobId && (
        <TouchableOpacity onPress={handleCreateEstimate}
          style={{margin:12, marginBottom:4, padding:14, backgroundColor:C.amber+'22', borderWidth:1.5, borderColor:C.amber, borderRadius:12, alignItems:'center'}}>
          <Text style={{color:C.amber, fontWeight:'700', fontSize:14}}>+ New Estimate for {String(jobNumber).startsWith('Job-') ? jobNumber : 'Job #'+jobNumber}</Text>
        </TouchableOpacity>
      )}
      {jobId && combinable.length >= 2 && (
        <TouchableOpacity onPress={handleCombine}
          style={{marginHorizontal:12, marginTop:8, padding:14, backgroundColor:C.green+'22', borderWidth:1.5, borderColor:C.green, borderRadius:12, alignItems:'center'}}>
          <Text style={{color:C.green, fontWeight:'800', fontSize:14}}>
            🧾  Combine {combinable.length} approved estimates into one invoice
          </Text>
          <Text style={{color:C.muted, fontSize:11, marginTop:2}}>
            Total ${combinable.reduce((s, e) => s + parseFloat(e.total || 0), 0).toFixed(2)} · Approved today
          </Text>
        </TouchableOpacity>
      )}
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
  addr: { fontSize: 11, color: C.muted, fontStyle: 'italic' },
  total: { fontSize: 16, fontWeight: '700', color: C.text },
  chevron: { fontSize: 22, color: C.muted, alignSelf: 'center', paddingRight: 12 },
  emptyText: { fontSize: 14, color: C.muted },
});
