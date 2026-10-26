import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { startCountBlock, getCount, saveCount } from '../services/api';
import { useCycleCounts } from '../hooks/useCycleCounts';

export default function CycleCountScreen({ route, navigation }) {
  const { blockId } = route.params;
  const { refresh } = useCycleCounts();
  const [count, setCount]     = useState(null);
  const [items, setItems]     = useState([]);   // { id, name, sku, expected_qty, actual: string }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { count_id } = await startCountBlock(blockId);
        const c = await getCount(count_id);
        setCount(c);
        setItems((c.items || []).map(i => ({ ...i, actual: i.actual_qty == null ? '' : String(i.actual_qty) })));
        refresh(); // block is now "in progress"
      } catch (e) {
        Alert.alert('Could not open count', e.response?.data?.error || e.message);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [blockId]);

  const setActual = (id, val) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, actual: val.replace(/[^0-9]/g, '') } : i));

  const bump = (id, delta) =>
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const base = i.actual === '' ? (i.expected_qty || 0) : parseInt(i.actual, 10);
      return { ...i, actual: String(Math.max(0, base + delta)) };
    }));

  const counted   = items.filter(i => i.actual !== '').length;
  const variances = items.filter(i => i.actual !== '' && parseInt(i.actual, 10) !== (i.expected_qty || 0));

  const payload = () => items.map(i => ({ id: i.id, actual_qty: i.actual === '' ? null : parseInt(i.actual, 10) }));

  const save = async (complete) => {
    setSaving(true);
    try {
      await saveCount(count.id, { status: complete ? 'completed' : 'in_progress', items: payload() });
      if (complete) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Save failed', e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmComplete = () => {
    const missing = items.length - counted;
    const lines = [
      missing ? `${missing} item${missing !== 1 ? 's' : ''} not counted — they'll keep their current quantity.` : null,
      variances.length ? `${variances.length} item${variances.length !== 1 ? 's' : ''} differ from expected. Truck stock will be updated.` : 'Everything matches expected stock.',
    ].filter(Boolean);
    Alert.alert('Submit count?', lines.join('\n\n'), [
      { text: 'Keep counting', style: 'cancel' },
      { text: 'Submit', onPress: () => save(true) },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.green} size="large"/></View>;
  }

  const renderItem = ({ item }) => {
    const diff = item.actual === '' ? null : parseInt(item.actual, 10) - (item.expected_qty || 0);
    const diffColor = diff == null || diff === 0 ? C.muted : diff < 0 ? C.red : C.green;
    return (
      <View style={[s.row, diff ? { borderColor: diffColor + '66' } : null]}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          <Text style={s.sku}>{item.sku || '—'} · expected {item.expected_qty || 0}</Text>
          {diff ? <Text style={[s.diff, { color: diffColor }]}>{diff > 0 ? `+${diff}` : diff} vs expected</Text> : null}
        </View>
        <TouchableOpacity style={s.stepBtn} onPress={() => bump(item.id, -1)}><Text style={s.stepText}>−</Text></TouchableOpacity>
        <TextInput
          style={s.qtyInput}
          value={item.actual}
          onChangeText={v => setActual(item.id, v)}
          keyboardType="number-pad"
          placeholder="qty"
          placeholderTextColor={C.dim}
          selectTextOnFocus
        />
        <TouchableOpacity style={s.stepBtn} onPress={() => bump(item.id, 1)}><Text style={s.stepText}>+</Text></TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{count?.location_name || 'Cycle Count'}</Text>
        <Text style={s.headerSub}>{counted}/{items.length} counted · enter what's actually on hand</Text>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${items.length ? Math.round(counted / items.length * 100) : 0}%` }]}/>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={s.empty}>No items are stocked at this location.</Text>}
      />

      <View style={s.footer}>
        <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => save(false)} disabled={saving}>
          <Text style={s.btnGhostText}>Save & Finish Later</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnPrimary, saving && { opacity: 0.6 }]} onPress={confirmComplete} disabled={saving}>
          {saving ? <ActivityIndicator color="#04130b"/> : <Text style={s.btnPrimaryText}>Submit Count</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  header:        { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:   { fontSize: 17, fontWeight: '800', color: C.text },
  headerSub:     { fontSize: 12, color: C.muted, marginTop: 2 },
  progressTrack: { height: 4, backgroundColor: C.surface2, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: C.green },

  list:  { padding: 12, paddingBottom: 24 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40 },

  row:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 },
  name:     { fontSize: 14, fontWeight: '700', color: C.text },
  sku:      { fontSize: 11, color: C.muted, marginTop: 2 },
  diff:     { fontSize: 11, fontWeight: '700', marginTop: 3 },
  stepBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border2, justifyContent: 'center', alignItems: 'center' },
  stepText: { fontSize: 20, color: C.text, lineHeight: 22 },
  qtyInput: { width: 56, height: 40, marginHorizontal: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface2, color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },

  footer:         { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: '#080b10' },
  btn:            { flex: 1, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  btnGhost:       { borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface },
  btnGhostText:   { color: C.text, fontWeight: '700', fontSize: 14 },
  btnPrimary:     { backgroundColor: C.green },
  btnPrimaryText: { color: '#04130b', fontWeight: '800', fontSize: 15 },
});
