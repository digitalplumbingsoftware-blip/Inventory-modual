import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { C } from '../theme';
import { getInventory, getInventoryLocations } from '../services/api';

// Stock status helpers
function getStatus(item) {
  const total = (item.stock || []).reduce((s, l) => s + parseInt(l.qty || 0, 10), 0);
  if (total === 0) return 'out';
  if (item.min_qty && total <= item.min_qty) return 'low';
  return 'ok';
}

function getTotalQty(item) {
  return (item.stock || []).reduce((s, l) => s + parseInt(l.qty || 0, 10), 0);
}

const STATUS_CONFIG = {
  ok:  { label: 'In Stock',      bg: '#0d2a1c', text: '#3ecf8e', border: '#3ecf8e' },
  low: { label: 'Low Stock',     bg: '#2a1d06', text: '#f5a623', border: '#f5a623' },
  out: { label: 'Out of Stock',  bg: '#2a0d0d', text: '#f56565', border: '#f56565' },
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ok',  label: 'In Stock' },
  { id: 'low', label: 'Low Stock' },
  { id: 'out', label: 'Out of Stock' },
];

// ── Item card ──────────────────────────────────────────────────────────────────
function ItemCard({ item, locations }) {
  const status = getStatus(item);
  const cfg    = STATUS_CONFIG[status];
  const total  = getTotalQty(item);
  const maxQty = Math.max((item.min_qty || 1) * 2, 1);
  const fill   = Math.min(1, total / maxQty);

  const barColor = status === 'ok' ? C.green : status === 'low' ? C.amber : C.red;
  const topBorderColor = status === 'ok' ? C.green : status === 'low' ? C.amber : C.red;

  const truckStock = (item.stock || []).find((s) => {
    const loc = (locations || []).find((l) => l.id === s.location_id);
    return loc?.type === 'truck';
  });

  return (
    <View style={[s.card, { borderTopColor: topBorderColor }]}>
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={s.cardTitleBlock}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.cardSku}>{item.sku || '—'}</Text>
        </View>
        <View style={[s.pill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[s.pillText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Stock bar */}
      <View style={s.barSection}>
        <View style={s.barLabels}>
          <Text style={s.barLabel}>Total Stock</Text>
          <Text style={s.barQty}>
            {total} <Text style={s.barMin}>/ {item.min_qty || 0} min</Text>
          </Text>
        </View>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${Math.round(fill * 100)}%`, backgroundColor: barColor }]} />
        </View>
      </View>

      {/* Footer row */}
      <View style={s.cardFooter}>
        <Text style={s.cost}>
          {item.cost != null ? `$${parseFloat(item.cost).toFixed(2)}` : ''}
        </Text>
        {truckStock ? (
          <Text style={s.truckLabel}>
            🚚 Truck:{' '}
            <Text style={{
              fontWeight: '700',
              color: parseInt(truckStock.qty || 0, 10) === 0 ? C.red
                   : parseInt(truckStock.qty || 0, 10) <= item.min_qty ? C.amber
                   : C.text,
            }}>
              {truckStock.qty}
            </Text>
          </Text>
        ) : null}
        {item.item_type ? (
          <View style={s.typeBadge}>
            <Text style={s.typeBadgeText}>{item.item_type}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── KPI banner ─────────────────────────────────────────────────────────────────
function KpiBanner({ items }) {
  const low   = items.filter((i) => { const s = getStatus(i); return s === 'low' || s === 'out'; }).length;
  const val   = items.reduce((s, i) => s + getTotalQty(i) * parseFloat(i.cost || 0), 0);

  return (
    <View style={s.kpiRow}>
      <View style={s.kpiCard}>
        <Text style={s.kpiVal}>{items.length}</Text>
        <Text style={s.kpiLabel}>SKUs</Text>
      </View>
      <View style={[s.kpiCard, low > 0 ? s.kpiCardAlert : null]}>
        <Text style={[s.kpiVal, low > 0 ? { color: C.red } : null]}>{low}</Text>
        <Text style={s.kpiLabel}>Low/Out</Text>
      </View>
      <View style={s.kpiCard}>
        <Text style={[s.kpiVal, { color: C.green }]}>
          ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
        </Text>
        <Text style={s.kpiLabel}>Value</Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function InventoryBrowseScreen({ navigation }) {
  const [items, setItems]           = useState([]);
  const [locations, setLocations]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [inv, locs] = await Promise.all([getInventory(), getInventoryLocations()]);
      setItems(Array.isArray(inv) ? inv : (inv.items || []));
      setLocations(Array.isArray(locs) ? locs : (locs.locations || []));
    } catch (e) {
      console.warn('InventoryBrowseScreen load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => {
    if (statusFilter !== 'all' && getStatus(i) !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return i.name?.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.blue} size="large" />
        <Text style={s.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search SKU or item name..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter pills */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[s.filterPill, statusFilter === f.id && s.filterPillActive]}
            onPress={() => setStatus(f.id)}
            activeOpacity={0.7}
          >
            <Text style={[s.filterPillText, statusFilter === f.id && s.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* KPI */}
      <KpiBanner items={items} />

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => <ItemCard item={item} locations={locations} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={C.blue}
          />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyText}>
              {search || statusFilter !== 'all' ? 'No items match your filters.' : 'No inventory items yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: C.muted, fontSize: 13 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 8,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12,
  },
  searchIcon:  { fontSize: 16, color: C.muted, marginRight: 8 },
  searchInput: { flex: 1, height: 42, color: C.text, fontSize: 14 },

  // Filter pills
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.surface,
  },
  filterPillActive: { borderColor: C.blue, backgroundColor: '#0a1929' },
  filterPillText:   { fontSize: 12, fontWeight: '600', color: C.muted },
  filterPillTextActive: { color: C.blue },

  // KPI
  kpiRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 10 },
  kpiCard: {
    flex: 1, backgroundColor: C.surface,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: 12, alignItems: 'center',
  },
  kpiCardAlert: { borderColor: '#4a1a1a', backgroundColor: '#1a0b0b' },
  kpiVal:   { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },

  // List
  list: { paddingHorizontal: 12, paddingBottom: 24 },

  // Card
  card: {
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    borderTopWidth: 3, marginBottom: 10, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', padding: 12, paddingBottom: 8,
  },
  cardTitleBlock: { flex: 1, marginRight: 10 },
  cardName: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardSku:  { fontSize: 11, color: C.muted, fontFamily: 'System' },

  // Pill
  pill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700' },

  // Stock bar
  barSection: { paddingHorizontal: 12, paddingBottom: 10 },
  barLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel:   { fontSize: 11, color: C.muted },
  barQty:     { fontSize: 11, fontWeight: '700', color: C.text },
  barMin:     { fontWeight: '400', color: C.muted },
  barTrack:   { height: 5, backgroundColor: C.surface3, borderRadius: 3, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 3 },

  // Footer
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: C.border, gap: 8,
  },
  cost:        { fontSize: 13, fontWeight: '700', color: C.text, flex: 1 },
  truckLabel:  { fontSize: 11, color: C.muted },
  typeBadge:   { backgroundColor: C.surface3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, color: C.muted, fontWeight: '600' },

  // Empty
  empty:     { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: C.muted, fontSize: 14 },
});
