import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import api from '../services/api';
import SquareCardField from '../components/SquareCardField';

const TIPS = [0, 10, 15, 20];

export default function PaymentScreen({ route, navigation }) {
  const { jobId, customerName, invoiceId, invoiceTotal } = route.params || {};
  // Pre-fill with invoice total if provided
  const [amount, setAmount] = useState(invoiceTotal ? String(parseFloat(invoiceTotal).toFixed(2)) : '');
  const [tipPercent, setTipPercent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Square card form (secure fields inside a WebView)
  const cardRef = useRef(null);
  const [squareCfg, setSquareCfg] = useState(null);
  const [cfgError, setCfgError]   = useState('');
  const [cardReady, setCardReady] = useState(false);
  useEffect(() => {
    api.get('/api/square/config')
      .then(r => (r.data?.applicationId && r.data?.locationId) ? setSquareCfg(r.data) : setCfgError('Square is not set up on the server.'))
      .catch(e => setCfgError(e.message));
  }, []);

  const baseAmount = parseFloat(amount) || 0;
  const tipAmount  = baseAmount * (tipPercent / 100);
  const total      = baseAmount + tipAmount;

  const charge = async () => {
    if (baseAmount <= 0) { Alert.alert('Enter Amount', 'Please enter the service amount.'); return; }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const card = await cardRef.current.tokenize();   // throws if the card is invalid
      // Charges Square and, when an invoice is attached, records the payment on it
      const res = await api.post('/api/square/payment', {
        source_id:     card.token,
        amount_cents:  Math.round(baseAmount * 100),
        tip_cents:     Math.round(tipAmount * 100),
        invoice_id:    invoiceId || undefined,
        customer_note: `ServiceCore Pro - Job #${jobId}`,
      });
      setResult({ ...res.data, card_brand: res.data.card_brand || card.brand, last4: res.data.last4 || card.last4 });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch(e) {
      Alert.alert('Payment Failed', e.response?.data?.error || e.message || 'Please try again.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIcon}><Text style={{fontSize:48}}>✅</Text></View>
        <Text style={styles.successTitle}>Payment Successful</Text>
        <Text style={styles.successAmount}>${total.toFixed(2)}</Text>
        <Text style={styles.successSub}>{(result.card_brand || 'Card').replace(/_/g, ' ')} ···· {result.last4 || '····'}</Text>
        <View style={styles.receiptCard}>
          {[
            ['Customer', customerName || '—'],
            ...(invoiceId ? [['Invoice', '#' + invoiceId.slice(0, 8)]] : []),
            ['Service Amount', '$' + baseAmount.toFixed(2)],
            ['Tip', '$' + tipAmount.toFixed(2)],
            ['Total Charged', '$' + total.toFixed(2)],
            ['Payment ID', (result.payment_id || 'N/A').slice(0,16) + '…'],
          ].map(([k,v]) => (
            <View key={k} style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>{k}</Text>
              <Text style={styles.receiptVal}>{v}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Back to Job</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{padding:20, gap:20}}>
        <Text style={styles.customer}>{customerName || 'Customer'}</Text>

        {/* Amount */}
        <View style={styles.section}>
          <Text style={styles.label}>SERVICE AMOUNT</Text>
          <View style={styles.amountRow}>
            <Text style={styles.dollar}>$</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
              placeholder="0.00" placeholderTextColor={C.dim} style={styles.amountInput}/>
          </View>
        </View>

        {/* Tip */}
        <View style={styles.section}>
          <Text style={styles.label}>TIP</Text>
          <View style={styles.tipRow}>
            {TIPS.map(t => (
              <TouchableOpacity key={t} onPress={() => setTipPercent(t)}
                style={[styles.tipBtn, tipPercent===t && styles.tipBtnActive]}>
                <Text style={[styles.tipBtnText, tipPercent===t && styles.tipBtnTextActive]}>
                  {t===0 ? 'None' : t + '%'}
                </Text>
                {t > 0 && baseAmount > 0 && (
                  <Text style={[styles.tipAmt, tipPercent===t && {color:C.green}]}>
                    ${(baseAmount * t / 100).toFixed(2)}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Card details — Square's secure fields */}
        <View style={styles.section}>
          <Text style={styles.label}>CARD DETAILS</Text>
          {squareCfg
            ? <SquareCardField ref={cardRef} config={squareCfg} onReady={() => setCardReady(true)}/>
            : cfgError
              ? <Text style={styles.cfgError}>⚠ Card payments unavailable: {cfgError}</Text>
              : <ActivityIndicator color={C.green}/>}
          {squareCfg?.environment === 'sandbox' && (
            <Text style={styles.sandboxHint}>Square test mode — card 4111 1111 1111 1111, any future date, CVV 111, ZIP 12345. No real money moves.</Text>
          )}
        </View>

        {/* Total */}
        {baseAmount > 0 && (
          <View style={styles.totalCard}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Service</Text><Text style={styles.totalVal}>${baseAmount.toFixed(2)}</Text></View>
            {tipAmount > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Tip ({tipPercent}%)</Text><Text style={styles.totalVal}>${tipAmount.toFixed(2)}</Text></View>}
            <View style={[styles.totalRow, styles.totalFinal]}>
              <Text style={styles.totalFinalLabel}>TOTAL</Text>
              <Text style={styles.totalFinalVal}>${total.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Charge */}
        <TouchableOpacity style={[styles.chargeBtn, (!baseAmount || loading || !cardReady) && styles.chargeBtnDisabled]}
          onPress={charge} disabled={!baseAmount || loading || !cardReady}>
          {loading
            ? <ActivityIndicator color={C.bg} size="small"/>
            : <Text style={styles.chargeBtnText}>💳  Charge ${total > 0 ? total.toFixed(2) : '0.00'}</Text>
          }
        </TouchableOpacity>

        <Text style={styles.poweredBy}>Secured by Square</Text>
        <View style={{height:40}}/>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg },
  customer: { fontSize:20, fontWeight:'700', color:C.text },
  section: { gap:10 },
  label: { fontSize:10, color:C.muted, letterSpacing:2, fontWeight:'600' },
  amountRow: { flexDirection:'row', alignItems:'center', backgroundColor:C.surface, borderRadius:14, borderWidth:1.5, borderColor:C.border2, paddingHorizontal:16 },
  dollar: { fontSize:32, color:C.muted, marginRight:4 },
  amountInput: { flex:1, fontSize:42, color:C.text, fontWeight:'300', paddingVertical:14 },
  tipRow: { flexDirection:'row', gap:10 },
  tipBtn: { flex:1, alignItems:'center', padding:12, borderRadius:12, backgroundColor:C.surface, borderWidth:1.5, borderColor:C.border, gap:2 },
  tipBtnActive: { backgroundColor:C.green+'22', borderColor:C.green },
  tipBtnText: { fontSize:15, fontWeight:'600', color:C.muted },
  tipBtnTextActive: { color:C.green },
  tipAmt: { fontSize:11, color:C.dim },
  totalCard: { backgroundColor:C.surface, borderRadius:14, padding:16, borderWidth:1, borderColor:C.border, gap:10 },
  totalRow: { flexDirection:'row', justifyContent:'space-between' },
  totalLabel: { fontSize:14, color:C.muted },
  totalVal: { fontSize:14, color:C.text },
  totalFinal: { borderTopWidth:1, borderTopColor:C.border, paddingTop:10, marginTop:2 },
  totalFinalLabel: { fontSize:16, fontWeight:'800', color:C.text, letterSpacing:1 },
  totalFinalVal: { fontSize:20, fontWeight:'800', color:C.green },
  chargeBtn: { backgroundColor:C.green, borderRadius:14, padding:18, alignItems:'center' },
  chargeBtnDisabled: { backgroundColor:C.surface2, borderWidth:1, borderColor:C.border },
  chargeBtnText: { fontSize:18, fontWeight:'800', color:C.bg },
  cfgError: { color:C.red, fontSize:13 },
  sandboxHint: { fontSize:11, color:C.muted, lineHeight:16 },
  poweredBy: { textAlign:'center', fontSize:11, color:C.dim },
  successContainer: { flex:1, backgroundColor:C.bg, padding:32, alignItems:'center', gap:16, justifyContent:'center' },
  successIcon: { width:100, height:100, borderRadius:50, backgroundColor:C.green+'22', borderWidth:2, borderColor:C.green, justifyContent:'center', alignItems:'center' },
  successTitle: { fontSize:24, fontWeight:'800', color:C.text },
  successAmount: { fontSize:42, fontWeight:'300', color:C.green },
  successSub: { fontSize:14, color:C.muted },
  receiptCard: { width:'100%', backgroundColor:C.surface, borderRadius:14, padding:16, gap:10, borderWidth:1, borderColor:C.border },
  receiptRow: { flexDirection:'row', justifyContent:'space-between' },
  receiptLabel: { fontSize:13, color:C.muted },
  receiptVal: { fontSize:13, color:C.text, fontWeight:'500' },
  doneBtn: { backgroundColor:C.green+'22', borderWidth:1.5, borderColor:C.green, borderRadius:14, paddingHorizontal:40, paddingVertical:14 },
  doneBtnText: { fontSize:16, color:C.green, fontWeight:'700' },
});
