import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Switch
} from 'react-native';
import api from '../api';

const OPTION_LABELS = ['Good', 'Better', 'Best'];
const TIER_KEYS = ['price_good', 'price_better', 'price_best', 'price_premium', 'price_elite'];

const emptyOption = (label) => ({
  label,
  description: '',
  items: [],
});

const emptyItem = () => ({
  description: '',
  quantity: '1',
  unit_price: '',
});

export default function NewEstimateScreen({ navigation }) {
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [notes, setNotes] = useState('');
  const [useOptions, setUseOptions] = useState(false);

  // Single-option mode
  const [singleItems, setSingleItems] = useState([emptyItem()]);

  // Multi-option mode (Good / Better / Best)
  const [options, setOptions] = useState(OPTION_LABELS.map(emptyOption));

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cusRes] = await Promise.all([api.get('/customers')]);
      setCustomers(cusRes.data.customers || cusRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadJobsForCustomer = async (customerId) => {
    try {
      const res = await api.get('/jobs', { params: { customer_id: customerId } });
      setJobs(res.data.jobs || res.data || []);
    } catch (e) {
      setJobs([]);
    }
  };

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setSelectedJob(null);
    loadJobsForCustomer(c.id);
  };

  // ── Pricebook integration ──────────────────────────────────
  const openPricebook = (targetType, optionIndex = null) => {
    navigation.navigate('PricebookMain', {
      pricebook: 'all',
      onSelect: (pbItem) => {
        if (targetType === 'single') {
          setSingleItems(prev => [...prev, {
            description: `[${pbItem.tier}] ${pbItem.description}`,
            quantity: '1',
            unit_price: String(pbItem.unit_price),
          }]);
        } else {
          // Add to specific option
          setOptions(prev => prev.map((opt, i) => {
            if (i !== optionIndex) return opt;
            return {
              ...opt,
              items: [...opt.items, {
                description: `[${pbItem.tier}] ${pbItem.description}`,
                quantity: '1',
                unit_price: String(pbItem.unit_price),
              }],
            };
          }));
        }
      },
    });
  };

  // ── Line item helpers ──────────────────────────────────────
  const updateSingleItem = (idx, field, value) => {
    setSingleItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
  };

  const removeSingleItem = (idx) => {
    setSingleItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addSingleItem = () => {
    setSingleItems(prev => [...prev, emptyItem()]);
  };

  const updateOptionItem = (optIdx, itemIdx, field, value) => {
    setOptions(prev => prev.map((opt, oi) => {
      if (oi !== optIdx) return opt;
      return {
        ...opt,
        items: opt.items.map((item, ii) =>
          ii === itemIdx ? { ...item, [field]: value } : item
        ),
      };
    }));
  };

  const removeOptionItem = (optIdx, itemIdx) => {
    setOptions(prev => prev.map((opt, oi) => {
      if (oi !== optIdx) return opt;
      return { ...opt, items: opt.items.filter((_, ii) => ii !== itemIdx) };
    }));
  };

  const addOptionItem = (optIdx) => {
    setOptions(prev => prev.map((opt, oi) =>
      oi !== optIdx ? opt : { ...opt, items: [...opt.items, emptyItem()] }
    ));
  };

  // ── Totals ────────────────────────────────────────────────
  const calcTotal = (items) => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      return sum + qty * price;
    }, 0);
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedCustomer) {
      Alert.alert('Required', 'Please select a customer');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        job_id: selectedJob?.id || null,
        type: 'estimate',
        status: 'draft',
        notes,
        tax_rate: 0.0875,
      };

      if (useOptions) {
        // Multi-option estimate
        payload.options = options
          .filter(opt => opt.items.length > 0)
          .map(opt => ({
            label: opt.label,
            description: opt.description,
            items: opt.items.map(item => ({
              description: item.description,
              quantity: parseFloat(item.quantity) || 1,
              unit_price: parseFloat(item.unit_price) || 0,
            })),
          }));

        if (payload.options.length === 0) {
          Alert.alert('Required', 'Add at least one item to an option');
          setSaving(false);
          return;
        }

        // Set totals from first non-empty option for base invoice
        const firstOpt = payload.options[0];
        const sub = firstOpt.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        payload.subtotal = sub;
        payload.tax_amount = sub * payload.tax_rate;
        payload.total = sub + payload.tax_amount;
      } else {
        // Single option estimate
        const validItems = singleItems.filter(i => i.description && i.unit_price);
        if (validItems.length === 0) {
          Alert.alert('Required', 'Add at least one line item');
          setSaving(false);
          return;
        }
        const sub = calcTotal(validItems);
        payload.subtotal = sub;
        payload.tax_amount = sub * payload.tax_rate;
        payload.total = sub + payload.tax_amount;
        payload.items = validItems.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unit_price: parseFloat(item.unit_price) || 0,
        }));
      }

      await api.post('/invoices', payload);
      Alert.alert('Saved', 'Estimate created successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save estimate');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#1abc9c" style={{ flex: 1, justifyContent: 'center' }} />;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Estimate</Text>
      </View>

      {/* Customer */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CUSTOMER *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {customers.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, selectedCustomer?.id === c.id && styles.chipActive]}
              onPress={() => selectCustomer(c)}
            >
              <Text style={[styles.chipText, selectedCustomer?.id === c.id && styles.chipTextActive]}>
                {c.first_name} {c.last_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Job (optional) */}
      {selectedCustomer && jobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LINK TO JOB (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <TouchableOpacity
              style={[styles.chip, !selectedJob && styles.chipActive]}
              onPress={() => setSelectedJob(null)}
            >
              <Text style={[styles.chipText, !selectedJob && styles.chipTextActive]}>None</Text>
            </TouchableOpacity>
            {jobs.map(j => (
              <TouchableOpacity
                key={j.id}
                style={[styles.chip, selectedJob?.id === j.id && styles.chipActive]}
                onPress={() => setSelectedJob(j)}
              >
                <Text style={[styles.chipText, selectedJob?.id === j.id && styles.chipTextActive]}>
                  #{j.job_number} {j.job_type || j.description?.substring(0, 20)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Options Toggle */}
      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Good / Better / Best Options</Text>
            <Text style={styles.toggleSub}>Present customer with 3 pricing tiers</Text>
          </View>
          <Switch
            value={useOptions}
            onValueChange={setUseOptions}
            trackColor={{ false: '#ddd', true: '#1abc9c' }}
            thumbColor={useOptions ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Line Items */}
      {!useOptions ? (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>LINE ITEMS</Text>
            <TouchableOpacity onPress={() => openPricebook('single')} style={styles.pbBtn}>
              <Text style={styles.pbBtnText}>💰 Pricebook</Text>
            </TouchableOpacity>
          </View>

          {singleItems.map((item, idx) => (
            <View key={idx} style={styles.itemCard}>
              <View style={styles.itemCardRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Description"
                  value={item.description}
                  onChangeText={v => updateSingleItem(idx, 'description', v)}
                />
                <TouchableOpacity onPress={() => removeSingleItem(idx)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.itemCardRow}>
                <TextInput
                  style={[styles.input, styles.inputSmall]}
                  placeholder="Qty"
                  value={item.quantity}
                  onChangeText={v => updateSingleItem(idx, 'quantity', v)}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.inputMid]}
                  placeholder="Unit Price"
                  value={item.unit_price}
                  onChangeText={v => updateSingleItem(idx, 'unit_price', v)}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.lineTotal}>
                  ${((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toFixed(2)}
                </Text>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={addSingleItem} style={styles.addItemBtn}>
            <Text style={styles.addItemBtnText}>+ Add Item</Text>
          </TouchableOpacity>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${calcTotal(singleItems).toFixed(2)}</Text>
          </View>
        </View>
      ) : (
        options.map((opt, optIdx) => (
          <View key={opt.label} style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.optionTitle, { color: ['#27ae60','#2980b9','#8e44ad'][optIdx] }]}>
                {['●','●','●'][optIdx]} {opt.label} Option
              </Text>
              <TouchableOpacity onPress={() => openPricebook('option', optIdx)} style={styles.pbBtn}>
                <Text style={styles.pbBtnText}>💰 Pricebook</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              placeholder={`${opt.label} option title (optional)`}
              value={opt.description}
              onChangeText={v => setOptions(prev => prev.map((o, i) => i === optIdx ? { ...o, description: v } : o))}
            />

            {opt.items.map((item, itemIdx) => (
              <View key={itemIdx} style={styles.itemCard}>
                <View style={styles.itemCardRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Description"
                    value={item.description}
                    onChangeText={v => updateOptionItem(optIdx, itemIdx, 'description', v)}
                  />
                  <TouchableOpacity onPress={() => removeOptionItem(optIdx, itemIdx)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.itemCardRow}>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    placeholder="Qty"
                    value={item.quantity}
                    onChangeText={v => updateOptionItem(optIdx, itemIdx, 'quantity', v)}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.inputMid]}
                    placeholder="Unit Price"
                    value={item.unit_price}
                    onChangeText={v => updateOptionItem(optIdx, itemIdx, 'unit_price', v)}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.lineTotal}>
                    ${((parseFloat(item.quantity)||0)*(parseFloat(item.unit_price)||0)).toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}

            <TouchableOpacity onPress={() => addOptionItem(optIdx)} style={styles.addItemBtn}>
              <Text style={styles.addItemBtnText}>+ Add Item</Text>
            </TouchableOpacity>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{opt.label} Total</Text>
              <Text style={styles.totalValue}>${calcTotal(opt.items).toFixed(2)}</Text>
            </View>
          </View>
        ))
      )}

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Internal notes or customer-facing notes..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>💾 Save Estimate</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: { backgroundColor: '#1B4F72', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  section: { backgroundColor: '#fff', margin: 12, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  optionTitle: { fontSize: 15, fontWeight: '700' },
  chipScroll: { marginHorizontal: -4 },
  chip: { backgroundColor: '#f0f2f5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 4, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#e8f8f5', borderColor: '#1abc9c' },
  chipText: { color: '#555', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#1B4F72', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  toggleSub: { fontSize: 12, color: '#888', marginTop: 2 },
  pbBtn: { backgroundColor: '#e8f8f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#1abc9c' },
  pbBtnText: { color: '#1abc9c', fontWeight: '700', fontSize: 13 },
  itemCard: { backgroundColor: '#f8f9fa', borderRadius: 8, padding: 10, marginBottom: 8 },
  itemCardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: '#fff', color: '#222' },
  inputSmall: { width: 60 },
  inputMid: { width: 110 },
  notesInput: { height: 80, textAlignVertical: 'top' },
  removeBtn: { width: 28, height: 28, backgroundColor: '#ffe0e0', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: '#e74c3c', fontWeight: '700', fontSize: 12 },
  addItemBtn: { backgroundColor: '#f0f2f5', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 },
  addItemBtnText: { color: '#1abc9c', fontWeight: '600', fontSize: 14 },
  lineTotal: { fontSize: 14, fontWeight: '700', color: '#27ae60', minWidth: 60, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  totalLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#1B4F72' },
  saveBtn: { backgroundColor: '#1abc9c', margin: 16, borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
