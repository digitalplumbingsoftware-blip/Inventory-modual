import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, PanResponder,
} from 'react-native';
import dayjs from 'dayjs';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import api from '../services/api';

export default function EstimateDetailScreen({ route, navigation }) {
  const { estimateId } = route.params;
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const [saving, setSaving] = useState(false);

  // Signature pad state
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/invoices/' + estimateId);
      setEstimate(res.data);
      // Pre-select already selected option
      if (res.data.options) {
        const sel = res.data.options.find(o => o.selected);
        if (sel) setSelectedOption(sel);
      }
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [estimateId]);

  useEffect(() => { load(); }, [load]);

  const isApproved = estimate?.status === 'approved';

  const handleApprove = () => {
    if (!selectedOption && estimate?.options?.length > 0) {
      Alert.alert('Select Option', 'Please select Good, Better, or Best before approving.');
      return;
    }
    setShowSignature(true);
  };

  const approve = async (signatureData) => {
    setSaving(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await api.post('/api/invoices/' + estimateId + '/approve', {
        option_id: selectedOption?.id || null,
        signature_data: signatureData,
      });
      setShowSignature(false);
      Alert.alert('Approved!', 'Estimate approved and invoice created.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch(e) {
      Alert.alert('Error', 'Could not approve estimate');
    } finally { setSaving(false); }
  };

  // Simple canvas-based signature pad
  const SignaturePad = ({ onDone, onCancel }) => {
    const [sigPaths, setSigPaths] = useState([]);
    const [drawing, setDrawing] = useState(false);
    const [curPath, setCurPath] = useState('');

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setCurPath(`M ${locationX} ${locationY}`);
        setDrawing(true);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setCurPath(p => p + ` L ${locationX} ${locationY}`);
      },
      onPanResponderRelease: () => {
        setSigPaths(p => [...p, curPath]);
        setCurPath('');
        setDrawing(false);
      },
    });

    const clear = () => { setSigPaths([]); setCurPath(''); };
    const done = () => {
      if (sigPaths.length === 0) { Alert.alert('Sign Please', 'Please sign before approving.'); return; }
      onDone(JSON.stringify(sigPaths));
    };

    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet">
        <View style={sig.container}>
          <Text style={sig.title}>Customer Signature</Text>
          <Text style={sig.sub}>Customer signs below to approve the estimate</Text>
          <View style={sig.padContainer} {...panResponder.panHandlers}>
            <View style={sig.pad}>
              {sigPaths.map((path, i) => (
                <View key={i} style={{ position:'absolute', top:0, left:0, right:0, bottom:0, pointerEvents:'none' }}>
                  {/* SVG-like path rendering via simple View - simplified */}
                </View>
              ))}
              {(sigPaths.length > 0 || curPath) && (
                <Text style={{ color: C.muted, textAlign:'center', marginTop: 120 }}>
                  {sigPaths.length} stroke{sigPaths.length !== 1 ? 's' : ''} captured
                </Text>
              )}
              {sigPaths.length === 0 && !curPath && (
                <Text style={sig.placeholder}>Sign here</Text>
              )}
            </View>
          </View>
          <View style={sig.actions}>
            <TouchableOpacity style={sig.clearBtn} onPress={clear}>
              <Text style={sig.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sig.cancelBtn} onPress={onCancel}>
              <Text style={sig.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sig.approveBtn} onPress={done} disabled={saving}>
              <Text style={sig.approveBtnText}>{saving ? 'Saving...' : 'Approve & Sign'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={C.green} size="large"/></View>;
  if (!estimate) return <View style={styles.center}><Text style={{ color: C.muted }}>Not found</Text></View>;

  const options = (estimate.options || []).sort((a,b) => a.sort_order - b.sort_order);
  const hasOptions = options.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Header */}
      <View style={[styles.header, { borderColor: isApproved ? C.green+'44' : C.blue+'44', backgroundColor: isApproved ? C.green+'0d' : C.blue+'0d' }]}>
        <View>
          <Text style={styles.customer}>{estimate.customer_name}</Text>
          <Text style={styles.meta}>Estimate #{estimate.invoice_number} · {dayjs(estimate.created_at).format('MMM D, YYYY')}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isApproved ? C.green+'22' : C.blue+'22', borderColor: isApproved ? C.green : C.blue }]}>
          <Text style={[styles.statusText, { color: isApproved ? C.green : C.blue }]}>
            {estimate.status?.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Options: Good / Better / Best */}
      {hasOptions && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SELECT OPTION</Text>
          <View style={styles.optionsGrid}>
            {options.map(opt => {
              const isSelected = selectedOption?.id === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionCard, isSelected && styles.optionCardSelected, isApproved && opt.selected && styles.optionCardApproved]}
                  onPress={() => !isApproved && setSelectedOption(opt)}
                  activeOpacity={isApproved ? 1 : 0.7}
                >
                  <Text style={[styles.optionLabel, isSelected && { color: C.green }]}>{opt.label}</Text>
                  {opt.description && <Text style={styles.optionDesc}>{opt.description}</Text>}
                  <Text style={[styles.optionPrice, isSelected && { color: C.green }]}>${parseFloat(opt.total||0).toFixed(2)}</Text>
                  {(opt.selected || isSelected) && (
                    <View style={styles.selectedCheck}><Text style={{ color: C.green, fontWeight:'800' }}>✓</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Base line items (no options) */}
      {!hasOptions && estimate.line_items && estimate.line_items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LINE ITEMS</Text>
          <View style={styles.card}>
            {estimate.line_items.map((item, i) => (
              <View key={i} style={[styles.lineItem, i < estimate.line_items.length-1 && styles.lineItemBorder]}>
                <View style={{ flex:1 }}>
                  <Text style={styles.lineItemName}>{item.description}</Text>
                  <Text style={styles.lineItemQty}>{item.quantity} x ${parseFloat(item.unit_price).toFixed(2)}</Text>
                </View>
                <Text style={styles.lineItemTotal}>${(item.quantity * item.unit_price).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Total */}
      <View style={styles.card}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalVal}>${parseFloat(estimate.subtotal||0).toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tax</Text>
          <Text style={styles.totalVal}>${parseFloat(estimate.tax_amount||0).toFixed(2)}</Text>
        </View>
        <View style={[styles.totalRow, styles.totalFinal]}>
          <Text style={styles.totalFinalLabel}>TOTAL</Text>
          <Text style={styles.totalFinalVal}>${parseFloat(estimate.total||0).toFixed(2)}</Text>
        </View>
      </View>

      {/* Signature info if approved */}
      {isApproved && estimate.signed_at && (
        <View style={[styles.card, { borderColor: C.green+'44', backgroundColor: C.green+'08' }]}>
          <Text style={{ color: C.green, fontWeight:'700', fontSize:14 }}>✓ Signed & Approved</Text>
          <Text style={{ color: C.muted, fontSize:12, marginTop:4 }}>
            {dayjs(estimate.signed_at).format('MMM D, YYYY [at] h:mm A')}
          </Text>
          {estimate.converted_invoice_id && (
            <Text style={{ color: C.muted, fontSize:12, marginTop:2 }}>Invoice created automatically</Text>
          )}
        </View>
      )}

      {/* Approve button */}
      {!isApproved && (
        <TouchableOpacity style={styles.approveBtn} onPress={handleApprove}>
          <Text style={styles.approveBtnText}>✍️  Customer Approve & Sign</Text>
        </TouchableOpacity>
      )}

      {showSignature && (
        <SignaturePad
          onDone={approve}
          onCancel={() => setShowSignature(false)}
        />
      )}

      <View style={{ height: 40 }}/>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg },
  center: { flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center' },
  header: { borderRadius:14, borderWidth:1.5, padding:16, flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' },
  customer: { fontSize:20, fontWeight:'800', color:C.text },
  meta: { fontSize:12, color:C.muted, marginTop:4 },
  statusBadge: { borderWidth:1.5, borderRadius:8, paddingHorizontal:12, paddingVertical:6 },
  statusText: { fontSize:11, fontWeight:'800', letterSpacing:1 },
  section: { gap:10 },
  sectionLabel: { fontSize:10, color:C.muted, letterSpacing:2, fontWeight:'600' },
  optionsGrid: { gap:10 },
  optionCard: { backgroundColor:C.surface, borderRadius:14, borderWidth:2, borderColor:C.border, padding:16, gap:6, position:'relative' },
  optionCardSelected: { borderColor:C.green, backgroundColor:C.green+'0d' },
  optionCardApproved: { borderColor:C.green, backgroundColor:C.green+'0d' },
  optionLabel: { fontSize:18, fontWeight:'800', color:C.text },
  optionDesc: { fontSize:13, color:C.muted, lineHeight:18 },
  optionPrice: { fontSize:22, fontWeight:'300', color:C.text, marginTop:4 },
  selectedCheck: { position:'absolute', top:12, right:14 },
  card: { backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.border, padding:14, gap:10 },
  lineItem: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:8 },
  lineItemBorder: { borderBottomWidth:1, borderBottomColor:C.border },
  lineItemName: { fontSize:14, fontWeight:'600', color:C.text },
  lineItemQty: { fontSize:12, color:C.muted },
  lineItemTotal: { fontSize:15, fontWeight:'700', color:C.text },
  totalRow: { flexDirection:'row', justifyContent:'space-between' },
  totalLabel: { fontSize:13, color:C.muted },
  totalVal: { fontSize:13, color:C.text },
  totalFinal: { borderTopWidth:1, borderTopColor:C.border, paddingTop:10, marginTop:2 },
  totalFinalLabel: { fontSize:16, fontWeight:'800', color:C.text },
  totalFinalVal: { fontSize:20, fontWeight:'800', color:C.green },
  approveBtn: { backgroundColor:C.green+'22', borderWidth:1.5, borderColor:C.green, borderRadius:14, padding:18, alignItems:'center' },
  approveBtnText: { fontSize:16, color:C.green, fontWeight:'700' },
});

const sig = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg, padding:24, gap:16 },
  title: { fontSize:22, fontWeight:'800', color:C.text, textAlign:'center' },
  sub: { fontSize:14, color:C.muted, textAlign:'center' },
  padContainer: { flex:1, borderRadius:16, borderWidth:2, borderColor:C.border2, backgroundColor:C.surface, overflow:'hidden' },
  pad: { flex:1, justifyContent:'center', alignItems:'center' },
  placeholder: { fontSize:16, color:C.dim, fontStyle:'italic' },
  actions: { flexDirection:'row', gap:10 },
  clearBtn: { flex:1, padding:14, borderRadius:12, backgroundColor:C.surface2, alignItems:'center', borderWidth:1, borderColor:C.border },
  clearBtnText: { color:C.muted, fontWeight:'600' },
  cancelBtn: { flex:1, padding:14, borderRadius:12, backgroundColor:C.surface2, alignItems:'center', borderWidth:1, borderColor:C.border },
  cancelBtnText: { color:C.muted, fontWeight:'600' },
  approveBtn: { flex:2, padding:14, borderRadius:12, backgroundColor:C.green, alignItems:'center' },
  approveBtnText: { color:C.bg, fontWeight:'800', fontSize:15 },
});
