import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { C, STATUS } from '../theme';
import { getMyJobs } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function JobsScreen({ navigation }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('today'); // today | upcoming | all

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const date = filter === 'today' ? dayjs().format('YYYY-MM-DD') : undefined;
      const all = await getMyJobs(date);
      // Filter to this technician's jobs
      const mine = all.filter(j => j.technician_id === user?.id);
      setJobs(mine);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, user]);

  useEffect(() => { load(); }, [load]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation, load]);

  const renderJob = ({ item: job }) => {
    const s = STATUS[job.status] || STATUS.scheduled;
    const start = job.scheduled_start ? dayjs(job.scheduled_start).format('h:mm A') : null;
    const end   = job.scheduled_end   ? dayjs(job.scheduled_end).format('h:mm A')   : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
        activeOpacity={0.75}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.statusBar, { backgroundColor: s.color }]} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.customerName}>{job.customer_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: s.color+'22', borderColor: s.color+'66' }]}>
              <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
            </View>
          </View>
          <Text style={styles.jobType}>{job.job_type || 'Service Call'}</Text>
          {job.address && <Text style={styles.address} numberOfLines={1}>📍 {job.address}</Text>}
          {(start || end) && (
            <Text style={styles.time}>🕐 {start}{end ? ` – ${end}` : ''}</Text>
          )}
        </View>
        <View style={styles.cardChevron}>
          <Text style={{color: C.muted, fontSize:18}}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const filters = [
    { key:'today',    label:"Today" },
    { key:'upcoming', label:"Upcoming" },
    { key:'all',      label:"All" },
  ];

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterTab, filter===f.key && styles.filterTabActive]}
          >
            <Text style={[styles.filterText, filter===f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        {[
          { label:'Total',     val: jobs.length,                                     color: C.muted  },
          { label:'En Route',  val: jobs.filter(j=>j.status==='en_route').length,   color: C.blue   },
          { label:'On Site',   val: jobs.filter(j=>j.status==='on_site').length,    color: C.amber  },
          { label:'Done',      val: jobs.filter(j=>j.status==='completed').length,  color: C.green  },
        ].map(s => (
          <View key={s.label} style={styles.summaryItem}>
            <Text style={[styles.summaryVal, {color: s.color}]}>{s.val}</Text>
            <Text style={styles.summaryLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.green} size="large"/>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={j => j.id}
          renderItem={renderJob}
          contentContainerStyle={{padding:16, gap:10}}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={C.green}/>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No jobs for {filter === 'today' ? 'today' : 'this period'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg },
  center: { flex:1, justifyContent:'center', alignItems:'center' },
  filterRow: { flexDirection:'row', padding:12, gap:8, borderBottomWidth:1, borderBottomColor:C.border },
  filterTab: { flex:1, paddingVertical:8, borderRadius:8, alignItems:'center', backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
  filterTabActive: { backgroundColor:C.amber+'22', borderColor:C.amber },
  filterText: { fontSize:13, color:C.muted, fontWeight:'500' },
  filterTextActive: { color:C.amber, fontWeight:'700' },
  summary: { flexDirection:'row', padding:16, gap:0, borderBottomWidth:1, borderBottomColor:C.border },
  summaryItem: { flex:1, alignItems:'center' },
  summaryVal: { fontSize:22, fontWeight:'700' },
  summaryLabel: { fontSize:10, color:C.muted, marginTop:2 },
  card: { backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.border, flexDirection:'row', overflow:'hidden' },
  cardLeft: { width:4 },
  statusBar: { flex:1 },
  cardBody: { flex:1, padding:14, gap:4 },
  cardRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  customerName: { fontSize:15, fontWeight:'700', color:C.text, flex:1 },
  statusPill: { borderWidth:1, borderRadius:4, paddingHorizontal:8, paddingVertical:2 },
  statusText: { fontSize:9, fontWeight:'700', letterSpacing:0.5 },
  jobType: { fontSize:13, color:C.muted },
  address: { fontSize:12, color:C.dim, marginTop:2 },
  time: { fontSize:12, color:C.muted, marginTop:2 },
  cardChevron: { justifyContent:'center', paddingRight:12 },
  empty: { alignItems:'center', marginTop:80, gap:12 },
  emptyIcon: { fontSize:48 },
  emptyText: { fontSize:16, color:C.muted },
});
