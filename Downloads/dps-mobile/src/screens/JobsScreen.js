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
  const [todayJobs, setTodayJobs]     = useState([]); // today's non-cancelled jobs
  const [historyJobs, setHistoryJobs] = useState([]); // all completed jobs
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [tab, setTab]                 = useState('today');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const isMine = j => j.technician_id === user?.id;

      // Fetch today's board + full history in parallel
      const [todayAll, allAll] = await Promise.all([
        getMyJobs(today),
        getMyJobs(),       // no date = all time
      ]);

      // Today's jobs: exclude cancelled (completed here for "Done for Now" — handled in Today tab filter)
      setTodayJobs(todayAll.filter(isMine).filter(j => j.status !== 'cancelled'));

      // History: completed only, newest first
      const completed = allAll
        .filter(isMine)
        .filter(j => j.status === 'completed')
        .sort((a, b) => new Date(b.completed_at || b.scheduled_start) - new Date(a.completed_at || a.scheduled_start));
      setHistoryJobs(completed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Refresh when screen comes back into focus
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation, load]);

  // Derive per-tab data from loaded sets
  const activeJob    = todayJobs.filter(j => j.status === 'en_route' || j.status === 'on_site');
  const upcomingJobs = todayJobs.filter(j => j.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_start || 0) - new Date(b.scheduled_start || 0));

  // When no active job exists, surface the next scheduled job in Today
  // so the tech always sees what to head to next without needing to check Upcoming
  const nextUp = activeJob.length === 0 && upcomingJobs.length > 0 ? [upcomingJobs[0]] : [];
  const todayTabData = activeJob.length > 0 ? activeJob : nextUp;

  // Upcoming tab hides the job already promoted to Today so there's no duplicate
  const upcomingTabData = nextUp.length > 0
    ? upcomingJobs.slice(1)   // first one is already showing in Today
    : upcomingJobs;

  const listData = tab === 'today'
    ? todayTabData
    : tab === 'upcoming'
      ? upcomingTabData
      : historyJobs;

  const renderJob = ({ item: job }) => {
    const s = STATUS[job.status] || STATUS.scheduled;
    const isDoneForNow = job.status === 'completed' && job.return_trip_needed;
    const isNextUp = tab === 'today' && nextUp.length > 0 && job.id === nextUp[0].id;
    const displayColor = isDoneForNow ? '#f97316' : isNextUp ? C.blue : s.color;
    const displayLabel = isDoneForNow ? 'Done for Now' : isNextUp ? 'Up Next' : s.label;

    // For history, show the date; for today/upcoming show the time window
    const showDate  = tab === 'history';
    const dateLine  = job.scheduled_start
      ? dayjs(job.scheduled_start).format('ddd, MMM D · h:mm A')
      : null;
    const startFmt  = job.scheduled_start ? dayjs(job.scheduled_start).format('h:mm A') : null;
    const endFmt    = job.scheduled_end   ? dayjs(job.scheduled_end).format('h:mm A')   : null;

    return (
      <TouchableOpacity
        style={[styles.card, isNextUp && { borderColor: C.blue + '55', borderWidth: 1.5 }]}
        onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
        activeOpacity={0.75}
      >
        <View style={[styles.statusBar, { backgroundColor: displayColor }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.customerName} numberOfLines={1}>{job.customer_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: displayColor + '22', borderColor: displayColor + '66' }]}>
              <Text style={[styles.statusText, { color: displayColor }]}>{displayLabel.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.jobType}>{job.job_type || 'Service Call'}</Text>
          {job.address && (
            <Text style={styles.address} numberOfLines={1}>📍 {job.address}</Text>
          )}
          {showDate && dateLine && (
            <Text style={styles.time}>🗓 {dateLine}</Text>
          )}
          {!showDate && startFmt && (
            <Text style={styles.time}>🕐 {startFmt}{endFmt ? ` – ${endFmt}` : ''}</Text>
          )}
          {tab === 'today' && job.status === 'en_route' && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot}/>
              <Text style={styles.activeText}>En route — GPS tracking active</Text>
            </View>
          )}
          {tab === 'today' && job.status === 'on_site' && (
            <View style={[styles.activeBadge, { backgroundColor: C.amber + '18' }]}>
              <View style={[styles.activeDot, { backgroundColor: C.amber }]}/>
              <Text style={[styles.activeText, { color: C.amber }]}>On site now</Text>
            </View>
          )}
          {isNextUp && (
            <View style={[styles.activeBadge, { backgroundColor: C.blue + '18' }]}>
              <View style={[styles.activeDot, { backgroundColor: C.blue }]}/>
              <Text style={[styles.activeText, { color: C.blue }]}>Your next stop — tap to open</Text>
            </View>
          )}
        </View>
        <View style={styles.cardChevron}>
          <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const tabs = [
    { key: 'today',    label: 'Today'    },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'history',  label: 'History'  },
  ];

  const emptyMessages = {
    today:    activeJob.length === 0 && upcomingJobs.length === 0
      ? { icon: '✅', title: 'All done!', sub: 'No more jobs scheduled for today' }
      : { icon: '🚗', title: 'No active job', sub: 'No job currently en route or on site' },
    upcoming: { icon: '📅', title: 'Nothing else scheduled', sub: 'No more upcoming jobs for today' },
    history:  { icon: '📋', title: 'No history yet', sub: 'Completed jobs will appear here' },
  };
  const em = emptyMessages[tab];

  return (
    <View style={styles.container}>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
            {/* Badge counts */}
            {t.key === 'today' && todayTabData.length > 0 && (
              <View style={[styles.badge, { backgroundColor: nextUp.length > 0 ? C.blue : C.green }]}>
                <Text style={styles.badgeText}>{todayTabData.length}</Text>
              </View>
            )}
            {t.key === 'upcoming' && upcomingTabData.length > 0 && (
              <View style={[styles.badge, { backgroundColor: C.amber }]}>
                <Text style={styles.badgeText}>{upcomingTabData.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.green} size="large" />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={j => j.id}
          renderItem={renderJob}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{em.icon}</Text>
              <Text style={styles.emptyTitle}>{em.title}</Text>
              <Text style={styles.emptySub}>{em.sub}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabRow:         { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tab:            { flex: 1, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive:      { borderBottomWidth: 2, borderBottomColor: C.amber },
  tabText:        { fontSize: 13, color: C.muted, fontWeight: '500' },
  tabTextActive:  { color: C.amber, fontWeight: '700' },
  badge:          { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText:      { fontSize: 9, color: '#fff', fontWeight: '800' },

  card:           { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, flexDirection: 'row', overflow: 'hidden' },
  statusBar:      { width: 4 },
  cardBody:       { flex: 1, padding: 14, gap: 4 },
  cardRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  customerName:   { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  statusPill:     { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  statusText:     { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  jobType:        { fontSize: 13, color: C.muted },
  address:        { fontSize: 12, color: C.dim, marginTop: 2 },
  time:           { fontSize: 12, color: C.muted, marginTop: 2 },
  cardChevron:    { justifyContent: 'center', paddingRight: 12 },

  activeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: C.green + '18', alignSelf: 'flex-start' },
  activeDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  activeText:     { fontSize: 10, color: C.green, fontWeight: '600' },

  empty:          { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyIcon:      { fontSize: 48 },
  emptyTitle:     { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 8 },
  emptySub:       { fontSize: 13, color: C.muted, textAlign: 'center' },
});
