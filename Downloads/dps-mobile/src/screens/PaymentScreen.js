import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import api from '../services/api';

const TIPS = [0, 10, 15, 20];

export default function PaymentScreen({ route, navigation }) {
  const { jobId, customerName } = route.params || {};
  const [amount, setAmount] = useState('');
  const [tipPercent, setTipPercent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [zip, setZip] = useState('');

  const baseAmount = parseFloat(amount) || 0;
  const tipAmount  = baseAmount * (tipPercent / 100);
  const total      = baseAmount + tipAmount;

  // Format card number with spaces every 4 digits
  const formatCard = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  // Format expiry MM/YY
  const formatExpiry = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0,2) + '/' + digits.slice(2);
    return digits;
  };

  const cardBrand = () => {
    const d = cardNumber.replace(/\s/g, '');
    if (d.startsWith('4')) return 'Visa';
    if (d.startsWith('5')) return 'Mastercard';
    if (d.startsWith('3')) return 'Amex';
    if (d.startsWith('6')) return 'Discover';
    return '';
  };

  const charge = async () => {
    if (baseAmount <= 0) { Alert.alert('Enter Amount', 'Please enter the service amount.'); return; }
    const rawCard = cardNumber.replace(/\s/g, '');
    if (rawCard.length < 15) { Alert.alert('Invalid Card', 'Please enter a valid card number.'); return; }
    if (!expiry || expiry.length < 5) { Alert.alert('Invalid Expiry', 'Please enter expiry as MM/YY.'); return; }
    if (!cvv || cvv.length < 3) { Alert.alert('Invalid CVV', 'Please enter the CVV.'); return; }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const amountCents = Math.round(total * 100);
      const [expMonth, expYear] = expiry.split('/');
      const res = await api.post('/api/square/charge', {
        jobId,
        amount: amountCents,
        tip: Math.round(tipAmount * 100),
        note: `DPS Service - Job #${jobId}`,
        card: {
          number: rawCard,
          exp_month: expMonth,
          exp_year: '20' + expYear,
          cvv,
          name: cardName,
          zip,
        },
      });
      setResult(res.data);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch(e) {
      Alert.alert('Payment Failed', e.response?.data?.error || 'Please try again.');
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
        <Text style={styles.successSub}>{result.card_brand || cardBrand()} ···· {result.last_four || cardNumber.slice(-4)}</Text>
        <View style={styles.receiptCard}>
          {[
            ['Customer', customerName || '—'],
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

        {/* Card details */}
        <View style={styles.section}>
          <Text style={styles.label}>CARD DETAILS</Text>
          <View style={styles.cardForm}>
            {/* Card number */}
            <View style={styles.fieldRow}>
              <TextInput
                value={cardNumber}
                onChangeText={v => setCardNumber(formatCard(v))}
                placeholder="Card Number"
                placeholderTextColor={C.dim}
                keyboardType="number-pad"
                style={styles.field}
                maxLength={19}
              />
              {cardBrand() ? <Text style={styles.brandTag}>{cardBrand()}</Text> : null}
            </View>

            {/* Cardholder name */}
            <TextInput value={cardName} onChangeText={setCardName}
              placeholder="Cardholder Name" placeholderTextColor={C.dim}
              style={[styles.field, styles.fieldBorderTop]} autoCapitalize="words"/>

            {/* Expiry + CVV + ZIP */}
            <View style={styles.fieldRowThree}>
              <TextInput value={expiry} onChangeText={v => setExpiry(formatExpiry(v))}
                placeholder="MM/YY" placeholderTextColor={C.dim}
                keyboardType="number-pad" style={[styles.fieldSmall, styles.fieldBorderTop]}
                maxLength={5}/>
              <View style={styles.fieldDividerV}/>
              <TextInput value={cvv} onChangeText={v => setCvv(v.replace(/\D/g,'').slice(0,4))}
                placeholder="CVV" placeholderTextColor={C.dim}
                keyboardType="number-pad" style={[styles.fieldSmall, styles.fieldBorderTop]}
                maxLength={4} secureTextEntry/>
              <View style={styles.fieldDividerV}/>
              <TextInput value={zip} onChangeText={v => setZip(v.replace(/\D/g,'').slice(0,5))}
                placeholder="ZIP" placeholderTextColor={C.dim}
                keyboardType="number-pad" style={[styles.fieldSmall, styles.fieldBorderTop]}
                maxLength={5}/>
            </View>
          </View>
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
        <TouchableOpacity style={[styles.chargeBtn, (!baseAmount || loading) && styles.chargeBtnDisabled]}
          onPress={charge} disabled={!baseAmount || loading}>
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
  cardForm: { backgroundColor:C.surface, borderRadius:14, borderWidth:1.5, borderColor:C.border2, overflow:'hidden' },
  fieldRow: { flexDirection:'row', alignItems:'center', paddingHorizontal:16 },
  fieldRowThree: { flexDirection:'row', alignItems:'center' },
  field: { flex:1, color:C.text, fontSize:16, paddingVertical:16, paddingHorizontal:16 },
  fieldSmall: { flex:1, color:C.text, fontSize:16, paddingVertical:16, paddingHorizontal:14, textAlign:'center' },
  fieldBorderTop: { borderTopWidth:1, borderTopColor:C.border },
  fieldDividerV: { width:1, height:50, backgroundColor:C.border },
  brandTag: { fontSize:11, color:C.blue, fontWeight:'700', paddingRight:8 },
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
