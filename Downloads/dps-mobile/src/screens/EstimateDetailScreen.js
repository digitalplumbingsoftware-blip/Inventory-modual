import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput, PanResponder, Dimensions,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import dayjs from 'dayjs';
import { C } from '../theme';
import {
  getEstimate, signEstimate, sendEstimate, convertEstimate,
  addEstimateItem, removeEstimateItem, updateJob, getInvoice, getInvoices,
  updateEstimateNotes, updateEstimate, aiRewrite,
  appendEstimateToInvoice,
} from '../services/api';
import PricebookPickerSheet from '../components/PricebookPickerSheet';

const { width: SCREEN_W } = Dimensions.get('window');
const fmt = (n) => '$' + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const STATUS_COLORS = {
  draft:     { bg: C.surface2, text: C.muted,   border: C.border  },
  sent:      { bg: '#1e3a5f', text: C.blue,    border: C.blue    },
  signed:    { bg: '#0f3322', text: C.green,   border: C.green   },
  converted: { bg: '#2d1a00', text: C.amber,   border: C.amber   },
  declined:  { bg: '#2d0a0a', text: C.red,     border: C.red     },
  expired:   { bg: C.surface2, text: C.muted,  border: C.border  },
};

// Good/Better/Best tier config
const GBB_OPTIONS = [
  { label: 'Good',   color: C.green,  icon: '✅' },
  { label: 'Better', color: C.blue,   icon: '⭐' },
  { label: 'Best',   color: C.purple, icon: '🏆' },
];

// Parse option prefix from description: "[Good] Water heater replace" → { label: 'Good', clean: 'Water heater replace' }
function parseOption(desc) {
  const m = String(desc || '').match(/^\[(Good|Better|Best)\] (.*)/s);
  return m ? { label: m[1], clean: m[2] } : { label: null, clean: desc || '' };
}

// ── Presentation Modal (landscape side-by-side GBB) ───────────────────────────
function PresentationModal({ visible, onClose, estimate, onSelectOption }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  if (!visible) return null;

  const allItems = estimate?.items || [];

  const optionItems = (label) =>
    allItems.filter(item => parseOption(item.description).label === label);

  const optionTotal = (label) =>
    optionItems(label).reduce(
      (s, item) => s + parseFloat(item.flat_rate || 0) * parseFloat(item.qty || 1), 0
    );

  const COL_COLORS = {
    Good:   { accent: '#3ecf8e', dim: '#3ecf8e18', border: '#3ecf8e33' },
    Better: { accent: '#4a9eff', dim: '#4a9eff18', border: '#4a9eff33' },
    Best:   { accent: '#a78bfa', dim: '#a78bfa22', border: '#a78bfa44' },
  };

  const RotateHint = () => (
    <View style={pres.rotateCover}>
      <Text style={pres.rotateEmoji}>📱</Text>
      <Text style={pres.rotateTitle}>Rotate your phone</Text>
      <Text style={pres.rotateSub}>
        Turn sideways to present all 3 options{'\n'}side-by-side to your customer
      </Text>
      <TouchableOpacity onPress={onClose} style={pres.rotateCancelBtn}>
        <Text style={pres.rotateCancelTxt}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const LandscapeView = () => {
    const colW = (width - 48) / 3; // 48 = total horizontal padding + gaps

    return (
      <View style={pres.landscape}>
        {/* Close button top-right */}
        <TouchableOpacity onPress={onClose} style={pres.closeBtn}>
          <Text style={pres.closeTxt}>✕ Done</Text>
        </TouchableOpacity>

        {/* Customer name header */}
        <Text style={pres.presentTitle} numberOfLines={1}>
          {estimate?.customer_name || 'Estimate'} · Options
        </Text>

        {/* 3 columns */}
        <View style={pres.colRow}>
          {GBB_OPTIONS.map((opt, idx) => {
            const cc    = COL_COLORS[opt.label];
            const items = optionItems(opt.label);
            const total = optionTotal(opt.label);
            const isHighlight = opt.label === 'Best';

            return (
              <View
                key={opt.label}
                style={[
                  pres.col,
                  { width: colW, borderColor: cc.border, backgroundColor: cc.dim },
                  isHighlight && pres.colHighlight,
                ]}
              >
                {/* Column header */}
                <View style={[pres.colHeader, { borderBottomColor: cc.border }]}>
                  {isHighlight && (
                    <View style={[pres.recommendedBadge, { backgroundColor: cc.accent }]}>
                      <Text style={pres.recommendedTxt}>RECOMMENDED</Text>
                    </View>
                  )}
                  <Text style={pres.colIcon}>{opt.icon}</Text>
                  <Text style={[pres.colLabel, { color: cc.accent }]}>{opt.label}</Text>
                  <Text style={[pres.colTotal, { color: cc.accent }]}>{fmt(total)}</Text>
                </View>

                {/* Items list */}
                <ScrollView style={pres.colScroll} showsVerticalScrollIndicator={false}>
                  {items.length === 0 ? (
                    <Text style={pres.colEmpty}>—</Text>
                  ) : (
                    items.map((item, i) => {
                      const { clean } = parseOption(item.description);
                      const lineTotal = parseFloat(item.flat_rate || 0) * parseFloat(item.qty || 1);
                      return (
                        <View key={item.id} style={[pres.colItem, i > 0 && { borderTopColor: cc.border, borderTopWidth: 1 }]}>
                          <Text style={pres.colItemName} numberOfLines={2}>{clean}</Text>
                          <View style={pres.colItemBottom}>
                            {item.qty > 1 && <Text style={pres.colItemQty}>×{item.qty}</Text>}
                            <Text style={[pres.colItemPrice, { color: cc.accent }]}>{fmt(lineTotal)}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                {/* Column footer */}
                <View style={[pres.colFooter, { borderTopColor: cc.border, backgroundColor: cc.dim }]}>
                  <Text style={[pres.colFooterLabel, { color: cc.accent }]}>TOTAL</Text>
                  <Text style={[pres.colFooterTotal, { color: cc.accent }]}>{fmt(total)}</Text>
                  {onSelectOption && (
                    <TouchableOpacity
                      style={[pres.chooseBtn, { backgroundColor: cc.accent }]}
                      onPress={() => {
                        Alert.alert(
                          `Choose ${opt.label}?`,
                          `Did you want to choose the ${opt.label} option?\n\nTotal: ${fmt(total)}`,
                          [
                            { text: 'No', style: 'cancel' },
                            { text: `Yes, Choose ${opt.label}`, onPress: () => onSelectOption(opt.label) },
                          ]
                        );
                      }}
                    >
                      <Text style={pres.chooseBtnTxt}>✓ Choose {opt.label}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <View style={pres.backdrop}>
        {isLandscape ? <LandscapeView /> : <RotateHint />}
      </View>
    </Modal>
  );
}

// ── Signature Pad ──────────────────────────────────────────────────────────────
function SignaturePad({ onDone, onCancel, signerName, onNameChange }) {
  const [paths, setPaths] = useState([]);
  const [current, setCurrent] = useState('');

  // Signature pad PanResponder.
  // Capture handlers (`*Capture` variants) claim the gesture from any ancestor
  // — critical because otherwise iOS pageSheet Modal or a parent ScrollView
  // will interpret a downward drag as a dismiss / scroll and steal the pen.
  // `onPanResponderTerminationRequest: () => false` also prevents another
  // responder (e.g. the system swipe-to-dismiss recognizer) from yanking the
  // gesture mid-stroke.
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent(p => p + ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
    },
    onPanResponderRelease: () => {
      setPaths(p => current ? [...p, current] : p);
      setCurrent('');
    },
  });

  const clear = () => { setPaths([]); setCurrent(''); };

  const done = () => {
    if (!signerName.trim()) { Alert.alert('Name Required', 'Please enter the customer name.'); return; }
    if (paths.length === 0) { Alert.alert('Signature Required', 'Please sign before submitting.'); return; }
    onDone({ signerName, svgPaths: paths });
  };

  const padW = SCREEN_W - 48;
  const padH = 200;

  // fullScreen presentation blocks the iOS system swipe-to-dismiss gesture
  // that was competing with the pen and moving the sheet instead of drawing.
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={sig.container} collapsable={false}>
        <Text style={sig.title}>Customer Signature</Text>
        <Text style={sig.sub}>Customer signs below to approve this estimate</Text>

        <View style={sig.field}>
          <Text style={sig.fieldLabel}>CUSTOMER FULL NAME</Text>
          <TextInput
            style={sig.fieldInput}
            value={signerName}
            onChangeText={onNameChange}
            placeholder="Type customer's full name"
            placeholderTextColor={C.muted}
            autoCapitalize="words"
          />
        </View>

        <Text style={sig.fieldLabel}>SIGNATURE</Text>
        <View style={[sig.padWrap, { width: padW, height: padH }]} {...pan.panHandlers}>
          <Svg width={padW} height={padH} style={StyleSheet.absoluteFill}>
            {paths.map((d, i) => (
              <Path key={i} d={d} stroke="#1D70B7" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            ))}
            {current ? (
              <Path d={current} stroke="#1D70B7" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            ) : null}
          </Svg>
          {paths.length === 0 && !current && (
            <Text style={sig.placeholder}>Sign here</Text>
          )}
        </View>

        <View style={sig.actions}>
          <TouchableOpacity style={sig.clearBtn} onPress={clear}>
            <Text style={sig.clearTxt}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sig.cancelBtn} onPress={onCancel}>
            <Text style={sig.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sig.doneBtn} onPress={done}>
            <Text style={sig.doneTxt}>✓ Approve & Sign</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function EstimateDetailScreen({ route, navigation }) {
  const { estimateId } = route.params;
  const [estimate, setEstimate]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showSig, setShowSig]       = useState(false);
  const [showNowLater, setShowNowLater] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [saving, setSaving]         = useState(false);

  // Notes editing
  const [estNotes, setEstNotes]         = useState('');
  const [savingEstNotes, setSavingEstNotes] = useState(false);
  const [estNotesSaved, setEstNotesSaved]   = useState(false);
  const [estAiLoading, setEstAiLoading]     = useState(false);

  // Job description editing
  const [estJobDesc, setEstJobDesc]       = useState('');
  const [savingEstJobDesc, setSavingEstJobDesc] = useState(false);
  const [estJobDescSaved, setEstJobDescSaved]   = useState(false);

  // Good / Better / Best mode
  const [gbbMode, setGbbMode]           = useState(false);
  const [activeOption, setActiveOption]  = useState('Good');
  const [duplicating, setDuplicating]    = useState(false);
  const [showPresent, setShowPresent]    = useState(false);
  const [selectingOption, setSelectingOption] = useState(false);
  const [pbSheet, setPbSheet] = useState(null); // null | { optionLabel }

  const load = useCallback(async () => {
    try {
      const data = await getEstimate(estimateId);
      setEstimate(data);
      if (data.customer_name && !signerName) setSignerName(data.customer_name);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [estimateId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setEstNotes(estimate?.notes || '');
    setEstNotesSaved(false);
    setEstJobDesc(estimate?.job_description || '');
    setEstJobDescSaved(false);
  }, [estimate?.id]);

  // ── Job description ──────────────────────────────────────────────────────────
  const saveEstJobDesc = async () => {
    setSavingEstJobDesc(true);
    try {
      await updateEstimate(estimateId, { job_description: estJobDesc });
      setEstJobDescSaved(true);
      setTimeout(() => setEstJobDescSaved(false), 2000);
    } catch (e) {
      Alert.alert('Error', 'Could not save job description.');
    } finally { setSavingEstJobDesc(false); }
  };

  // ── Notes ────────────────────────────────────────────────────────────────────
  const saveEstNotes = async () => {
    setSavingEstNotes(true);
    try {
      await updateEstimateNotes(estimateId, estNotes);
      setEstNotesSaved(true);
      setTimeout(() => setEstNotesSaved(false), 2000);
    } catch (e) {
      Alert.alert('Error', 'Could not save notes.');
    } finally { setSavingEstNotes(false); }
  };

  const rewriteEstNotes = async () => {
    if (!estNotes.trim()) { Alert.alert('Nothing to rewrite', 'Type some notes first.'); return; }
    setEstAiLoading(true);
    try {
      const result = await aiRewrite(estNotes, 'plumbing service');
      setEstNotes(result.text);
      setEstNotesSaved(false);
    } catch (e) {
      Alert.alert('Error', 'Could not reach AI. Check your API key.');
    } finally { setEstAiLoading(false); }
  };

  // ── Signature ────────────────────────────────────────────────────────────────
  const handleSign = async ({ signerName: name, svgPaths }) => {
    setSaving(true);
    try {
      const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W - 48}" height="200">${
        svgPaths.map(d => `<path d="${d}" stroke="#1D70B7" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join('')
      }</svg>`;
      await signEstimate(estimateId, { signature_data: svgData, signed_by_name: name });
      setShowSig(false);
      await load();
      setShowNowLater(true);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save signature.');
    } finally { setSaving(false); }
  };

  // Create-new-invoice branch, factored out so both the direct path and the
  // "no existing invoice" fallthrough share it.
  const createFreshInvoice = async () => {
    const result = await convertEstimate(estimateId);
    const invoice = await getInvoice(result.invoice_id);
    await load();
    navigation.navigate('InvoiceDetail', { invoice, jobId: estimate?.job_id });
  };

  const appendToExisting = async (invoiceId) => {
    await appendEstimateToInvoice(invoiceId, estimateId);
    const invoice = await getInvoice(invoiceId);
    await load();
    navigation.navigate('InvoiceDetail', { invoice, jobId: estimate?.job_id });
  };

  const handleWorkNow = async () => {
    setShowNowLater(false);
    setSaving(true);
    try {
      // Before creating a new invoice, look for an open invoice on the same job
      // from today. If there is one, ask the tech whether to append this
      // estimate's items to it (avoids duplicate invoices for a single visit).
      let openToday = [];
      if (estimate?.job_id) {
        try {
          const list = await getInvoices({ job_id: estimate.job_id, type: 'invoice' });
          const arr = Array.isArray(list) ? list : (list?.invoices || []);
          const today = new Date().toISOString().slice(0,10);
          openToday = arr.filter(i => {
            if (i.status === 'paid') return false;
            const day = (i.created_at || i.updated_at || '').slice(0,10);
            return day === today;
          });
        } catch (e) { /* fall through to create new */ }
      }

      if (openToday.length > 0) {
        const target = openToday[0];
        const total = parseFloat(target.total || 0).toFixed(2);
        setSaving(false);
        Alert.alert(
          'Add to existing invoice?',
          `There's already an open invoice for this job today (#${target.id?.toString().slice(0,8)} · $${total}). Add these items to it, or start a new invoice?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'New Invoice', onPress: async () => { setSaving(true); try { await createFreshInvoice(); } catch(e){ Alert.alert('Error', e.response?.data?.error || e.message);} finally { setSaving(false);} } },
            { text: `Add to #${target.id?.toString().slice(0,8)}`, style: 'default',
              onPress: async () => { setSaving(true); try { await appendToExisting(target.id); } catch(e){ Alert.alert('Error', e.response?.data?.error || e.message);} finally { setSaving(false);} } },
          ]
        );
        return;
      }

      await createFreshInvoice();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not create invoice.');
    } finally { setSaving(false); }
  };

  const handleWorkLater = async () => {
    setShowNowLater(false);
    if (estimate?.job_id) {
      try {
        await updateJob(estimate.job_id, {
          estimate_approved: true,
          return_trip_needed: true,
        });
      } catch (e) { console.warn('Could not flag job:', e.message); }
    }
    Alert.alert(
      'Scheduled for Later',
      'The dispatcher has been notified. This job will show as approved and ready to reschedule.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  const handleSend = async () => {
    setSaving(true);
    try {
      const res = await sendEstimate(estimateId);
      const url = res.sign_url || '';
      Alert.alert('Sent!', url ? `Sign link:\n${url}` : 'Email sent to customer.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not send estimate.');
    } finally { setSaving(false); }
  };

  const handleConvert = async () => {
    Alert.alert('Convert to Invoice?', 'This will create an invoice from this signed estimate.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Convert', onPress: async () => {
          setSaving(true);
          try {
            await convertEstimate(estimateId);
            await load();
            Alert.alert('Invoice Created', 'Estimate converted to invoice.');
          } catch (e) {
            Alert.alert('Error', e.response?.data?.error || 'Could not convert estimate.');
          } finally { setSaving(false); }
        },
      },
    ]);
  };

  // ── GBB option selection from presentation ────────────────────────────────────
  // Called when customer taps "Choose [Option]" in the presentation modal.
  // Strips items from the other two tiers, then opens the signature pad.
  const handleSelectOption = async (label) => {
    setSelectingOption(true);
    try {
      // Remove items that belong to OTHER tiers (keep no-prefix "common" items)
      const allItems = estimate?.items || [];
      const toRemove = allItems.filter(item => {
        const { label: itemLabel } = parseOption(item.description);
        return itemLabel !== null && itemLabel !== label;
      });
      for (const item of toRemove) {
        await removeEstimateItem(estimateId, item.id);
      }
      await load();
      setShowPresent(false);
      // Small delay so the presentation modal fully closes before sig pad opens
      setTimeout(() => setShowSig(true), 350);
    } catch (e) {
      Alert.alert('Error', 'Could not select option. Please try again.');
    } finally {
      setSelectingOption(false);
    }
  };

  // ── Pricebook ─────────────────────────────────────────────────────────────────
  // optionLabel: 'Good' | 'Better' | 'Best' | null (standard mode)
  const handleAddFromPricebook = (optionLabel = null) => {
    setPbSheet({ optionLabel });
  };

  const handlePbPick = async (items) => {
    if (!pbSheet) return;
    const { optionLabel } = pbSheet;
    try {
      for (const item of items) {
        const description = optionLabel
          ? `[${optionLabel}] ${item.description}`
          : item.description;
        await addEstimateItem(estimateId, {
          description,
          flat_rate: item.flat_rate,
          quantity: item.quantity || 1,
          qty: item.quantity || 1,
          notes: item.notes || '',
          task_id: item.task_id || null,
        });
      }
      await load();
    } catch (e) {
      Alert.alert('Error', 'Could not add items.');
    }
    setPbSheet(null);
  };

  const handleRemoveItem = (itemId) => {
    Alert.alert('Remove Item?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeEstimateItem(estimateId, itemId);
            await load();
          } catch (e) { Alert.alert('Error', 'Could not remove item.'); }
        },
      },
    ]);
  };

  // ── GBB helpers ───────────────────────────────────────────────────────────────
  const gbbOptionTotal = (label) => {
    return (estimate?.items || [])
      .filter(item => parseOption(item.description).label === label)
      .reduce((sum, item) => sum + parseFloat(item.flat_rate || 0) * parseFloat(item.qty || 1), 0);
  };

  const duplicateOption = (fromLabel) => {
    const otherOptions = GBB_OPTIONS.filter(o => o.label !== fromLabel).map(o => o.label);
    Alert.alert(
      `Duplicate ${fromLabel} Option`,
      `Copy all "${fromLabel}" items to which option?`,
      [
        ...otherOptions.map(toLabel => ({
          text: `→ ${toLabel}`,
          onPress: async () => {
            setDuplicating(true);
            try {
              const fromItems = (estimate?.items || []).filter(
                item => parseOption(item.description).label === fromLabel
              );
              if (fromItems.length === 0) {
                Alert.alert('Nothing to duplicate', `${fromLabel} has no items.`);
                return;
              }
              for (const item of fromItems) {
                const { clean } = parseOption(item.description);
                await addEstimateItem(estimateId, {
                  description: `[${toLabel}] ${clean}`,
                  flat_rate: item.flat_rate,
                  quantity: item.qty || 1,
                });
              }
              await load();
              setActiveOption(toLabel);
            } catch (e) {
              Alert.alert('Error', 'Could not duplicate items.');
            } finally {
              setDuplicating(false);
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // ── Render helpers ─────────────────────────────────────────────────────────────
  const renderStandardItems = (items, isDraft) => (
    <View style={S.card}>
      {items.length === 0 ? (
        <Text style={[S.meta, { textAlign: 'center', paddingVertical: 16 }]}>No items yet</Text>
      ) : (
        items.map((item, i) => {
          const { clean } = parseOption(item.description);
          return (
            <View key={item.id} style={[S.lineItem, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={S.liName}>{clean}</Text>
                {item.qty > 1 && <Text style={S.liQty}>qty: {item.qty}</Text>}
              </View>
              <Text style={S.liPrice}>{fmt(item.flat_rate)}</Text>
              {isDraft && (
                <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={{ paddingLeft: 10 }}>
                  <Text style={{ color: C.red, fontSize: 18 }}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </View>
  );

  const renderGbbTab = (optCfg, items, isDraft) => {
    const tabItems = items.filter(item => parseOption(item.description).label === optCfg.label);
    const total = tabItems.reduce((s, item) => s + parseFloat(item.flat_rate || 0) * parseFloat(item.qty || 1), 0);

    return (
      <View style={[S.gbbTabContent, { borderColor: optCfg.color + '44' }]}>
        {/* Option header */}
        <View style={S.gbbOptHeader}>
          <Text style={[S.gbbOptTitle, { color: optCfg.color }]}>{optCfg.icon} {optCfg.label}</Text>
          <Text style={[S.gbbOptTotal, { color: optCfg.color }]}>{fmt(total)}</Text>
        </View>

        {/* Items */}
        {tabItems.length === 0 ? (
          <Text style={S.gbbEmpty}>No items — tap + Pricebook to add</Text>
        ) : (
          tabItems.map((item, i) => {
            const { clean } = parseOption(item.description);
            return (
              <View key={item.id} style={[S.lineItem, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={S.liName}>{clean}</Text>
                  {item.notes ? <Text style={S.liNotes}>{item.notes}</Text> : null}
                  {item.qty > 1 && <Text style={S.liQty}>qty: {item.qty}</Text>}
                </View>
                <Text style={S.liPrice}>{fmt(item.flat_rate * (item.qty || 1))}</Text>
                {isDraft && (
                  <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={{ paddingLeft: 10 }}>
                    <Text style={{ color: C.red, fontSize: 18 }}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* Action row */}
        {isDraft && (
          <View style={S.gbbActions}>
            <TouchableOpacity
              onPress={() => handleAddFromPricebook(optCfg.label)}
              style={[S.gbbActionBtn, { borderColor: optCfg.color, backgroundColor: optCfg.color + '14' }]}
            >
              <Text style={[S.gbbActionTxt, { color: optCfg.color }]}>+ Pricebook</Text>
            </TouchableOpacity>
            {tabItems.length > 0 && (
              <TouchableOpacity
                onPress={() => duplicateOption(optCfg.label)}
                disabled={duplicating}
                style={S.gbbDupBtn}
              >
                <Text style={S.gbbDupTxt}>{duplicating ? '…' : '⧉ Duplicate to…'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Loading / error states ────────────────────────────────────────────────────
  if (loading) return <View style={S.center}><ActivityIndicator color={C.green} size="large" /></View>;
  if (!estimate) return <View style={S.center}><Text style={{ color: C.muted }}>Not found</Text></View>;

  const sc          = STATUS_COLORS[estimate.status] || STATUS_COLORS.draft;
  const isDraft     = estimate.status === 'draft';
  const isSigned    = estimate.status === 'signed';
  const isConverted = estimate.status === 'converted';
  const allItems    = estimate.items || [];

  // GBB overview totals
  const gbbTotals = GBB_OPTIONS.map(o => ({ ...o, total: gbbOptionTotal(o.label) }));
  const activeOptCfg = GBB_OPTIONS.find(o => o.label === activeOption) || GBB_OPTIONS[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={S.scroll}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={[S.header, { borderColor: sc.border + '55', backgroundColor: sc.bg }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.customer}>{estimate.customer_name}</Text>
            <Text style={S.meta}>
              {estimate.job_address ? estimate.job_address + ' · ' : ''}
              {dayjs(estimate.created_at).format('MMM D, YYYY')}
            </Text>
          </View>
          <View style={[S.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[S.statusText, { color: sc.text }]}>{(estimate.status || '').toUpperCase()}</Text>
          </View>
        </View>

        {/* ── Line items ──────────────────────────────────────────── */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionLabel}>LINE ITEMS</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {/* GBB toggle */}
              {isDraft && (
                <TouchableOpacity
                  onPress={() => setGbbMode(v => !v)}
                  style={[S.gbbToggle, gbbMode && S.gbbToggleActive]}
                >
                  <Text style={[S.gbbToggleTxt, gbbMode && S.gbbToggleTxtActive]}>
                    {gbbMode ? '🏆 GBB On' : '🏆 GBB'}
                  </Text>
                </TouchableOpacity>
              )}
              {/* Present button — only in GBB mode */}
              {gbbMode && (
                <TouchableOpacity
                  onPress={() => setShowPresent(true)}
                  style={S.presentBtn}
                >
                  <Text style={S.presentBtnTxt}>▶ Present</Text>
                </TouchableOpacity>
              )}
              {/* Standard-mode add button */}
              {isDraft && !gbbMode && (
                <TouchableOpacity onPress={() => handleAddFromPricebook(null)} style={S.addBtn}>
                  <Text style={S.addBtnText}>+ Add from Pricebook</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {gbbMode ? (
            <View style={{ gap: 0 }}>
              {/* Option tabs */}
              <View style={S.gbbTabBar}>
                {GBB_OPTIONS.map(opt => {
                  const tot = gbbOptionTotal(opt.label);
                  const isActive = activeOption === opt.label;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => setActiveOption(opt.label)}
                      style={[S.gbbTab, isActive && { borderBottomColor: opt.color, borderBottomWidth: 2.5 }]}
                    >
                      <Text style={[S.gbbTabLabel, { color: isActive ? opt.color : C.muted }]}>
                        {opt.icon} {opt.label}
                      </Text>
                      <Text style={[S.gbbTabTotal, { color: isActive ? opt.color : C.dim }]}>
                        {fmt(tot)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Active tab content */}
              {renderGbbTab(activeOptCfg, allItems, isDraft)}

              {/* GBB comparison row */}
              <View style={S.gbbCompare}>
                {gbbTotals.map((o, i) => (
                  <View key={o.label} style={[S.gbbCompareChip, i > 0 && { borderLeftWidth: 1, borderLeftColor: C.border }]}>
                    <Text style={[S.gbbCompareLabel, { color: o.color }]}>{o.label}</Text>
                    <Text style={[S.gbbCompareTotal, { color: o.color }]}>{fmt(o.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            renderStandardItems(allItems, isDraft)
          )}
        </View>

        {/* ── Totals ──────────────────────────────────────────────── */}
        <View style={S.card}>
          {gbbMode ? (
            <>
              <Text style={[S.sectionLabel, { marginBottom: 8 }]}>OPTION TOTALS</Text>
              {gbbTotals.map(o => (
                <View key={o.label} style={S.totalRow}>
                  <Text style={[S.totalLabel, { color: o.color }]}>{o.icon} {o.label}</Text>
                  <Text style={[S.totalVal, { color: o.color, fontWeight: '700' }]}>{fmt(o.total)}</Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>Subtotal</Text>
                <Text style={S.totalVal}>{fmt(estimate.subtotal)}</Text>
              </View>
              {parseFloat(estimate.tax_amount) > 0 && (
                <View style={S.totalRow}>
                  <Text style={S.totalLabel}>Tax ({estimate.tax_rate}%)</Text>
                  <Text style={S.totalVal}>{fmt(estimate.tax_amount)}</Text>
                </View>
              )}
              <View style={[S.totalRow, S.totalFinalRow]}>
                <Text style={S.totalFinalLabel}>TOTAL</Text>
                <Text style={S.totalFinalVal}>{fmt(estimate.total)}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Signature info ──────────────────────────────────────── */}
        {(isSigned || isConverted) && estimate.signed_by_name && (
          <View style={[S.card, { borderColor: C.green + '44', backgroundColor: C.green + '08' }]}>
            <Text style={{ color: C.green, fontWeight: '700', fontSize: 14 }}>✓ Signed by {estimate.signed_by_name}</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              {dayjs(estimate.signed_at).format('MMM D, YYYY [at] h:mm A')}
            </Text>
          </View>
        )}

        {/* ── Job Description ─────────────────────────────────────── */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>JOB DESCRIPTION</Text>
          <View style={[S.card, { gap: 10 }]}>
            <TextInput
              style={S.notesInput}
              value={estJobDesc}
              onChangeText={(t) => { setEstJobDesc(t); setEstJobDescSaved(false); }}
              placeholder="Describe the work (shown at top of the printable estimate)…"
              placeholderTextColor={C.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[S.saveNotesBtn, (savingEstJobDesc || estJobDescSaved) && { opacity: 0.7 }]}
              onPress={saveEstJobDesc}
              disabled={savingEstJobDesc || estJobDescSaved}
            >
              {savingEstJobDesc
                ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={S.saveNotesBtnText}>{estJobDescSaved ? '✓ Saved' : 'Save'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Notes ───────────────────────────────────────────────── */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>NOTES</Text>
          <View style={[S.card, { gap: 10 }]}>
            <TextInput
              style={S.notesInput}
              value={estNotes}
              onChangeText={(t) => { setEstNotes(t); setEstNotesSaved(false); }}
              placeholder="Add notes about this estimate..."
              placeholderTextColor={C.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[S.aiBtn, estAiLoading && { opacity: 0.6 }]}
                onPress={rewriteEstNotes}
                disabled={estAiLoading}
              >
                {estAiLoading
                  ? <ActivityIndicator color={C.amber} size="small" />
                  : <Text style={S.aiBtnText}>✨ Make it sound better</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.saveNotesBtn, (savingEstNotes || estNotesSaved) && { opacity: 0.7 }]}
                onPress={saveEstNotes}
                disabled={savingEstNotes || estNotesSaved}
              >
                {savingEstNotes
                  ? <ActivityIndicator color={C.bg} size="small" />
                  : <Text style={S.saveNotesBtnText}>{estNotesSaved ? '✓ Saved' : 'Save'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <View style={S.actionsBlock}>
          {isDraft && (
            <>
              <TouchableOpacity
                style={[S.actionBtn, { backgroundColor: C.green + '1a', borderColor: C.green }]}
                onPress={() => setShowSig(true)}
                disabled={saving}
              >
                <Text style={[S.actionTxt, { color: C.green }]}>✍️  Customer Sign (In-Person)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.actionBtn, { backgroundColor: C.blue + '1a', borderColor: C.blue }]}
                onPress={handleSend}
                disabled={saving}
              >
                <Text style={[S.actionTxt, { color: C.blue }]}>📧  Send Signing Link to Customer</Text>
              </TouchableOpacity>
            </>
          )}
          {isSigned && !isConverted && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor: C.amber + '1a', borderColor: C.amber }]}
              onPress={handleConvert}
              disabled={saving}
            >
              <Text style={[S.actionTxt, { color: C.amber }]}>🧾  Convert to Invoice</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* GBB Presentation modal */}
      <PresentationModal
        visible={showPresent}
        onClose={() => !selectingOption && setShowPresent(false)}
        estimate={estimate}
        onSelectOption={isDraft ? handleSelectOption : null}
      />

      {/* Selecting-option loading overlay */}
      {selectingOption && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <ActivityIndicator size="large" color={C.green} />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Preparing estimate…</Text>
          </View>
        </Modal>
      )}

      {/* Signature pad modal */}
      {showSig && (
        <SignaturePad
          signerName={signerName}
          onNameChange={setSignerName}
          onDone={handleSign}
          onCancel={() => setShowSig(false)}
        />
      )}

      {/* Now or Later modal */}
      <Modal visible={showNowLater} transparent animationType="fade">
        <View style={nl.backdrop}>
          <View style={nl.sheet}>
            <Text style={nl.check}>✅</Text>
            <Text style={nl.title}>Estimate Signed!</Text>
            <Text style={nl.sub}>
              {estimate?.customer_name} approved the estimate. Ready to start work?
            </Text>

            <TouchableOpacity style={nl.nowBtn} onPress={handleWorkNow} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.bg} size="small" />
                : <>
                    <Text style={nl.nowEmoji}>🔧</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={nl.nowTitle}>Start Work Now</Text>
                      <Text style={nl.nowSub}>Creates invoice and takes you there</Text>
                    </View>
                  </>
              }
            </TouchableOpacity>

            <TouchableOpacity style={nl.laterBtn} onPress={handleWorkLater} disabled={saving}>
              <Text style={nl.laterEmoji}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={nl.laterTitle}>Schedule for Later</Text>
                <Text style={nl.laterSub}>Flags this job for the dispatcher to reschedule</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ServiceTitan-style pricebook picker sheet */}
      <PricebookPickerSheet
        visible={!!pbSheet}
        onClose={() => setPbSheet(null)}
        onPickMultiple={handlePbPick}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header: { borderRadius: 14, borderWidth: 1.5, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  customer: { fontSize: 20, fontWeight: '800', color: C.text },
  meta: { fontSize: 12, color: C.muted, marginTop: 4 },
  statusBadge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  sectionLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  addBtn: { backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border2 },
  addBtnText: { color: C.green, fontSize: 12, fontWeight: '700' },

  card: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, gap: 0 },
  lineItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  liName: { fontSize: 14, fontWeight: '600', color: C.text },
  liNotes: { fontSize: 11, color: C.muted, lineHeight: 15, marginTop: 3 },
  liQty: { fontSize: 11, color: C.muted, marginTop: 2 },
  liPrice: { fontSize: 15, fontWeight: '700', color: C.text },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalLabel: { fontSize: 13, color: C.muted },
  totalVal: { fontSize: 13, color: C.text },
  totalFinalRow: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 10 },
  totalFinalLabel: { fontSize: 16, fontWeight: '800', color: C.text },
  totalFinalVal: { fontSize: 20, fontWeight: '800', color: C.green },

  actionsBlock: { gap: 10, marginTop: 4 },
  actionBtn: { borderWidth: 1.5, borderRadius: 14, padding: 16, alignItems: 'center' },
  actionTxt: { fontSize: 15, fontWeight: '700' },

  notesInput: {
    fontSize: 14, color: C.text, lineHeight: 22,
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border2,
    padding: 12, minHeight: 90,
  },
  aiBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.amber + '1a', borderWidth: 1, borderColor: C.amber,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },
  aiBtnText: { fontSize: 12, fontWeight: '700', color: C.amber },
  saveNotesBtn: {
    backgroundColor: C.green, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  saveNotesBtnText: { fontSize: 13, fontWeight: '800', color: C.bg },

  // GBB toggle button
  gbbToggle: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: C.border2, backgroundColor: C.surface2,
  },
  gbbToggleActive: { borderColor: C.purple, backgroundColor: C.purple + '1a' },
  gbbToggleTxt: { fontSize: 12, fontWeight: '700', color: C.muted },
  gbbToggleTxtActive: { color: C.purple },

  // Present button
  presentBtn: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: C.amber, backgroundColor: C.amber + '18',
  },
  presentBtnTxt: { fontSize: 12, fontWeight: '800', color: C.amber },

  // GBB tab bar
  gbbTabBar: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden',
  },
  gbbTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  gbbTabLabel: { fontSize: 13, fontWeight: '700' },
  gbbTabTotal: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // GBB tab content
  gbbTabContent: {
    backgroundColor: C.surface, borderWidth: 1, borderTopWidth: 0,
    borderColor: C.border, borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    padding: 14, gap: 0,
  },
  gbbOptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  gbbOptTitle: { fontSize: 14, fontWeight: '800' },
  gbbOptTotal: { fontSize: 16, fontWeight: '800' },
  gbbEmpty: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 18, fontStyle: 'italic' },

  // GBB action row
  gbbActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  gbbActionBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  gbbActionTxt: { fontSize: 13, fontWeight: '700' },
  gbbDupBtn: { flex: 1, borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: C.surface2 },
  gbbDupTxt: { fontSize: 13, fontWeight: '600', color: C.muted },

  // GBB comparison summary row
  gbbCompare: {
    flexDirection: 'row', backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    marginTop: 10, overflow: 'hidden',
  },
  gbbCompareChip: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  gbbCompareLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  gbbCompareTotal: { fontSize: 14, fontWeight: '800', marginTop: 2 },
});

const nl = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, gap: 14, paddingBottom: 44,
  },
  check: { fontSize: 40, textAlign: 'center', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  sub: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  nowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.green, borderRadius: 16, padding: 18,
  },
  nowEmoji: { fontSize: 24 },
  nowTitle: { fontSize: 16, fontWeight: '800', color: C.bg },
  nowSub: { fontSize: 12, color: C.bg, opacity: 0.8, marginTop: 2 },
  laterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface2, borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: C.border2,
  },
  laterEmoji: { fontSize: 24 },
  laterTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  laterSub: { fontSize: 12, color: C.muted, marginTop: 2 },
});

const pres = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#080b11' },

  // Rotate hint (portrait)
  rotateCover: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 40 },
  rotateEmoji: { fontSize: 64 },
  rotateTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  rotateSub: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22 },
  rotateCancelBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#232b3e' },
  rotateCancelTxt: { color: '#64748b', fontWeight: '600', fontSize: 14 },

  // Landscape layout
  landscape: { flex: 1, paddingHorizontal: 16, paddingVertical: 10 },
  presentTitle: { fontSize: 14, color: '#64748b', fontWeight: '600', letterSpacing: 0.5, textAlign: 'center', marginBottom: 8 },
  closeBtn: {
    position: 'absolute', top: 10, right: 16, zIndex: 10,
    backgroundColor: '#1e2535', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#232b3e',
  },
  closeTxt: { color: '#64748b', fontWeight: '700', fontSize: 13 },

  // 3 columns
  colRow: { flex: 1, flexDirection: 'row', gap: 10, marginTop: 30 },
  col: {
    flex: 1, borderWidth: 1.5, borderRadius: 16, overflow: 'hidden',
  },
  colHighlight: {
    shadowColor: '#a78bfa', shadowOpacity: 0.25, shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },

  // Column header
  colHeader: {
    padding: 14, borderBottomWidth: 1, alignItems: 'center', gap: 4,
  },
  recommendedBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 4,
  },
  recommendedTxt: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  colIcon: { fontSize: 22 },
  colLabel: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  colTotal: { fontSize: 22, fontWeight: '900', marginTop: 2 },

  // Items
  colScroll: { flex: 1, paddingHorizontal: 12 },
  colItem: { paddingVertical: 9 },
  colItemName: { fontSize: 12, color: '#e2e8f5', fontWeight: '500', lineHeight: 16 },
  colItemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  colItemQty: { fontSize: 10, color: '#64748b' },
  colItemPrice: { fontSize: 12, fontWeight: '700' },
  colEmpty: { color: '#3d4f6e', textAlign: 'center', marginTop: 20, fontSize: 13, fontStyle: 'italic' },

  // Footer
  colFooter: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderTopWidth: 1, alignItems: 'center',
  },
  colFooterLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  colFooterTotal: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  chooseBtn: {
    marginTop: 10, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16,
    alignItems: 'center', alignSelf: 'stretch',
  },
  chooseBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

const sig = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 48, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  sub: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: -4 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  fieldInput: {
    backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border2,
    padding: 12, fontSize: 15, color: C.text,
  },
  padWrap: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: C.border2,
    overflow: 'hidden', justifyContent: 'center', alignItems: 'center', alignSelf: 'center',
  },
  placeholder: { fontSize: 16, color: '#aaa', fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8 },
  clearBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  clearTxt: { color: C.muted, fontWeight: '600' },
  cancelBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelTxt: { color: C.muted, fontWeight: '600' },
  doneBtn: { flex: 2, padding: 13, borderRadius: 12, backgroundColor: C.green, alignItems: 'center' },
  doneTxt: { color: C.bg, fontWeight: '800', fontSize: 15 },
});
