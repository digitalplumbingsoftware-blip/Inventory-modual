import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { C } from '../theme';
import { getCustomer } from '../services/api';

const STATUS_COLOR = {
  scheduled: C.blue,
  en_route:  '#f59e0b',
  on_site:   '#10b981',
  completed: C.green,
  cancelled: C.dim,
};

export default function CustomerHistoryScreen({ route, navigation }) {
  const { customerId, customerName, excludeJobId } = route.params || {};
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const c = await getCustomer(customerId);
      setCustomer(c);
    } catch (e) { console.error('customer history', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [customerId]);

  useEffect(() => { if (customerId) load(); }, [customerId, load]);

  if (!customerId) {
    return (
      <View style={styles.center}>
        <Text style={{ color: C.muted }}>No customer selected.</Text>
      </View>
    );
  }

  const jobs = (customer?.jobs || [])
    .filter(j => j && j.id && j.id !== excludeJobId)
    .sort((a, b) => new Date(b.scheduled_start || b.created_at || 0) - new Date(a.scheduled_start || a.created_at || 0));

  const renderItem = ({ item: job }) => {
    const color = STATUS_COLOR[job.status] || C.muted;
    const when = job.scheduled_start || job.created_at;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.push('JobDetail', {
          jobId: job.id,
          customerName: customer?.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : customerName,
        })}
        activeOpacity={0.75}
      >
        <View style={[styles.bar, { backgroundColor: color }]}/>
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.jobNum}>{job.display_number || `Job #${job.job_number || job.id?.slice(0, 8)}`}</Text>
            <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '66' }]}>
              <Text style={[styles.pillText, { color }]}>{(job.status || 'scheduled').replace('_',' ').toUpperCase()}</Text>
            </View>
          </View>
          {when ? <Text style={styles.date}>{dayjs(when).format('MMM D, YYYY [·] h:mm A')}</Text> : null}
          {job.job_type ? <Text style={styles.meta}>{job.job_type}</Text> : null}
          {job.description ? <Text style={styles.desc} numberOfLines={2}>{job.description.split('\n')[0]}</Text> : null}
        </View>
        <Text style={styles.chev}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {customer && (
        <View style={styles.header}>
          <Text style={styles.name}>{customer.first_name} {customer.last_name}</Text>
          {customer.phone ? <Text style={styles.headerMeta}>{customer.phone}</Text> : null}
          <Text style={styles.headerMeta}>{jobs.length} prior job{jobs.length !== 1 ? 's' : ''}</Text>
        </View>
      )}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.green} /></View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={j => String(j.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
              <Text style={{ color: C.muted, fontSize: 14 }}>No prior jobs on file.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  name: { fontSize: 18, fontWeight: '800', color: C.text },
  headerMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  card: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    flexDirection: 'row', overflow: 'hidden',
  },
  bar: { width: 4 },
  body: { flex: 1, padding: 14, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobNum: { fontSize: 14, fontWeight: '700', color: C.text },
  pill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  date: { fontSize: 12, color: C.muted },
  meta: { fontSize: 11, color: C.dim, fontStyle: 'italic' },
  desc: { fontSize: 12, color: C.muted, marginTop: 3 },
  chev: { fontSize: 22, color: C.muted, alignSelf: 'center', paddingRight: 12 },
});
