import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, ScrollView, Modal,
} from 'react-native';
import {
  getPBEngine, getPBTasks, getPBCategories, getEnabledServices,
} from '../services/api';
import { C } from '../theme';
import { getCallback, removeCallback } from '../utils/callbackStore';

// Sub-pricebooks per service — mirrors SUBBOOKS_BY_SERVICE in the web app so
// mobile shows the exact same set of books the desktop does.
const SUBBOOKS_BY_SERVICE = {
  plumbing: [
    { service:'plumbing', service_type:'install', label:'Plumbing · Install', icon:'🔧', color:'#C55A11' },
    { service:'plumbing', service_type:'service', label:'Plumbing · Service', icon:'🚿', color:'#1F7A8C' },
  ],
  hvac: [
    { service:'hvac', service_type:'install', label:'HVAC · Install', icon:'❄️', color:'#C55A11' },
    { service:'hvac', service_type:'service', label:'HVAC · Service', icon:'🛠',  color:'#1E6B3C' },
  ],
  electrical: [
    { service:'electrical', service_type:'install', label:'Electrical · Install', icon:'⚡', color:'#E8A500' },
    { service:'electrical', service_type:'service', label:'Electrical · Service', icon:'🛠',  color:'#1E6B3C' },
  ],
  restoration: [
    { service:'restoration', service_type:'dryout',  label:'Restoration · Dryouts',  icon:'💧', color:'#2E5FA3' },
    { service:'restoration', service_type:'removal', label:'Restoration · Removals', icon:'🧹', color:'#7A4B1A' },
    { service:'restoration', service_type:'rebuild', label:'Restoration · Rebuilds', icon:'🔨', color:'#5B2D8E' },
  ],
  renovations: [
    { service:'renovations', service_type:'kitchen',  label:'Renovations · Kitchen',  icon:'🍳', color:'#C55A11' },
    { service:'renovations', service_type:'bathroom', label:'Renovations · Bathroom', icon:'🚿', color:'#1F7A8C' },
    { service:'renovations', service_type:'home',     label:'Renovations · Whole Home', icon:'🏠', color:'#5B2D8E' },
  ],
  pest_control: [
    { service:'pest_control', service_type:'general',  label:'Pest · General',            icon:'🪳', color:'#1E6B3C' },
    { service:'pest_control', service_type:'termite',  label:'Pest · Termite',            icon:'🐜', color:'#7A4B1A' },
    { service:'pest_control', service_type:'wildlife', label:'Pest · Rodents & Wildlife', icon:'🐭', color:'#5B2D8E' },
  ],
  pools: [
    { service:'pools', service_type:'installation', label:'Pools · Installation', icon:'🏗',  color:'#C55A11' },
    { service:'pools', service_type:'repair',       label:'Pools · Repair',       icon:'🔧', color:'#5B2D8E' },
    { service:'pools', service_type:'maintenance',  label:'Pools · Maintenance',  icon:'🧹', color:'#1E6B3C' },
  ],
};

const SERVICE_META = {
  plumbing:     { label:'Plumbing',     icon:'🚿', color:'#1F7A8C' },
  hvac:         { label:'HVAC',         icon:'❄️', color:'#2E5FA3' },
  electrical:   { label:'Electrical',   icon:'⚡', color:'#E8A500' },
  restoration:  { label:'Restoration',  icon:'💧', color:'#5B2D8E' },
  renovations:  { label:'Renovations',  icon:'🏠', color:'#C55A11' },
  pest_control: { label:'Pest Control', icon:'🪳', color:'#1E6B3C' },
  pools:        { label:'Pools',        icon:'🏊', color:'#1F7A8C' },
};

const DIFF_COLOR = { Easy: C.green, Moderate: C.amber, Hard: C.red, Complex: '#a78bfa' };

// HTML engine formula — MUST match Plumbing_Pricebook_Web_v7.html recalcEngine().
function calcFlatRate(task, engine) {
  const E = engine || {};
  // Subcontractor shortcut: price = sub_cost / (1 - sub_gp/100) → 65% GP by default.
  const subCost = parseFloat(task.sub_cost || 0);
  if (subCost > 0) {
    const subGp = parseFloat(E.sub_gp != null ? E.sub_gp : 65);
    return subCost / Math.max(0.01, 1 - subGp / 100);
  }
  const wage = +E.wage || 0, hrs = +E.hrs || 1600;
  const fica = +E.fica || 0, unemp = +E.unemp || 0, wc = +E.wc || 0;
  const health = +E.health || 0, vehicle = +E.vehicle || 0, fuel = +E.fuel || 0;
  const tools = +E.tools || 0, uniform = +E.uniform || 0, phone = +E.phone || 0;
  const numTechs = +E.num_techs || 1, ohHrs = +E.oh_hrs || 1600;
  const profit = +E.profit || 0, misc = +E.misc || 0, warranty = +E.warranty || 0;
  const matmarkup = +E.matmarkup || 0;
  const ohItems = Array.isArray(E.oh_items) ? E.oh_items : [];

  const burdenPct = (fica + unemp + wc) / 100;
  const baseWages = wage * hrs;
  const burdenAmt = baseWages * burdenPct;
  const fixedAnnual = (health + vehicle + fuel + tools + uniform + phone) * 12;
  const burdened = hrs > 0 ? (baseWages + burdenAmt + fixedAnnual) / hrs : 0;

  const ohMonthly = ohItems.reduce((s, it) => s + (+it.monthly || 0), 0);
  const ohAnnual = ohMonthly * 12;
  const ohPerHr = (numTechs > 0 && ohHrs > 0) ? ohAnnual / (numTechs * ohHrs) : 0;

  const costPerHr = burdened + ohPerHr;
  const laborRate = costPerHr / Math.max(0.01, 1 - profit / 100);
  const markup = 1 + (misc + warranty + matmarkup) / 100;

  const matCost = (task.materials || []).reduce(
    (sum, m) => sum + parseFloat(m.cost || 0) * parseFloat(m.qty || 1), 0);
  const taskHrs = parseFloat(task.hours || 0);
  return matCost * markup + taskHrs * laborRate;
}

const fmt = (n) => '$' + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default function PricebookScreen({ route, navigation }) {
  const onSelect         = getCallback(route?.params?.onSelectKey)         || null;
  const onSelectMultiple = getCallback(route?.params?.onSelectMultipleKey) || null;
  const inSelectMode     = !!(onSelect || onSelectMultiple);

  // ── Service / sub-book state ──────────────────────────────────────
  const [enabledServices, setEnabledServices] = useState(['plumbing']);
  const [service, setService]         = useState('plumbing');
  const [serviceType, setServiceType] = useState('install');

  // ── Data ──────────────────────────────────────────────────────────
  const [cats, setCats]         = useState([]); // [{id,name,icon,color,task_count}]
  const [activeCat, setActiveCat] = useState(null);
  const [search, setSearch]     = useState('');
  const [engine, setEngine]     = useState(null);
  const [tasks, setTasks]       = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);

  // Cart: { [taskId]: { task, qty, price } }
  const [cart, setCart] = useState({});
  const cartCount = Object.values(cart).reduce((s, v) => s + v.qty, 0);

  const subbooks = SUBBOOKS_BY_SERVICE[service] || SUBBOOKS_BY_SERVICE.plumbing;

  // ── Bootstrap: fetch enabled services once ────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const list = await getEnabledServices();
        const arr = Array.isArray(list) && list.length ? list : ['plumbing'];
        setEnabledServices(arr);
        // Pick first enabled if current selection is not enabled.
        if (!arr.includes(service)) {
          const first = arr[0];
          setService(first);
          setServiceType((SUBBOOKS_BY_SERVICE[first] || [])[0]?.service_type || 'service');
        }
      } catch (e) { console.warn('enabled-services', e.message); }
    })();
  }, []);

  // Snap sub-book if we changed services.
  useEffect(() => {
    const books = SUBBOOKS_BY_SERVICE[service] || [];
    if (!books.find(b => b.service_type === serviceType)) {
      setServiceType(books[0]?.service_type || 'service');
    }
  }, [service]);

  // ── Fetch engine when (service, service_type) changes ─────────────
  useEffect(() => {
    getPBEngine({ service, service_type: serviceType })
      .then(setEngine)
      .catch(e => console.warn('engine', e.message));
  }, [service, serviceType]);

  // ── Fetch categories when (service, service_type) changes ─────────
  useEffect(() => {
    setLoadingCats(true);
    getPBCategories({ service, service_type: serviceType })
      .then(rows => {
        const list = Array.isArray(rows) ? rows : [];
        setCats(list);
        setActiveCat(list[0]?.id || null);
      })
      .catch(e => { console.warn('categories', e.message); setCats([]); setActiveCat(null); })
      .finally(() => setLoadingCats(false));
  }, [service, serviceType]);

  // ── Fetch tasks when category/search/service change ───────────────
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const params = { service, service_type: serviceType };
      if (search) params.search = search;
      else if (activeCat) params.category = activeCat;
      const data = await getPBTasks(params);
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('tasks', e.message);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [service, serviceType, activeCat, search]);

  useEffect(() => {
    if (!activeCat && !search) { setTasks([]); setLoadingTasks(false); return; }
    const t = setTimeout(fetchTasks, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetchTasks, activeCat, search]);

  // ── Cart helpers ───────────────────────────────────────────────
  const toggleCart = (task, price) => {
    setCart(prev => {
      if (prev[task.id]) {
        const next = { ...prev };
        delete next[task.id];
        return next;
      }
      return { ...prev, [task.id]: { task, qty: 1, price } };
    });
  };

  const adjustQty = (taskId, delta) => {
    setCart(prev => {
      const entry = prev[taskId];
      if (!entry) return prev;
      const newQty = entry.qty + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[taskId];
        return next;
      }
      return { ...prev, [taskId]: { ...entry, qty: newQty } };
    });
  };

  const handleDone = async () => {
    const items = Object.values(cart).map(({ task, qty, price }) => ({
      description: task.name,
      flat_rate: price,
      quantity: qty,
      task_id: task.id,
      tag: task.tag,
    }));

    if (onSelectMultiple) {
      await onSelectMultiple(items);
      removeCallback(route?.params?.onSelectMultipleKey);
    } else if (onSelect) {
      for (const item of items) onSelect(item);
      removeCallback(route?.params?.onSelectKey);
    }
    navigation.goBack();
  };

  const activeBook = subbooks.find(b => b.service_type === serviceType) || subbooks[0];
  const activeCatInfo = cats.find(c => c.id === activeCat);
  const svcMeta = SERVICE_META[service] || SERVICE_META.plumbing;

  const renderTask = ({ item }) => {
    const price     = engine ? calcFlatRate(item, engine) : 0;
    const diff      = item.difficulty || 'Easy';
    const cartEntry = cart[item.id];

    if (!inSelectMode) {
      return (
        <TouchableOpacity style={S.taskRow} onPress={() => setSelectedTask(item)} activeOpacity={0.75}>
          <View style={S.taskLeft}>
            <View style={S.taskTagRow}>
              <Text style={S.taskTag}>{item.tag}</Text>
              {diff !== 'Easy' && (
                <View style={[S.diffBadge, { backgroundColor: DIFF_COLOR[diff] + '22', borderColor: DIFF_COLOR[diff] + '44' }]}>
                  <Text style={[S.diffText, { color: DIFF_COLOR[diff] }]}>{diff}</Text>
                </View>
              )}
            </View>
            <Text style={S.taskName}>{item.name}</Text>
            {item.time_range && <Text style={S.taskTime}>{item.time_range}</Text>}
          </View>
          <View style={S.taskRight}>
            <Text style={S.taskPrice}>{fmt(price)}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={[S.taskRow, cartEntry && S.taskRowInCart]}>
        <TouchableOpacity
          style={S.taskLeft}
          onPress={() => !cartEntry && toggleCart(item, price)}
          activeOpacity={cartEntry ? 1 : 0.7}
        >
          <View style={S.taskTagRow}>
            <Text style={S.taskTag}>{item.tag}</Text>
            {diff !== 'Easy' && (
              <View style={[S.diffBadge, { backgroundColor: DIFF_COLOR[diff] + '22', borderColor: DIFF_COLOR[diff] + '44' }]}>
                <Text style={[S.diffText, { color: DIFF_COLOR[diff] }]}>{diff}</Text>
              </View>
            )}
          </View>
          <Text style={S.taskName}>{item.name}</Text>
          {item.time_range && <Text style={S.taskTime}>{item.time_range}</Text>}
        </TouchableOpacity>

        <View style={S.taskRight}>
          <Text style={S.taskPrice}>{fmt(price)}</Text>
          {cartEntry ? (
            <View style={S.stepper}>
              <TouchableOpacity onPress={() => adjustQty(item.id, -1)} style={S.stepBtn}>
                <Text style={S.stepTxt}>−</Text>
              </TouchableOpacity>
              <Text style={S.stepQty}>{cartEntry.qty}</Text>
              <TouchableOpacity onPress={() => adjustQty(item.id, 1)} style={S.stepBtn}>
                <Text style={S.stepTxt}>+</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => toggleCart(item, price)} style={S.addChip}>
              <Text style={S.addChipText}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const loading = loadingCats || loadingTasks || !engine;

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <Text style={S.headerTitle}>💲 Pricebook</Text>
        {inSelectMode && (
          <View style={S.headerActions}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={S.cancelBtn}>
              <Text style={S.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDone}
              style={[S.doneBtn, cartCount > 0 && S.doneBtnActive]}
            >
              <Text style={[S.doneBtnText, cartCount > 0 && S.doneBtnTextActive]}>
                {cartCount > 0 ? `✓ Done (${cartCount})` : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Service picker — only if more than one service enabled */}
      {enabledServices.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.svcScroll} contentContainerStyle={S.svcContent}>
          {enabledServices.map(svc => {
            const meta = SERVICE_META[svc] || { label: svc, icon:'▪', color: C.muted };
            const on = svc === service;
            return (
              <TouchableOpacity
                key={svc}
                onPress={() => { setService(svc); setSearch(''); }}
                style={[S.svcPill, on && { backgroundColor: meta.color + '22', borderColor: meta.color }]}
              >
                <Text style={[S.svcPillText, on && { color: meta.color }]}>
                  {meta.icon}  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Sub-book pills — only if this service has more than one */}
      {subbooks.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.subScroll} contentContainerStyle={S.subContent}>
          {subbooks.map(b => {
            const on = b.service_type === serviceType;
            return (
              <TouchableOpacity
                key={b.service_type}
                onPress={() => { setServiceType(b.service_type); setSearch(''); }}
                style={[S.subPill, on && { backgroundColor: b.color + '22', borderColor: b.color }]}
              >
                <Text style={[S.subPillText, on && { color: b.color }]}>{b.icon}  {b.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Category pills — dynamic from backend */}
      {cats.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.catScroll} contentContainerStyle={S.catContent}>
          {cats.map(cat => {
            const on = activeCat === cat.id && !search;
            const color = cat.color || svcMeta.color;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[S.catPill, on && { backgroundColor: color + '22', borderColor: color }]}
                onPress={() => { setActiveCat(cat.id); setSearch(''); }}
              >
                <Text style={[S.catPillText, on && { color }]}>
                  {(cat.icon || '') + ' ' + (cat.name || '').split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Search */}
      <View style={S.searchRow}>
        <TextInput
          style={S.searchInput}
          placeholder={`Search ${activeBook?.label || 'tasks'}…`}
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Section title */}
      {!search && activeCatInfo && (
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>{(activeCatInfo.icon || '')} {activeCatInfo.name}</Text>
          {!loadingTasks && <Text style={S.sectionCount}>{tasks.length} tasks</Text>}
        </View>
      )}
      {search && !loadingTasks && (
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>Search results</Text>
          <Text style={S.sectionCount}>{tasks.length} found</Text>
        </View>
      )}
      {!loadingCats && cats.length === 0 && (
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>No categories yet for {activeBook?.label || 'this pricebook'}.</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={C.green} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={t => String(t.id)}
          renderItem={renderTask}
          contentContainerStyle={[S.list, inSelectMode && cartCount > 0 && { paddingBottom: 90 }]}
          ListEmptyComponent={<Text style={S.emptyText}>No tasks found</Text>}
        />
      )}

      {/* Sticky cart bar */}
      {inSelectMode && cartCount > 0 && (
        <View style={S.cartBar}>
          <Text style={S.cartBarText}>
            {cartCount} item{cartCount !== 1 ? 's' : ''} selected
          </Text>
          <TouchableOpacity onPress={handleDone} style={S.cartBarBtn}>
            <Text style={S.cartBarBtnText}>✓ Done — Add to Estimate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Detail modal (browse mode) */}
      <Modal
        visible={!!selectedTask && !inSelectMode}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedTask(null)}
      >
        {selectedTask && engine && (
          <View style={S.modal}>
            <View style={S.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.modalTag}>{selectedTask.tag}</Text>
                <Text style={S.modalName}>{selectedTask.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedTask(null)} style={S.modalCloseBtn}>
                <Text style={S.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={S.modalScroll} contentContainerStyle={{ padding: 20, gap: 16 }}>
              <View style={S.priceCard}>
                <Text style={S.priceLabel}>FLAT RATE PRICE</Text>
                <Text style={S.priceBig}>{fmt(calcFlatRate(selectedTask, engine))}</Text>
                <Text style={S.priceSub}>{selectedTask.time_range || `${selectedTask.hours}h labor`}</Text>
              </View>

              {selectedTask.notes && (
                <View style={S.detailCard}>
                  <Text style={S.detailCardTitle}>SCOPE OF WORK</Text>
                  <Text style={S.detailCardBody}>{selectedTask.notes}</Text>
                </View>
              )}

              <View style={S.statsRow}>
                <View style={S.statChip}>
                  <Text style={S.statLabel}>Labor</Text>
                  <Text style={S.statValue}>{selectedTask.hours}h</Text>
                </View>
                {selectedTask.difficulty && (
                  <View style={[S.statChip, { borderColor: DIFF_COLOR[selectedTask.difficulty] + '44' }]}>
                    <Text style={S.statLabel}>Difficulty</Text>
                    <Text style={[S.statValue, { color: DIFF_COLOR[selectedTask.difficulty] }]}>{selectedTask.difficulty}</Text>
                  </View>
                )}
              </View>

              {selectedTask.materials && selectedTask.materials.length > 0 && (
                <View style={S.detailCard}>
                  <Text style={S.detailCardTitle}>MATERIALS ({selectedTask.materials.length})</Text>
                  {selectedTask.materials.map((m, i) => (
                    <View key={i} style={[S.matRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={S.matName} numberOfLines={1}>{m.description}</Text>
                      <Text style={S.matCost}>{m.qty > 1 ? `${m.qty}×` : ''} {fmt(m.cost)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cancelBtn: {
    backgroundColor: C.surface2, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: C.border2,
  },
  cancelText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  doneBtn: {
    backgroundColor: C.surface2, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: C.border2,
  },
  doneBtnActive: { backgroundColor: C.green + '22', borderColor: C.green },
  doneBtnText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  doneBtnTextActive: { color: C.green },

  // Service picker (top)
  svcScroll: { borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 54, backgroundColor: C.surface },
  svcContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  svcPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.surface2, borderWidth: 1.5, borderColor: C.border2,
    flexShrink: 0, flexDirection: 'row', alignItems: 'center',
  },
  svcPillText: { color: C.text, fontSize: 13, fontWeight: '800' },

  // Sub-book pills
  subScroll: { borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 50 },
  subContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  subPill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border2,
    flexShrink: 0, flexDirection: 'row', alignItems: 'center',
  },
  subPillText: { color: C.text, fontSize: 12, fontWeight: '800' },

  // Category pills
  catScroll: { borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 52 },
  catContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  catPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  catPillText: { color: C.muted, fontSize: 13, fontWeight: '600' },

  // Search
  searchRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  searchInput: {
    backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border,
  },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.muted },
  sectionCount: { fontSize: 12, color: C.dim },

  list: { paddingBottom: 40 },

  taskRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg,
  },
  taskRowInCart: { backgroundColor: C.green + '0a' },
  taskLeft: { flex: 1, marginRight: 10 },
  taskTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  taskTag: { fontSize: 10, color: C.green, fontWeight: '700', letterSpacing: 0.5 },
  diffBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  diffText: { fontSize: 9, fontWeight: '700' },
  taskName: { fontSize: 14, color: C.text, fontWeight: '500', lineHeight: 19 },
  taskTime: { fontSize: 11, color: C.muted, marginTop: 2 },
  taskRight: { alignItems: 'flex-end', minWidth: 80 },
  taskPrice: { fontSize: 15, fontWeight: '800', color: C.green, marginBottom: 6 },

  addChip: {
    backgroundColor: C.green + '1a', borderWidth: 1, borderColor: C.green,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  addChipText: { color: C.green, fontSize: 12, fontWeight: '700' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center',
  },
  stepTxt: { color: C.text, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  stepQty: { fontSize: 16, fontWeight: '800', color: C.text, minWidth: 24, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.green + '55',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28,
  },
  cartBarText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  cartBarBtn: { backgroundColor: C.green, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  cartBarBtnText: { color: C.bg, fontSize: 14, fontWeight: '800' },

  emptyText: { textAlign: 'center', color: C.muted, marginTop: 60, fontSize: 15 },

  modal: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 12,
  },
  modalTag: { fontSize: 11, color: C.green, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  modalName: { fontSize: 18, fontWeight: '800', color: C.text, lineHeight: 24 },
  modalCloseBtn: { padding: 4 },
  modalClose: { color: C.muted, fontSize: 20 },
  modalScroll: { flex: 1 },
  priceCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.green + '44',
    padding: 20, alignItems: 'center',
  },
  priceLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  priceBig: { fontSize: 40, fontWeight: '800', color: C.green },
  priceSub: { fontSize: 13, color: C.muted, marginTop: 4 },
  detailCard: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  detailCardTitle: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  detailCardBody: { fontSize: 14, color: C.text, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statChip: { flex: 1, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700', color: C.text },
  matRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  matName: { flex: 1, fontSize: 13, color: C.text },
  matCost: { fontSize: 13, fontWeight: '600', color: C.text },
});
