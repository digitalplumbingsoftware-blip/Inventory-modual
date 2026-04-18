import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, ScrollView, Modal
} from 'react-native';
import api from '../api';

const TIER_LABELS = ['Good', 'Better', 'Best', 'Premium', 'Elite'];
const TIER_KEYS = ['price_good', 'price_better', 'price_best', 'price_premium', 'price_elite'];
const TIER_COLORS = ['#27ae60', '#2980b9', '#8e44ad', '#e67e22', '#c0392b'];

export default function PricebookScreen({ route, navigation }) {
  // If opened from NewEstimate, onSelect callback is passed
  const onSelect = route?.params?.onSelect || null;
  const pricebookFilter = route?.params?.pricebook || 'all'; // 'residential'|'commercial'|'all'

  const [tab, setTab] = useState('residential');
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [expandedCats, setExpandedCats] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { pricebook: tab };
      if (search.length > 1) params.search = search;
      const res = await api.get('/pricebook', { params });
      setCategories(res.data.categories || []);
      // Auto-expand first category
      if (res.data.categories?.length > 0 && !search) {
        setExpandedCats({ [res.data.categories[0].id]: true });
      } else if (search) {
        // Auto-expand all when searching
        const expanded = {};
        res.data.categories.forEach(c => { expanded[c.id] = true; });
        setExpandedCats(expanded);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const timer = setTimeout(fetchData, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const toggleCat = (id) => {
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleItemPress = (item) => {
    if (onSelect) {
      // Picker mode: show detail with tier selection
      setSelectedItem(item);
      setDetailVisible(true);
    } else {
      // Browse mode: show full detail
      setSelectedItem(item);
      setDetailVisible(true);
    }
  };

  const handleTierSelect = (item, tierIdx) => {
    if (onSelect) {
      onSelect({
        description: item.name,
        unit_price: parseFloat(item[TIER_KEYS[tierIdx]]) || 0,
        quantity: 1,
        pricebook_code: item.code,
        tier: TIER_LABELS[tierIdx],
      });
      setDetailVisible(false);
      navigation.goBack();
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.itemRow} onPress={() => handleItemPress(item)}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemCode}>{item.code}</Text>
        <Text style={styles.itemName}>{item.name}</Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemPrice}>${parseFloat(item.price_good || 0).toFixed(0)}+</Text>
        {onSelect && <Text style={styles.selectHint}>Tap to add</Text>}
      </View>
    </TouchableOpacity>
  );

  const renderCategory = ({ item: cat }) => (
    <View style={styles.categoryBlock}>
      <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCat(cat.id)}>
        <Text style={styles.categoryName}>{cat.name}</Text>
        <View style={styles.catRight}>
          <Text style={styles.catCount}>{cat.items?.length || 0} items</Text>
          <Text style={styles.chevron}>{expandedCats[cat.id] ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>
      {expandedCats[cat.id] && (
        <FlatList
          data={cat.items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 Pricebook</Text>
        {onSelect && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['residential', 'commercial'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => { setTab(t); setSearch(''); }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'residential' ? '🏠 Residential' : '🏢 Commercial'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search jobs, codes, descriptions..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color="#1abc9c" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={c => c.id}
          renderItem={renderCategory}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No results found</Text>
          }
        />
      )}

      {/* Item Detail Modal */}
      <Modal
        visible={detailVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailVisible(false)}
      >
        {selectedItem && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalCode}>{selectedItem.code}</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalName}>{selectedItem.name}</Text>
              <Text style={styles.modalCategory}>{selectedItem.category}</Text>

              {/* Description */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Scope of Work</Text>
                <Text style={styles.modalDesc}>{selectedItem.description}</Text>
              </View>

              {/* Details row */}
              <View style={styles.detailsRow}>
                <View style={styles.detailChip}>
                  <Text style={styles.detailLabel}>Labor</Text>
                  <Text style={styles.detailValue}>{selectedItem.labor_hours}h</Text>
                </View>
                {selectedItem.warranty_t1_t2 && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailLabel}>Warranty T1-2</Text>
                    <Text style={styles.detailValue}>{selectedItem.warranty_t1_t2} mo</Text>
                  </View>
                )}
                {selectedItem.warranty_t3_t5 && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailLabel}>Warranty T3-5</Text>
                    <Text style={styles.detailValue}>{selectedItem.warranty_t3_t5} mo</Text>
                  </View>
                )}
                {selectedItem.taxable && (
                  <View style={styles.detailChip}>
                    <Text style={styles.detailLabel}>Taxable</Text>
                    <Text style={styles.detailValue}>Yes</Text>
                  </View>
                )}
              </View>

              {/* Pricing Tiers */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  {onSelect ? 'Select Tier to Add' : 'Pricing Tiers'}
                </Text>
                {TIER_LABELS.map((label, i) => {
                  const price = selectedItem[TIER_KEYS[i]];
                  if (!price) return null;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.tierRow, onSelect && styles.tierRowSelectable]}
                      onPress={() => onSelect && handleTierSelect(selectedItem, i)}
                      activeOpacity={onSelect ? 0.7 : 1}
                    >
                      <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[i] }]}>
                        <Text style={styles.tierBadgeText}>{label}</Text>
                      </View>
                      <Text style={styles.tierPrice}>${parseFloat(price).toFixed(2)}</Text>
                      {onSelect && <Text style={styles.tierAdd}>+ Add</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1B4F72', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  cancelText: { color: '#fff', fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1abc9c' },
  tabText: { color: '#888', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#1B4F72' },
  searchRow: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchInput: {
    backgroundColor: '#f0f2f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#222',
  },
  list: { padding: 12, paddingBottom: 40 },
  categoryBlock: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderBottomColor: '#eee' },
  categoryName: { fontSize: 15, fontWeight: '700', color: '#1B4F72', flex: 1 },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catCount: { fontSize: 12, color: '#999' },
  chevron: { fontSize: 12, color: '#888' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  itemLeft: { flex: 1, marginRight: 8 },
  itemCode: { fontSize: 11, color: '#1abc9c', fontWeight: '600', marginBottom: 2 },
  itemName: { fontSize: 14, color: '#333', fontWeight: '500' },
  itemRight: { alignItems: 'flex-end' },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#27ae60' },
  selectHint: { fontSize: 11, color: '#aaa', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 16 },
  // Modal
  modal: { flex: 1, backgroundColor: '#f5f6fa' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1B4F72', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  modalCode: { color: '#1abc9c', fontSize: 14, fontWeight: '700' },
  modalClose: { color: '#fff', fontSize: 22, fontWeight: '300' },
  modalScroll: { flex: 1 },
  modalName: { fontSize: 20, fontWeight: '700', color: '#1B4F72', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  modalCategory: { fontSize: 13, color: '#888', paddingHorizontal: 20, marginBottom: 16 },
  modalSection: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  modalSectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  modalDesc: { fontSize: 14, color: '#444', lineHeight: 20 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  detailChip: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  detailLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#1B4F72' },
  tierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  tierRowSelectable: { backgroundColor: '#fafafa', borderRadius: 8, marginBottom: 4, paddingHorizontal: 8 },
  tierBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginRight: 12 },
  tierBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tierPrice: { flex: 1, fontSize: 16, fontWeight: '700', color: '#222' },
  tierAdd: { fontSize: 13, color: '#1abc9c', fontWeight: '600' },
});
