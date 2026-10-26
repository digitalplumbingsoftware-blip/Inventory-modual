import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal,
} from 'react-native';
import { C } from '../theme';
import { getScorecard } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const PERIODS = [
  { key: 'today',          label: 'Today' },
  { key: 'yesterday',      label: 'Yesterday' },
  { key: 'last_week',      label: 'Last week' },
  { key: 'week_to_date',   label: 'Week to date' },
  { key: 'trailing_7',     label: 'Trailing 7 days' },
  { key: 'trailing_30',    label: 'Trailing 30 days' },
  { key: 'month_to_date',  label: 'Month to date' },
  { key: 'last_month',     label: 'Last month' },
  { key: 'year_to_date',   label: 'Year to date' },
];

const JOB_TYPES = [
  { key: 'total',   label: 'Total' },
  { key: 'service', label: 'Service' },
  { key: 'sales',   label: 'Sales' },
  { key: 'install', label: 'Install' },
];

const fmt$ = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = n => `${n >= 0 ? '+' : ''}${n}%`;
const fmtN = n => parseFloat(n || 0).toFixed(1).replace(/\.0$/, '');

export default function ScorecardScreen() {
  const { user } = useAuth();
  const [period, setPeriod]       = useState('trailing_30');
  const [jobType, setJobType]     = useState('total');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await getScorecard(period, jobType);
      setData(result);
    } catch (e) {
      console.error('Scorecard error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, jobType]);

  useEffect(() => { load(); }, [load]);

  const currentPeriodLabel = PERIODS.find(p => p.key === period)?.label || 'Trailing 30 days';

  const metrics = data ? [
    {
      label: 'Total Sales',
      value: fmt$(data.current.total_sales),
      change: data.changes.total_sales,
      changeSub: 'Total Sales Change',
    },
    {
      label: 'Sales Opps',
      value: data.current.sales_opps,
      change: data.changes.sales_opps,
      changeSub: 'Sales Opps Change',
    },
    {
      label: 'Close Rate',
      value: `${data.current.close_rate}%`,
      change: data.changes.close_rate,
      changeSub: 'Close Rate Change',
    },
    {
      label: 'Closed Avg Sale',
      value: fmt$(data.current.avg_sale),
      change: data.changes.avg_sale,
      changeSub: 'Avg Sale Change',
    },
    {
      label: 'Options Per Opp',
      value: fmtN(data.current.options_per_opp),
      change: data.changes.options_per_opp,
      changeSub: 'Options Change',
    },
    {
      label: 'Customer Satisfaction',
      value: 'Not rated',
      change: null,
      changeSub: 'Satisfaction Change',
    },
  ] : [];

  const ChangeChip = ({ value }) => {
    if (value === null) return (
      <Text style={styles.changeNeutral}>—</Text>
    );
    const positive = value >= 0;
    return (
      <Text style={[styles.changeChip, { color: positive ? C.green : '#f56565' }]}>
        {positive ? '▲' : '▼'} {Math.abs(value)}%
      </Text>
    );
  };

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </Text>
        </View>
        <Text style={styles.headerName}>
          {user?.first_name} {user?.last_name}
        </Text>
        <TouchableOpacity onPress={() => setPeriodOpen(true)} style={styles.periodBtn}>
          <Text style={styles.periodBtnText}>{currentPeriodLabel.toUpperCase()}</Text>
          <Text style={styles.periodCaret}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* Job type tabs */}
      <View style={styles.typeRow}>
        {JOB_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setJobType(t.key)}
            style={[styles.typeTab, jobType === t.key && styles.typeTabActive]}
          >
            <Text style={[styles.typeText, jobType === t.key && styles.typeTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Metrics grid */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.green} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} />
          }
        >
          {metrics.map((m, i) => (
            <View key={i} style={[
              styles.cell,
              // right border on odd cells (left column), bottom border on all but last row
              { borderRightWidth: i % 2 === 0 ? 1 : 0 },
              { borderBottomWidth: i < metrics.length - 2 ? 1 : 0 },
            ]}>
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
              <View style={styles.changeRow}>
                <ChangeChip value={m.change} />
                <Text style={styles.changeLabel}>{m.changeSub}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Period picker modal */}
      <Modal visible={periodOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPeriodOpen(false)}
        >
          <View style={styles.periodSheet}>
            <Text style={styles.periodSheetTitle}>Select Period</Text>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                onPress={() => { setPeriod(p.key); setPeriodOpen(false); }}
                style={[styles.periodRow, period === p.key && styles.periodRowActive]}
              >
                <Text style={[styles.periodRowText, period === p.key && styles.periodRowTextActive]}>
                  {p.label}
                </Text>
                {period === p.key && <Text style={{ color: C.green, fontSize: 14 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const BORDER = C.border;

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: C.surface },
  avatar:       { width: 36, height: 36, borderRadius: 18, backgroundColor: C.amber + '33', borderWidth: 1.5, borderColor: C.amber, justifyContent: 'center', alignItems: 'center' },
  avatarText:   { fontSize: 12, fontWeight: '800', color: C.amber },
  headerName:   { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  periodBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  periodBtnText:{ fontSize: 10, fontWeight: '700', color: C.green, fontFamily: 'monospace', letterSpacing: 0.5 },
  periodCaret:  { fontSize: 10, color: C.green },

  // Job type tabs
  typeRow:      { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: BORDER },
  typeTab:      { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  typeTabActive:{ borderBottomColor: C.green },
  typeText:     { fontSize: 13, color: C.muted, fontWeight: '500' },
  typeTextActive:{ color: C.green, fontWeight: '700' },

  // Metrics
  grid:         { flexGrow: 1 },
  cell:         {
    width: '50%',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  metricValue:  { fontSize: 26, fontWeight: '700', color: C.text, textAlign: 'center' },
  metricLabel:  { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 2 },
  changeRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  changeChip:   { fontSize: 11, fontWeight: '700' },
  changeNeutral:{ fontSize: 11, color: C.dim },
  changeLabel:  { fontSize: 9, color: C.dim, textAlign: 'center' },

  // Period modal
  modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  periodSheet:    { backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36, paddingTop: 8 },
  periodSheetTitle:{ fontSize: 12, fontWeight: '700', color: C.muted, textAlign: 'center', paddingVertical: 12, letterSpacing: 1, fontFamily: 'monospace' },
  periodRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: C.border },
  periodRowActive:{ backgroundColor: C.green + '11' },
  periodRowText:  { fontSize: 15, color: C.text },
  periodRowTextActive: { color: C.green, fontWeight: '700' },
});
