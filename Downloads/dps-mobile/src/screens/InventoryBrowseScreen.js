import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { C } from '../theme';
import { getInventoryLocations, getLocationStock } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ok',  label: 'In Stock' },
  { id: 'low', label: 'Low Stock' },
  { id: 'out', label: 'Out of Stock' },
];

function itemStatus(item) {
  const qty = parseInt(item.qty || 0, 10);
  if (qty === 0) return 'out';
  if (item.is_low || (item.min_qty && qty <= item.min_qty)) return 'low';
  return 'ok';
}

const STATUS_CONFIG = {
  ok:  { label: 'In Stock',     bg: '#0d2a1c', text: '#3ecf8e', border: '#3ecf8e' },
  low: { label: 'Low Stock',    bg: '#2a1d06', text: '#f5a623', border: '#f5a623' },
  out: { label: 'Out of Stock', bg: '#2a0d0d', text: '#f56565', border: '#f56565' },
};

function ItemCard({ item }) {
  const status = itemStatus(item);
  const cfg    = STATUS_CONFIG[status];
  const qty    = parseInt(item.qty || 0, 10);
  const maxQty = Math.max((item.min_qty || 1) * 2, 1);
  const fill   = Math.min(1, qty / maxQty);
  const barColor = status === 'ok' ? C.green : status === 'low' ? C.amber : C.red;

  return (
    <View style={[s.card, { borderTopColor: barColor }]}>
      <View style={s.cardHeader}>
        <View style={s.cardTitleBlock}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.cardSku}>{item.sku || '—'}</Text>
        </View>
        <View style={[s.pill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[s.pillText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Stock bar — based on truck qty vs min */}
      <View style={s.barSection}>
        <View style={s.barLabels}>
          <Text style={s.barLabel}>🚚 Truck Stock</Text>
          <Text style={s.barQty}>
            {qty} <Text style={s.barMin}>/ {item.min_qty || 0} min</Text>
          </Text>
        </View>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${Math.round(fill * 100)}%`, backgroundColor: barColor }]} />
        </View>
      </View>

      <View style={s.cardFooter}>
        <Text style={s.cost}>
          {item.cost != null ? `$${parseFloat(item.cost).toFixed(2)}` : ''}
        </Text>
        {item.item_type ? (
          <View style={s.typeBadge}>
            <Text style={s.typeBadgeText}>{item.item_type}</Text>
          </View>
        ) : null}
        <Text style={[s.qtyBig, { color: barColor }]}>{qty}</Text>
      </View>
    </View>
  );
}

function KpiBanner({ items, truckName }) {
  const low = items.filter(i => { const st = itemStatus(i); return st === 'low' || st === 'out'; }).length;
  const val = items.reduce((s, i) => s + parseInt(i.qty || 0, 10) * parseFloat(i.cost || 0), 0);

  return (
    <View>
      <View style={s.truckBadge}>
        <Text style={s.truckBadgeText}>🚚 {truckName || 'My Truck'}</Text>
      </View>
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Text style={s.kpiVal}>{items.length}</Text>
          <Text style={s.kpiLabel}>SKUs</Text>
        </View>
        <View style={[s.kpiCard, low > 0 ? s.kpiCardAlert : null]}>
          <Text style={[s.kpiVal, low > 0 ? { color: C.red } : null]}>{low}</Text>
          <Text style={s.kpiLabel}>Low / Out</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={[s.kpiVal, { color: C.green }]}>
            ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
          </Text>
          <Text style={s.kpiLabel}>Value</Text>
        </View>
      </View>
    </View>
  );
}

export default function InventoryBrowseScreen() {
  const { user } = useAuth();
  const [items, setItems]             = useState([]);
  const [truckLocation, setTruck]     = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [noTruck, setNoTruck]         = useState(false);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // 1. Find this tech's truck location
      const locs  = await getInventoryLocations();
      const truck = locs.find(l => l.technician_id === user?.id && l.type === 'truck');
      if (!truck) { setNoTruck(true); return; }
      setTruck(truck);

      // 2. Load only that truck's stock
      const stock = await getLocationStock(truck.id);
      setItems(Array.isArray(stock) ? stock : []);
    } catch (e) {
      console.warn('InventoryBrowseScreen load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && itemStatus(i) !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return i.name?.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={s.loadingText}>Loading truck stock…</Text>
      </View>
    );
  }

  if (noTruck) {
    return (
      <View style={s.center}>
        <Text style={s.noTruckIcon}>🚚</Text>
        <Text style={s.noTruckTitle}>No truck assigned</Text>
        <Text style={s.noTruckSub}>Ask your manager to assign a truck location to your account.</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search item name or SKU…"
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter pills */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
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

      {/* KPI banner */}
      <KpiBanner items={items} truckName={truckLocation?.name} />

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => <ItemCard item={item} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyText}>
              {search || statusFilter !== 'all'
                ? 'No items match your filters.'
                : 'No stock on your truck yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingText: { color: C.muted, fontSize: 13 },

  noTruckIcon:  { fontSize: 48 },
  noTruckTitle: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center' },
  noTruckSub:   { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 8,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 12,
  },
  searchIcon:  { fontSize: 16, color: C.muted, marginRight: 8 },
  searchInput: { flex: 1, height: 42, color: C.text, fontSize: 14 },

  // Filter pills
  filterRow:           { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  filterPill:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterPillActive:    { borderColor: C.green, backgroundColor: C.green + '18' },
  filterPillText:      { fontSize: 12, fontWeight: '600', color: C.muted },
  filterPillTextActive:{ color: C.green },

  // Truck badge
  truckBadge: { marginHorizontal: 12, marginBottom: 8, backgroundColor: C.surface2, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  truckBadgeText: { fontSize: 12, fontWeight: '700', color: C.muted },

  // KPI
  kpiRow:      { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 10 },
  kpiCard:     { flex: 1, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
  kpiCardAlert:{ borderColor: '#4a1a1a', backgroundColor: '#1a0b0b' },
  kpiVal:      { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  kpiLabel:    { fontSize: 10, color: C.muted, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },

  // List
  list: { paddingHorizontal: 12, paddingBottom: 24 },

  // Card
  card: {
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    borderTopWidth: 3, marginBottom: 10, overflow: 'hidden',
  },
  cardHeader:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 12, paddingBottom: 8 },
  cardTitleBlock: { flex: 1, marginRight: 10 },
  cardName:       { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardSku:        { fontSize: 11, color: C.muted },
  pill:           { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pillText:       { fontSize: 10, fontWeight: '700' },

  // Stock bar
  barSection: { paddingHorizontal: 12, paddingBottom: 10 },
  barLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel:   { fontSize: 11, color: C.muted },
  barQty:     { fontSize: 11, fontWeight: '700', color: C.text },
  barMin:     { fontWeight: '400', color: C.muted },
  barTrack:   { height: 5, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 3 },

  // Footer
  cardFooter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  cost:       { fontSize: 13, fontWeight: '700', color: C.text, flex: 1 },
  typeBadge:  { backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, color: C.muted, fontWeight: '600' },
  qtyBig:     { fontSize: 20, fontWeight: '800' },

  // Empty
  empty:     { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: C.muted, fontSize: 14 },
});
