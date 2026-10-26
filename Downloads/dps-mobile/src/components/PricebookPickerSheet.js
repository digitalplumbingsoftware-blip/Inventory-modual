/**
 * PricebookPickerSheet
 * ServiceTitan-style pricebook picker, service-aware.
 *
 * Props:
 *   visible        {boolean}   — controls Modal visibility
 *   onClose        {function}  — called when user dismisses
 *   onPick         {function}  — (item) => void   single-select (InvoiceDetail)
 *   onPickMultiple {function}  — (items[]) => void  multi-select (EstimateDetail / NewEstimate)
 *   calcPrice      {function}  — optional (task) => number override; falls back to engine
 *
 * Now shows every service enabled in company settings (plumbing, hvac, electrical,
 * restoration, renovations, pest_control, pools) plus their sub-books
 * (install/service, dryout/removal/rebuild, etc.). Categories are pulled per
 * (service, service_type) from the backend.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, ScrollView, SafeAreaView,
  Dimensions, Platform,
} from 'react-native';
import {
  getPBEngine, getPBTasks, getPBCategories, getEnabledServices,
} from '../services/api';

// ── Sub-pricebooks per service (mirrors desktop SUBBOOKS_BY_SERVICE) ─────────
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

// ── Engine price calc (mirrors desktop calcFlatRate) ─────────────────────────
function calcFlatRate(task, engine) {
  const E = engine || {};

  // Subcontractor shortcut: price = sub_cost / (1 - sub_gp/100) so the shop
  // retains sub_gp% as gross profit on the sub pass-through.
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

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - 32 - CARD_GAP) / 2;

// ── Main component ────────────────────────────────────────────────────────────
export default function PricebookPickerSheet({ visible, onClose, onPick, onPickMultiple, calcPrice }) {
  const multiMode = typeof onPickMultiple === 'function';

  // Service state
  const [enabledServices, setEnabledServices] = useState(['plumbing']);
  const [service, setService]         = useState('plumbing');
  const [serviceType, setServiceType] = useState('install');

  // Category / task state
  const [cats, setCats]             = useState([]);
  const [step, setStep]             = useState('cats');   // 'cats' | 'tasks'
  const [selCat, setSelCat]         = useState(null);
  // When drilling into a parent category we remember it so Back pops to the siblings.
  const [parentCat, setParentCat]   = useState(null);
  const [engine, setEngine]         = useState(null);
  const [tasks, setTasks]           = useState([]);
  const [loadingCats, setLoadingCats]   = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [search, setSearch]         = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [cart, setCart]             = useState({});
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  const cartCount = Object.values(cart).reduce((s, v) => s + v.qty, 0);
  const subbooks = SUBBOOKS_BY_SERVICE[service] || SUBBOOKS_BY_SERVICE.plumbing;
  const activeBook = subbooks.find(b => b.service_type === serviceType) || subbooks[0];
  const currentCat = cats.find(c => c.id === selCat);

  // Load enabled services on first open
  useEffect(() => {
    if (!visible) return;
    getEnabledServices()
      .then(list => {
        const arr = Array.isArray(list) && list.length ? list : ['plumbing'];
        setEnabledServices(arr);
        if (!arr.includes(service)) {
          const first = arr[0];
          setService(first);
          setServiceType((SUBBOOKS_BY_SERVICE[first] || [])[0]?.service_type || 'service');
        }
      })
      .catch(() => {});
  }, [visible]);

  // Snap sub-book when service changes
  useEffect(() => {
    const books = SUBBOOKS_BY_SERVICE[service] || [];
    if (!books.find(b => b.service_type === serviceType)) {
      setServiceType(books[0]?.service_type || 'service');
    }
  }, [service]);

  // Load engine + categories when (service, service_type) or sheet opens
  useEffect(() => {
    if (!visible) return;
    getPBEngine({ service, service_type: serviceType })
      .then(setEngine)
      .catch(() => {});
    setLoadingCats(true);
    getPBCategories({ service, service_type: serviceType })
      .then(rows => setCats(Array.isArray(rows) ? rows : []))
      .catch(() => setCats([]))
      .finally(() => setLoadingCats(false));
    // reset drill-in when switching book
    setStep('cats'); setSelCat(null); setParentCat(null); setTasks([]);
  }, [visible, service, serviceType]);

  // Reset when sheet closes
  useEffect(() => {
    if (!visible) {
      setStep('cats'); setSelCat(null); setParentCat(null); setTasks([]);
      setSearch(''); setSearchResults([]); setCart({});
    } else {
      setTimeout(() => searchRef.current?.focus(), 300);
    }
  }, [visible]);

  // Load tasks when category selected
  useEffect(() => {
    if (!selCat) return;
    setLoadingTasks(true);
    getPBTasks({ service, service_type: serviceType, category: selCat })
      .then(d => setTasks(Array.isArray(d) ? d : []))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [selCat, service, serviceType]);

  // Debounced search (scoped to current service+book)
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      getPBTasks({ service, service_type: serviceType, search: q })
        .then(d => setSearchResults(Array.isArray(d) ? d : []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [search, service, serviceType]);

  const getPrice = useCallback((task) => {
    if (calcPrice) return calcPrice(task);
    if (engine) return calcFlatRate(task, engine);
    return 0;
  }, [calcPrice, engine]);

  const toggleCart = (task) => {
    const price = getPrice(task);
    setCart(prev => {
      if (prev[task.id]) {
        const next = { ...prev }; delete next[task.id]; return next;
      }
      return { ...prev, [task.id]: { task, qty: 1, price } };
    });
  };

  const adjustQty = (taskId, delta) => {
    setCart(prev => {
      const entry = prev[taskId];
      if (!entry) return prev;
      const newQty = entry.qty + delta;
      if (newQty <= 0) { const next = { ...prev }; delete next[taskId]; return next; }
      return { ...prev, [taskId]: { ...entry, qty: newQty } };
    });
  };

  const handleDone = async () => {
    if (multiMode) {
      const items = Object.values(cart).map(({ task, qty, price }) => ({
        description: task.name,
        flat_rate: price,
        quantity: qty,
        task_id: task.id,
        tag: task.tag,
        // Scope of work — falls back to the task's own description if notes are empty
        notes: task.notes || task.description || '',
      }));
      await onPickMultiple(items);
    }
    onClose();
  };

  const handleSinglePick = (task) => {
    const price = getPrice(task);
    if (multiMode) {
      toggleCart(task);
    } else {
      onPick({
        description: task.name, flat_rate: price, quantity: 1,
        task_id: task.id, tag: task.tag,
        notes: task.notes || task.description || '',
      });
      onClose();
    }
  };

  const goBack = () => {
    // If we're inside a parent category, go back up to the top-level list.
    if (parentCat) { setParentCat(null); setSelCat(null); setTasks([]); setStep('cats'); return; }
    setStep('cats'); setSelCat(null); setTasks([]);
  };
  // Tapping a category: if it has children, drill into them; otherwise show its tasks.
  const pickCat = (cat) => {
    const kids = (cats || []).filter(c => c.parent_id === cat.id);
    if (kids.length > 0) { setParentCat(cat); return; }
    setSelCat(cat.id); setStep('tasks');
  };

  const isSearching = !!search.trim();

  // Category card — uses backend category color/icon; falls back to a book-tinted color.
  const renderCatCard = ({ item: cat }) => {
    const color = cat.color || activeBook.color || '#1F7A8C';
    const kidCount = (cats || []).filter(c => c.parent_id === cat.id).length;
    return (
      <TouchableOpacity
        onPress={() => pickCat(cat)}
        activeOpacity={0.85}
        style={[S.catCard, { backgroundColor: color }]}
      >
        <View style={S.catCardOverlay} />
        <Text style={S.catCardEmoji}>{cat.icon || '📦'}</Text>
        <View style={S.catCardBottom}>
          <View style={{ flex: 1 }}>
            <Text style={S.catCardName}>{cat.name}</Text>
            {kidCount > 0
              ? <Text style={S.catCardCount}>{kidCount} subcategor{kidCount===1?'y':'ies'}</Text>
              : (cat.task_count ? <Text style={S.catCardCount}>{cat.task_count} tasks</Text> : null)}
          </View>
          <Text style={S.catCardChevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTaskCard = ({ item: task }) => {
    const price = getPrice(task);
    const cartEntry = cart[task.id];
    const cat = cats.find(c => c.id === task.category_id) || { color: activeBook.color, icon: '🔧' };

    return (
      <View style={S.taskCard}>
        <View style={[S.taskCardIcon, { backgroundColor: (cat.color || '#1F7A8C') + '22' }]}>
          <Text style={S.taskCardIconEmoji}>{cat.icon || '🔧'}</Text>
        </View>
        <Text style={S.taskCardName} numberOfLines={2}>{task.name}</Text>
        {task.tag ? <Text style={S.taskCardTag}>{task.tag}</Text> : null}
        {(task.notes || task.description) ? (
          <Text style={S.taskCardDesc} numberOfLines={3}>{task.notes || task.description}</Text>
        ) : null}
        <View style={S.taskCardFooter}>
          <Text style={S.taskCardPrice}>{fmt(price)}</Text>
          {cartEntry ? (
            <View style={S.stepperRow}>
              <TouchableOpacity onPress={() => adjustQty(task.id, -1)} style={S.stepBtn}>
                <Text style={S.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={S.stepQty}>{cartEntry.qty}</Text>
              <TouchableOpacity onPress={() => adjustQty(task.id, 1)} style={S.stepBtn}>
                <Text style={S.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => handleSinglePick(task)} style={S.addCircle}>
              <Text style={S.addCircleText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={S.sheet}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={S.header}>
          {step === 'tasks' && !isSearching ? (
            <TouchableOpacity onPress={goBack} style={S.backBtn}>
              <Text style={S.backBtnText}>← Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 70 }} />
          )}

          <View style={{ flex: 1, alignItems: 'center' }}>
            {step === 'tasks' && currentCat && !isSearching ? (
              <>
                <Text style={S.breadcrumb} onPress={goBack}>
                  {activeBook.label} › <Text style={S.breadcrumbActive}>{currentCat.name}</Text>
                </Text>
                <Text style={S.headerTitle}>{currentCat.icon || ''} {currentCat.name}</Text>
              </>
            ) : (
              <>
                <Text style={S.breadcrumb}>{activeBook.icon} {activeBook.label}</Text>
                <Text style={S.headerTitle}>💲 Select a Task</Text>
              </>
            )}
          </View>

          {multiMode && cartCount > 0 ? (
            <TouchableOpacity onPress={handleDone} style={S.doneBtn}>
              <Text style={S.doneBtnText}>Done ({cartCount})</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose} style={S.closeBtn}>
              <Text style={S.closeBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Service picker (only when >1 enabled) ─────────────── */}
        {enabledServices.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={S.svcScroll}
            contentContainerStyle={S.svcContent}
          >
            {enabledServices.map(svc => {
              const meta = SERVICE_META[svc] || { label: svc, icon:'▪', color:'#666' };
              const on = svc === service;
              return (
                <TouchableOpacity
                  key={svc}
                  onPress={() => { setService(svc); setSearch(''); }}
                  style={[S.svcPill, on && { backgroundColor: meta.color + '22', borderColor: meta.color, borderWidth: 2 }]}
                >
                  <Text style={S.svcPillIcon}>{meta.icon}</Text>
                  <Text style={[S.svcPillText, { color: on ? meta.color : '#111' }]} numberOfLines={1}>
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Sub-book pills (only when >1 in this service) ─────── */}
        {subbooks.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={S.subScroll}
            contentContainerStyle={S.subContent}
          >
            {subbooks.map(b => {
              const on = b.service_type === serviceType;
              return (
                <TouchableOpacity
                  key={b.service_type}
                  onPress={() => { setServiceType(b.service_type); setSearch(''); }}
                  style={[S.subPill, on && { backgroundColor: b.color + '22', borderColor: b.color, borderWidth: 2 }]}
                >
                  <Text style={S.subPillIcon}>{b.icon}</Text>
                  <Text style={[S.subPillText, { color: on ? b.color : '#111' }]} numberOfLines={1}>{b.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Search bar ──────────────────────────────────────────── */}
        <View style={S.searchWrap}>
          <Text style={S.searchIcon}>🔍</Text>
          <TextInput
            ref={searchRef}
            style={S.searchInput}
            placeholder={`Search ${activeBook.label}…`}
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>

        {/* ── Content ─────────────────────────────────────────────── */}
        {isSearching ? (
          searching ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 48 }} />
          ) : searchResults.length === 0 ? (
            <View style={S.empty}>
              <Text style={S.emptyText}>No tasks found for "{search}" in {activeBook.label}</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={t => String(t.id)}
              renderItem={renderTaskCard}
              numColumns={2}
              columnWrapperStyle={S.taskGrid}
              contentContainerStyle={S.listPad}
              showsVerticalScrollIndicator={false}
            />
          )
        ) : step === 'cats' ? (
          loadingCats ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 48 }} />
          ) : cats.length === 0 ? (
            <View style={S.empty}>
              <Text style={S.emptyText}>No categories yet for {activeBook.label}.</Text>
            </View>
          ) : (() => {
            // Top-level view: hide children (categories whose parent_id matches another id in the list).
            // Drill-in view: show only the active parent's children.
            const scoped = parentCat
              ? cats.filter(c => c.parent_id === parentCat.id)
              : cats.filter(c => !c.parent_id || !cats.some(p => p.id === c.parent_id));
            return (
              <>
                {parentCat && (
                  <TouchableOpacity onPress={() => setParentCat(null)}
                    style={{ flexDirection:'row', alignItems:'center', gap:8, padding:'10px 16px' }}>
                    <Text style={{ color:'#2563eb', fontWeight:'700', fontSize:14 }}>← All categories</Text>
                    <Text style={{ color:'#111', fontWeight:'800', fontSize:14 }}>· {parentCat.icon || ''} {parentCat.name}</Text>
                  </TouchableOpacity>
                )}
                <FlatList
                  data={scoped}
                  keyExtractor={c => String(c.id)}
                  renderItem={renderCatCard}
                  numColumns={2}
                  columnWrapperStyle={S.catGrid}
                  contentContainerStyle={S.listPad}
                  showsVerticalScrollIndicator={false}
                />
              </>
            );
          })()
        ) : (
          loadingTasks || !engine ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 48 }} />
          ) : tasks.length === 0 ? (
            <View style={S.empty}>
              <Text style={S.emptyText}>No tasks in this category</Text>
            </View>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={t => String(t.id)}
              renderItem={renderTaskCard}
              numColumns={2}
              columnWrapperStyle={S.taskGrid}
              contentContainerStyle={[S.listPad, multiMode && cartCount > 0 && { paddingBottom: 90 }]}
              showsVerticalScrollIndicator={false}
            />
          )
        )}

        {/* ── Sticky cart bar ─────────────────────────────────────── */}
        {multiMode && cartCount > 0 && (
          <View style={S.cartBar}>
            <Text style={S.cartBarLabel}>{cartCount} item{cartCount !== 1 ? 's' : ''} selected</Text>
            <TouchableOpacity onPress={handleDone} style={S.cartBarBtn}>
              <Text style={S.cartBarBtnText}>✓ Add to Estimate</Text>
            </TouchableOpacity>
          </View>
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#f5f6fa' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: {
    backgroundColor: '#f0f2f5', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, width: 70,
  },
  backBtnText: { color: '#333', fontWeight: '600', fontSize: 13 },
  breadcrumb: { fontSize: 11, color: '#888', marginBottom: 2 },
  breadcrumbActive: { color: '#333', fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111', textAlign: 'center' },
  doneBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7, width: 90, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  closeBtn: {
    backgroundColor: '#f0f2f5', borderRadius: 20, width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginLeft: 'auto',
  },
  closeBtnText: { color: '#666', fontSize: 16, fontWeight: '600' },

  // Service picker — big chunky pills
  svcScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', flexGrow: 0, height: 74 },
  svcContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 10, alignItems: 'center' },
  svcPill: {
    height: 50, paddingHorizontal: 20, borderRadius: 25,
    backgroundColor: '#eef1f6', borderWidth: 2, borderColor: '#c9d0da',
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  svcPillIcon: { fontSize: 20, lineHeight: 24 },
  svcPillText: { color: '#111', fontSize: 16, fontWeight: '800', lineHeight: 20 },

  // Sub-book pills
  subScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', flexGrow: 0, height: 70 },
  subContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 10, alignItems: 'center' },
  subPill: {
    height: 50, paddingHorizontal: 18, borderRadius: 25,
    backgroundColor: '#eef1f6', borderWidth: 2, borderColor: '#c9d0da',
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  subPillIcon: { fontSize: 18, lineHeight: 22 },
  subPillText: { color: '#111', fontSize: 15, fontWeight: '800', lineHeight: 20 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 12, borderRadius: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0e0e0', height: 44,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },

  // Category grid — flex sizing so cards work at any screen/modal width.
  listPad: { padding: 16, paddingTop: 4 },
  catGrid: { gap: CARD_GAP, marginBottom: CARD_GAP },
  catCard: {
    flex: 1, aspectRatio: 4/3,
    borderRadius: 16, overflow: 'hidden',
    justifyContent: 'space-between', padding: 12,
    minHeight: 110,
  },
  catCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 16,
  },
  catCardEmoji: { fontSize: 36, textAlign: 'center', marginTop: 8, zIndex: 1 },
  catCardBottom: { flexDirection: 'row', alignItems: 'flex-end', zIndex: 1 },
  catCardName: {
    color: '#fff', fontWeight: '800', fontSize: 13, lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  catCardCount: { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 },
  catCardChevron: { color: 'rgba(255,255,255,0.85)', fontSize: 22, fontWeight: '300', lineHeight: 22 },

  // Task grid — flex sizing so cards fit any modal width without clipping.
  taskGrid: { gap: CARD_GAP, marginBottom: CARD_GAP },
  taskCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    minHeight: 160,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
    }),
  },
  taskCardIcon: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  taskCardIconEmoji: { fontSize: 26 },
  taskCardName: {
    fontSize: 13, fontWeight: '700', color: '#111',
    lineHeight: 18, marginBottom: 2, minHeight: 36,
  },
  taskCardTag: { fontSize: 10, color: '#888', marginBottom: 6, fontWeight: '500' },
  taskCardDesc: { fontSize: 11, color: '#555', lineHeight: 15, marginBottom: 8 },
  taskCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  taskCardPrice: { fontSize: 15, fontWeight: '800', color: '#2563eb' },

  addCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
  addCircleText: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { color: '#333', fontSize: 16, fontWeight: '700', lineHeight: 20 },
  stepQty: { fontSize: 14, fontWeight: '700', color: '#111', minWidth: 16, textAlign: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  cartBarLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  cartBarBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  cartBarBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
