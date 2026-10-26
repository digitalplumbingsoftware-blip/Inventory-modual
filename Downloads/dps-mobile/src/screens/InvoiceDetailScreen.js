import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Modal, TextInput, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  RefreshControl, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import dayjs from 'dayjs';
import { C } from '../theme';
import {
  getInvoice, addInvoiceItem, removeInvoiceItem,
  getInventoryLocations, getLocationStock, postInventoryMove,
  recordInvoicePayment, getPaymentMethods, getPricingModel, updateJob,
  updateInvoiceNotes, updateInvoiceJobDescription, aiRewrite, sendInvoiceEmail,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';
import PricebookPickerSheet from '../components/PricebookPickerSheet';

const fmt = (n) => '$' + parseFloat(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default function InvoiceDetailScreen({ route, navigation }) {
  const { user } = useAuth();
  // Accept either a full invoice object OR just an invoiceId to fetch
  const { invoice: initialInvoice, invoiceId: paramInvoiceId, jobId: paramJobId } = route.params || {};
  const [inv, setInv] = useState(initialInvoice || null);
  const [loading, setLoading] = useState(!initialInvoice);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Payment type modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethods, setPayMethods] = useState([]);
  const [payMethodsLoading, setPayMethodsLoading] = useState(false);
  const [selectedPayType, setSelectedPayType] = useState(null); // null | method object
  const [payAmount, setPayAmount] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Notes editing
  const [editNotes, setEditNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [editJobDesc, setEditJobDesc] = useState('');
  const [savingJobDesc, setSavingJobDesc] = useState(false);
  const [jobDescSaved, setJobDescSaved] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Send email
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    setEditNotes(inv?.notes || '');
    setEditJobDesc(inv?.job_description || '');
    setNotesSaved(false);
  }, [inv?.id]);

  useEffect(() => {
    if (inv?.customer_email) setEmailTo(inv.customer_email);
  }, [inv?.id]);

  const handleSendEmail = async () => {
    if (!emailTo.trim()) { Alert.alert('Email Required', 'Enter an email address to send to.'); return; }
    setEmailSending(true);
    try {
      await sendInvoiceEmail(inv.id, emailTo.trim());
      setEmailSent(true);
      setShowEmailModal(false);
      Alert.alert('Sent!', `Invoice emailed to ${emailTo.trim()}`);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Could not send email.';
      Alert.alert('Send Failed', msg);
    } finally { setEmailSending(false); }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const updated = await updateInvoiceNotes(inv.id, editNotes);
      setInv(updated);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      Alert.alert('Error', 'Could not save notes.');
    } finally { setSavingNotes(false); }
  };

  const saveJobDesc = async () => {
    setSavingJobDesc(true);
    try {
      const updated = await updateInvoiceJobDescription(inv.id, editJobDesc);
      setInv(updated);
      setJobDescSaved(true);
      setTimeout(() => setJobDescSaved(false), 2000);
    } catch (e) {
      Alert.alert('Error', 'Could not save job description.');
    } finally { setSavingJobDesc(false); }
  };

  const rewriteNotes = async () => {
    if (!editNotes.trim()) { Alert.alert('Nothing to rewrite', 'Type some notes first.'); return; }
    setAiLoading(true);
    try {
      const result = await aiRewrite(editNotes, 'plumbing service');
      setEditNotes(result.text);
      setNotesSaved(false);
    } catch (e) {
      Alert.alert('Error', 'Could not reach AI. Check your API key.');
    } finally { setAiLoading(false); }
  };

  // Return trip flag
  const [returnTripSent, setReturnTripSent] = useState(false);
  const [pbSheetOpen, setPbSheetOpen] = useState(false);
  const [returnTripSending, setReturnTripSending] = useState(false);

  // Dispatch alert
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertText, setAlertText] = useState('');
  const [alertSending, setAlertSending] = useState(false);
  const [alertSent, setAlertSent] = useState(false);

  const handleReturnTrip = () => {
    if (!jobId) { Alert.alert('No Job', 'This invoice is not linked to a job.'); return; }
    Alert.alert(
      'Return Trip Needed?',
      'This will flag the job on the dispatch board so the dispatcher knows a follow-up visit is required.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Flag It', onPress: async () => {
            setReturnTripSending(true);
            try {
              await updateJob(jobId, { return_trip_needed: true });
              setReturnTripSent(true);
              Alert.alert('Flagged ✅', 'Dispatch has been notified that a return trip is needed.');
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.error || 'Could not send flag.');
            } finally { setReturnTripSending(false); }
          },
        },
      ]
    );
  };

  const sendDispatchAlert = async () => {
    if (!alertText.trim() || !jobId) return;
    setAlertSending(true);
    try {
      await updateJob(jobId, { dispatch_alert: alertText.trim() });
      setAlertSent(true);
      setShowAlertModal(false);
      setAlertText('');
      Alert.alert('Alert Sent 🚨', 'Dispatch has been notified. The job will show a red alert on the board.');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not send alert.');
    } finally { setAlertSending(false); }
  };

  // Pricing model — fetched once on mount, defaults to time_material
  const [pricingModel, setPricingModel] = useState('time_material');
  useEffect(() => {
    getPricingModel().then(d => setPricingModel(d.model || 'time_material')).catch(() => {});
  }, []);

  // Complete Job — marks the linked job status='completed' from the invoice.
  const [completingJob, setCompletingJob] = useState(false);
  const [jobCompleted, setJobCompleted]   = useState(false);
  const handleCompleteJob = () => {
    if (!jobId || completingJob || jobCompleted) return;
    Alert.alert(
      'Complete This Job?',
      'This will mark the job as completed on the dispatch board and remove it from your active list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Job',
          style: 'default',
          onPress: async () => {
            setCompletingJob(true);
            try {
              await updateJob(jobId, { status: 'completed', completed_at: new Date().toISOString() });
              setJobCompleted(true);
              Alert.alert('Job Completed ✅', 'Nice work.', [
                { text: 'Back to Jobs', onPress: () => navigation.navigate('MyJobs') },
              ]);
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.error || e.message || 'Could not complete the job.');
            } finally { setCompletingJob(false); }
          },
        },
      ]
    );
  };

  // Truck inventory modal state
  const [showTruckModal, setShowTruckModal] = useState(false);
  const [truckLocations, setTruckLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [truckItems, setTruckItems] = useState([]);
  const [truckSearch, setTruckSearch] = useState('');
  const [truckLoading, setTruckLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [addQty, setAddQty] = useState('1');
  const [addingItem, setAddingItem] = useState(false);

  // Load invoice if only ID was passed (e.g. after convert from estimate)
  useEffect(() => {
    if (!initialInvoice && paramInvoiceId) {
      getInvoice(paramInvoiceId)
        .then(data => { setInv(data); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, []);

  const refresh = async (isPull = false) => {
    if (isPull) setRefreshing(true);
    try {
      const id = inv?.id || paramInvoiceId;
      if (id) { const fresh = await getInvoice(id); setInv(fresh); }
    } catch (e) { /* keep old state */ }
    finally { if (isPull) setRefreshing(false); }
  };

  const jobId = paramJobId || inv?.job_id;

  const STATUS_COLOR = {
    draft: C.muted, sent: C.blue, approved: C.amber,
    paid: C.green, void: C.red,
  };

  if (loading || !inv) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.green} size="large" />
      </View>
    );
  }

  const color = STATUS_COLOR[inv.status] || C.muted;
  const subtotal = parseFloat(inv.subtotal || 0);
  const tax = parseFloat(inv.tax_amount || 0);
  const total = parseFloat(inv.total || 0);
  const editable = inv.status === 'draft' || inv.status === 'sent';
  // Materials pulled off the truck can be recorded against the invoice even
  // after it's approved/paid — the job may have been reopened and the tech
  // still needs to deduct parts from stock. Void invoices stay locked.
  const canAddMaterials = inv.status !== 'void';
  const canCollect = inv.status !== 'paid' && inv.status !== 'void';
  const items = (inv.line_items || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // ── Payment type modal ────────────────────────────────────────
  const openPayModal = async () => {
    const remaining = total - parseFloat(inv.amount_paid || 0);
    setPayAmount(remaining.toFixed(2));
    setCheckNumber('');
    setSelectedPayType(null);
    setShowPayModal(true);
    setPayMethodsLoading(true);
    try {
      const methods = await getPaymentMethods();
      setPayMethods(methods.filter(m => m.enabled));
    } catch (e) {
      // Fallback defaults if network fails
      setPayMethods([
        { id: 'cash',        label: 'Cash',                icon: '💵' },
        { id: 'check',       label: 'Check',               icon: '📝' },
        { id: 'credit_card', label: 'Credit / Debit Card', icon: '💳' },
      ]);
    } finally { setPayMethodsLoading(false); }
  };

  const handlePaySubmit = async () => {
    const amt = parseFloat(payAmount);
    if (!selectedPayType) { Alert.alert('Select Type', 'Choose a payment method.'); return; }
    if (!amt || amt <= 0) { Alert.alert('Enter Amount', 'Enter the payment amount.'); return; }
    if (selectedPayType.id === 'check' && !checkNumber.trim()) {
      Alert.alert('Check Number', 'Please enter the check number.'); return;
    }
    if (selectedPayType.id === 'credit_card') {
      // Navigate to Square payment screen
      setShowPayModal(false);
      navigation.navigate('PaymentMain', {
        jobId,
        customerName: inv.customer_name,
        invoiceId: inv.id,
        invoiceTotal: amt,
      });
      return;
    }
    if (selectedPayType.type === 'financing') {
      Alert.alert('Financing', 'Customer must apply via the link sent to their phone or email.');
      return;
    }
    setPaySubmitting(true);
    try {
      await recordInvoicePayment(
        inv.id, amt,
        selectedPayType.id,
        selectedPayType.id === 'check' ? checkNumber.trim() : undefined
      );
      await refresh();
      setShowPayModal(false);
      Alert.alert('Payment Recorded ✅', `${selectedPayType.label} payment of $${amt.toFixed(2)} recorded.`);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not record payment.');
    } finally { setPaySubmitting(false); }
  };

  // ── Pricebook add ────────────────────────────────────────────
  const handleAddFromPricebook = () => setPbSheetOpen(true);

  const handlePbPick = async (task) => {
    if (busy) return;
    setBusy(true);
    setPbSheetOpen(false);
    try {
      await addInvoiceItem(inv.id, {
        description: task.description,
        quantity: task.quantity || 1,
        unit_price: task.flat_rate,
      });
      await refresh();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error || e.message || 'Could not add item');
    } finally { setBusy(false); }
  };

  // ── Truck inventory add — scoped to THIS tech's truck only ────
  const openTruckModal = async () => {
    setShowTruckModal(true);
    setTruckLoading(true);
    setSelectedItem(null);
    setAddQty('1');
    setTruckSearch('');
    try {
      const locs = await getInventoryLocations();
      // Only show the logged-in tech's own truck
      const myTruck = locs.find(l => l.type === 'truck' && l.technician_id === user?.id);
      if (!myTruck) {
        Alert.alert('No Truck', 'You have no truck assigned. Contact your manager.');
        setShowTruckModal(false);
        return;
      }
      setTruckLocations([myTruck]);
      setSelectedLocation(myTruck);
      const stock = await getLocationStock(myTruck.id);
      setTruckItems(stock.filter(i => i.qty > 0));
    } catch (e) {
      Alert.alert('Error', 'Could not load truck inventory.');
      setShowTruckModal(false);
    } finally { setTruckLoading(false); }
  };

  const handleAddFromTruck = async () => {
    if (!selectedItem || !selectedLocation) return;
    const qty = parseInt(addQty) || 1;
    if (qty <= 0) { Alert.alert('Invalid Qty', 'Enter a quantity of 1 or more.'); return; }
    if (qty > selectedItem.qty) {
      Alert.alert('Not Enough Stock', `Only ${selectedItem.qty} on this truck.`);
      return;
    }
    setAddingItem(true);
    try {
      // Always record the inventory movement (usage) regardless of pricing model
      await postInventoryMove({
        type: 'usage',
        item_id: selectedItem.id,
        from_location: selectedLocation.id,
        qty,
        job_id: jobId || null,
        notes: `Used on job — invoice #${inv.id?.slice(0, 8)}`,
      });

      if (pricingModel === 'time_material') {
        // Time & Material: add the part as a billable line item on the invoice
        await addInvoiceItem(inv.id, {
          description: selectedItem.name,
          quantity: qty,
          unit_price: parseFloat(selectedItem.cost || 0),
          cost: parseFloat(selectedItem.cost || 0),
        });
        await refresh();
        setShowTruckModal(false);
        Alert.alert('Material Added', `${qty}x ${selectedItem.name} recorded and added to invoice.`);
      } else {
        // Flat Rate: material recorded for inventory but not billed
        await refresh();
        setShowTruckModal(false);
        Alert.alert('Material Recorded', `${qty}x ${selectedItem.name} deducted from truck. Not added to invoice (Flat Rate).`);
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.error || 'Could not add part.');
    } finally { setAddingItem(false); }
  };

  const handleRemoveItem = (itemId) => {
    Alert.alert('Remove Item', 'Remove this line from the invoice?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try { const fresh = await removeInvoiceItem(inv.id, itemId); setInv(fresh); }
          catch (e) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const filteredTruckItems = truckItems.filter(i =>
    i.name?.toLowerCase().includes(truckSearch.toLowerCase()) ||
    i.sku?.toLowerCase().includes(truckSearch.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={C.green} colors={[C.green]}/>}
      >
        {/* Header */}
        <View style={[styles.header, { borderColor: color + '44', backgroundColor: color + '0d' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.invNum}>{inv.display_number || `Invoice #${inv.invoice_number || inv.id?.slice(0, 8)}`}</Text>
            <Text style={styles.customer}>{inv.customer_name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: color + '22', borderColor: color }]}>
            <Text style={[styles.statusText, { color }]}>{inv.status?.toUpperCase()}</Text>
          </View>
        </View>

        {/* Dates */}
        <View style={styles.card}>
          {[
            ['Created', dayjs(inv.created_at).format('MMM D, YYYY')],
            ['Due Date', inv.due_date ? dayjs(inv.due_date).format('MMM D, YYYY') : '—'],
          ].map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={styles.rowLabel}>{k}</Text>
              <Text style={styles.rowVal}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Line items */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.sectionLabel}>LINE ITEMS</Text>
            {(editable || canAddMaterials) && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {canAddMaterials && (
                  <TouchableOpacity onPress={openTruckModal} style={[styles.addBtn, { borderColor: C.amber }]}>
                    <Text style={[styles.addBtnText, { color: C.amber }]}>🧰 Materials</Text>
                  </TouchableOpacity>
                )}
                {editable && (
                  <TouchableOpacity onPress={handleAddFromPricebook} disabled={busy} style={styles.addBtn}>
                    <Text style={styles.addBtnText}>{busy ? 'Adding…' : '+ Pricebook'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <View style={styles.card}>
            {items.length > 0 ? (
              items.map((item, i) => (
                <View key={item.id || i} style={[styles.lineItem, i < items.length - 1 && styles.lineItemBorder]}>
                  <View style={styles.lineItemInfo}>
                    <Text style={styles.lineItemName}>{item.name || item.description}</Text>
                    {item.notes ? <Text style={styles.lineItemNotes}>{item.notes}</Text> : null}
                    <Text style={styles.lineItemQty}>{item.quantity} × {fmt(item.unit_price)}</Text>
                  </View>
                  <Text style={styles.lineItemTotal}>{fmt(item.quantity * item.unit_price)}</Text>
                  {editable && item.id && (
                    <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No line items — add from pricebook or truck.</Text>
            )}
          </View>
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Subtotal</Text>
            <Text style={styles.rowVal}>{fmt(subtotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tax</Text>
            <Text style={styles.rowVal}>{fmt(tax)}</Text>
          </View>
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalVal}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Job Description */}
        <View>
          <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>JOB DESCRIPTION</Text>
          <View style={[styles.card, { padding: 12, gap: 10 }]}>
            <TextInput
              style={styles.notesInput}
              value={editJobDesc}
              onChangeText={(t) => { setEditJobDesc(t); setJobDescSaved(false); }}
              placeholder="Describe the work performed (shown at top of the printable invoice)…"
              placeholderTextColor={C.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.saveNotesBtn, (savingJobDesc || jobDescSaved) && { opacity: 0.7 }]}
              onPress={saveJobDesc}
              disabled={savingJobDesc || jobDescSaved}
            >
              {savingJobDesc
                ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={styles.saveNotesBtnText}>{jobDescSaved ? '✓ Saved' : 'Save'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View>
          <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>NOTES</Text>
          <View style={[styles.card, { padding: 12, gap: 10 }]}>
            <TextInput
              style={styles.notesInput}
              value={editNotes}
              onChangeText={(t) => { setEditNotes(t); setNotesSaved(false); }}
              placeholder="Add notes about this job..."
              placeholderTextColor={C.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.aiBtn, aiLoading && { opacity: 0.6 }]}
                onPress={rewriteNotes}
                disabled={aiLoading}
              >
                {aiLoading
                  ? <ActivityIndicator color={C.amber} size="small" />
                  : <Text style={styles.aiBtnText}>✨ Make it sound better</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveNotesBtn, (savingNotes || notesSaved) && { opacity: 0.7 }]}
                onPress={saveNotes}
                disabled={savingNotes || notesSaved}
              >
                {savingNotes
                  ? <ActivityIndicator color={C.bg} size="small" />
                  : <Text style={styles.saveNotesBtnText}>{notesSaved ? '✓ Saved' : 'Save'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Collect Payment */}
        {canCollect && (
          <TouchableOpacity style={styles.collectBtn} onPress={openPayModal}>
            <Text style={styles.collectBtnText}>
              💳  Collect Payment — {fmt(total - parseFloat(inv.amount_paid || 0))}
            </Text>
          </TouchableOpacity>
        )}

        {/* Send Invoice Email */}
        <TouchableOpacity
          style={[styles.emailBtn, emailSent && { opacity: 0.6 }]}
          onPress={() => setShowEmailModal(true)}
        >
          <Text style={styles.emailBtnText}>
            {emailSent ? '✉️  Invoice Sent' : '✉️  Send Invoice Email'}
          </Text>
        </TouchableOpacity>

        {/* Return Trip Needed */}
        {jobId && (
          <TouchableOpacity
            style={[styles.returnTripBtn, (returnTripSent || returnTripSending) && { opacity: 0.6 }]}
            onPress={handleReturnTrip}
            disabled={returnTripSent || returnTripSending}
          >
            <Text style={styles.returnTripText}>
              {returnTripSent ? '🔄  Return Trip Flagged' : returnTripSending ? 'Sending…' : '🔄  Return Trip Needed'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Alert Dispatch */}
        {jobId && (
          <TouchableOpacity
            style={[styles.alertDispatchBtn, alertSent && { opacity: 0.6 }]}
            onPress={() => setShowAlertModal(true)}
            disabled={alertSent}
          >
            <Text style={styles.alertDispatchText}>
              {alertSent ? '🚨  Alert Sent to Dispatch' : '🚨  Alert Dispatch'}
            </Text>
          </TouchableOpacity>
        )}

        {inv.status === 'paid' && (
          <View style={[styles.card, { borderColor: C.green + '44', backgroundColor: C.green + '08', alignItems: 'center', padding: 18 }]}>
            <Text style={{ fontSize: 28 }}>✅</Text>
            <Text style={{ color: C.green, fontWeight: '800', fontSize: 16, marginTop: 8 }}>Paid in Full</Text>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{fmt(inv.amount_paid)} collected</Text>
          </View>
        )}

        {/* extra bottom padding so the last card isn't hidden under the sticky
            Complete Job footer */}
        <View style={{ height: jobId ? 100 : 40 }} />
      </ScrollView>

      {/* ── Sticky Complete Job button (only when linked to a job) ───────── */}
      {jobId && (
        <View style={styles.completeFooter}>
          <TouchableOpacity
            onPress={handleCompleteJob}
            disabled={completingJob || jobCompleted}
            activeOpacity={0.8}
            style={[
              styles.completeBtn,
              (completingJob || jobCompleted) && { opacity: 0.55 },
            ]}>
            {completingJob ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.completeBtnText}>
                {jobCompleted ? '✅  Job Completed' : '✅  Complete Job'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Send Invoice Email Modal */}
      <Modal visible={showEmailModal} transparent animationType="slide" onRequestClose={() => setShowEmailModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={em.backdrop}>
              <TouchableWithoutFeedback>
                <View style={em.sheet}>
                  <View style={em.handle} />
                  <Text style={em.title}>✉️ Send Invoice</Text>
                  <Text style={em.sub}>Invoice #{inv?.invoice_number || inv?.id?.slice(0, 8)} · {fmt(total)}</Text>

                  <Text style={em.label}>SEND TO</Text>
                  <TextInput
                    style={em.input}
                    value={emailTo}
                    onChangeText={setEmailTo}
                    placeholder="customer@email.com"
                    placeholderTextColor={C.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {inv?.customer_email && emailTo !== inv.customer_email && (
                    <TouchableOpacity onPress={() => setEmailTo(inv.customer_email)} style={em.prefillBtn}>
                      <Text style={em.prefillTxt}>Use {inv.customer_email}</Text>
                    </TouchableOpacity>
                  )}

                  <View style={em.btnRow}>
                    <TouchableOpacity style={em.cancelBtn} onPress={() => { Keyboard.dismiss(); setShowEmailModal(false); }}>
                      <Text style={em.cancelTxt}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[em.sendBtn, (!emailTo.trim() || emailSending) && { opacity: 0.5 }]}
                      onPress={handleSendEmail}
                      disabled={!emailTo.trim() || emailSending}
                    >
                      {emailSending
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={em.sendTxt}>✉️ Send</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Alert Dispatch Modal */}
      <Modal visible={showAlertModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={am.backdrop}>
            <View style={am.sheet}>
              <View style={am.handle} />
              <Text style={am.title}>🚨 Alert Dispatch</Text>
              <Text style={am.sub}>Your message will flash red on the dispatch board until dismissed.</Text>
              <TextInput
                style={am.input}
                value={alertText}
                onChangeText={setAlertText}
                placeholder="Describe the issue (e.g. need part, customer request, access problem)…"
                placeholderTextColor={C.muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />
              <View style={am.btnRow}>
                <TouchableOpacity style={am.cancelBtn} onPress={() => { setShowAlertModal(false); setAlertText(''); }}>
                  <Text style={am.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[am.sendBtn, (!alertText.trim() || alertSending) && { opacity: 0.5 }]}
                  onPress={sendDispatchAlert}
                  disabled={!alertText.trim() || alertSending}
                >
                  {alertSending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={am.sendTxt}>🚨 Send Alert</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Payment Type Modal */}
      <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setShowPayModal(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {/* Tapping the dark backdrop dismisses the keyboard or closes the modal */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={pm.backdrop}>
              {/* Inner touchable prevents backdrop tap from propagating through the sheet */}
              <TouchableWithoutFeedback>
                <View style={pm.sheet}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: 14 }}
                  >
                    {/* Handle bar */}
                    <View style={pm.handle} />
                    <Text style={pm.title}>Collect Payment</Text>
                    <Text style={pm.sub}>{inv.customer_name}</Text>

                    {/* Amount field */}
                    <View style={pm.amtRow}>
                      <Text style={pm.dollar}>$</Text>
                      <TextInput
                        style={pm.amtInput}
                        value={payAmount}
                        onChangeText={setPayAmount}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={C.muted}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>

                    {/* Payment type buttons */}
                    {payMethodsLoading ? (
                      <ActivityIndicator color={C.green} style={{ marginVertical: 20 }} />
                    ) : (
                      <View style={pm.methodGrid}>
                        {payMethods.map(m => (
                          <TouchableOpacity
                            key={m.id}
                            style={[pm.methodBtn, selectedPayType?.id === m.id && pm.methodBtnActive]}
                            onPress={() => { Keyboard.dismiss(); setSelectedPayType(prev => prev?.id === m.id ? null : m); }}
                          >
                            <Text style={pm.methodIcon}>{m.icon || '💰'}</Text>
                            <Text style={[pm.methodLabel, selectedPayType?.id === m.id && { color: C.green }]}>
                              {m.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Check number field */}
                    {selectedPayType?.id === 'check' && (
                      <View style={pm.checkRow}>
                        <Text style={pm.checkLabel}>CHECK NUMBER</Text>
                        <TextInput
                          style={pm.checkInput}
                          value={checkNumber}
                          onChangeText={setCheckNumber}
                          placeholder="e.g. 1042"
                          placeholderTextColor={C.muted}
                          keyboardType="number-pad"
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          autoFocus
                        />
                        {/* Done bar for iOS number-pad (no built-in done key) */}
                        <TouchableOpacity
                          onPress={Keyboard.dismiss}
                          style={pm.doneBar}
                          activeOpacity={0.7}
                        >
                          <Text style={pm.doneTxt}>Done ✓</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Financing note */}
                    {selectedPayType?.type === 'financing' && (
                      <View style={pm.finNote}>
                        <Text style={pm.finNoteText}>
                          Customer applies for financing via a link sent to their phone or email. Tap "Record" to mark as pending.
                        </Text>
                      </View>
                    )}

                    {/* Credit card note */}
                    {selectedPayType?.id === 'credit_card' && (
                      <View style={pm.finNote}>
                        <Text style={pm.finNoteText}>You'll be taken to the card entry screen (Square).</Text>
                      </View>
                    )}

                    <View style={pm.btnRow}>
                      <TouchableOpacity style={pm.cancelBtn} onPress={() => { Keyboard.dismiss(); setShowPayModal(false); }}>
                        <Text style={pm.cancelTxt}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[pm.confirmBtn, (!selectedPayType || paySubmitting) && { opacity: 0.5 }]}
                        onPress={handlePaySubmit}
                        disabled={!selectedPayType || paySubmitting}
                      >
                        {paySubmitting
                          ? <ActivityIndicator color={C.bg} size="small" />
                          : <Text style={pm.confirmTxt}>
                              {selectedPayType?.id === 'credit_card' ? '→ Card Entry' : '✓ Record Payment'}
                            </Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Truck Inventory Modal */}
      <Modal visible={showTruckModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {/* Header */}
          <View style={tm.header}>
            <Text style={tm.title}>🧰 Materials — from Truck</Text>
            <TouchableOpacity onPress={() => setShowTruckModal(false)}>
              <Text style={{ color: C.muted, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Pricing model banner */}
          <View style={{
            marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 10,
            backgroundColor: pricingModel === 'flat_rate' ? C.amber + '18' : C.green + '18',
            borderWidth: 1,
            borderColor: pricingModel === 'flat_rate' ? C.amber + '55' : C.green + '55',
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <Text style={{ fontSize: 16 }}>{pricingModel === 'flat_rate' ? '📋' : '🔧'}</Text>
            <Text style={{ fontSize: 12, color: pricingModel === 'flat_rate' ? C.amber : C.green, fontWeight: '600', flex: 1 }}>
              {pricingModel === 'flat_rate'
                ? 'Flat Rate — material will be recorded for inventory only, not added to invoice'
                : 'Time & Material — material will be added to invoice as a line item'}
            </Text>
          </View>

          {/* My truck label */}
          {selectedLocation && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
              <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>
                🚚 {selectedLocation.name}
              </Text>
            </View>
          )}

          {/* Search */}
          <View style={tm.searchWrap}>
            <TextInput
              style={tm.search}
              value={truckSearch}
              onChangeText={setTruckSearch}
              placeholder="Search parts…"
              placeholderTextColor={C.muted}
            />
          </View>

          {truckLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator color={C.green} size="large" />
            </View>
          ) : (
            <>
              <FlatList
                data={filteredTruckItems}
                keyExtractor={i => i.id}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, gap: 8 }}
                ListEmptyComponent={
                  <Text style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>
                    No parts in stock on this truck
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[tm.itemRow, selectedItem?.id === item.id && tm.itemRowSelected]}
                    onPress={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={tm.itemName}>{item.name}</Text>
                      <Text style={tm.itemSku}>{item.sku} · {fmt(item.cost)} each</Text>
                    </View>
                    <View style={tm.qtyBadge}>
                      <Text style={tm.qtyText}>{item.qty} left</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />

              {/* Add panel */}
              {selectedItem && (
                <View style={tm.addPanel}>
                  <Text style={tm.addPanelTitle}>{selectedItem.name}</Text>
                  <View style={tm.addRow}>
                    <Text style={tm.addLabel}>QTY</Text>
                    <View style={tm.qtyRow}>
                      <TouchableOpacity
                        style={tm.qtyBtn}
                        onPress={() => setAddQty(q => String(Math.max(1, parseInt(q) - 1)))}
                      >
                        <Text style={tm.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={tm.qtyInput}
                        value={addQty}
                        onChangeText={setAddQty}
                        keyboardType="number-pad"
                      />
                      <TouchableOpacity
                        style={tm.qtyBtn}
                        onPress={() => setAddQty(q => String(Math.min(selectedItem.qty, parseInt(q) + 1)))}
                      >
                        <Text style={tm.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={tm.addTotal}>{fmt((parseInt(addQty) || 1) * parseFloat(selectedItem.cost || 0))}</Text>
                  </View>
                  <TouchableOpacity
                    style={[tm.confirmBtn, addingItem && { opacity: 0.6 }]}
                    onPress={handleAddFromTruck}
                    disabled={addingItem}
                  >
                    {addingItem
                      ? <ActivityIndicator color={C.bg} size="small" />
                      : <Text style={tm.confirmBtnText}>Add to Invoice + Deduct from Truck</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </Modal>

      {/* ServiceTitan-style pricebook picker sheet */}
      <PricebookPickerSheet
        visible={pbSheetOpen}
        onClose={() => setPbSheetOpen(false)}
        onPick={handlePbPick}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  completeFooter: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.bg,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24,
  },
  completeBtn: {
    backgroundColor: C.green,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  completeBtnText: {
    color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.4,
  },
  header: { borderRadius: 14, borderWidth: 1.5, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invNum: { fontSize: 13, color: C.muted, fontWeight: '600', marginBottom: 4 },
  customer: { fontSize: 20, fontWeight: '800', color: C.text },
  statusBadge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sectionLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  addBtn: {
    backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  addBtnText: { fontSize: 12, color: C.green, fontWeight: '700' },
  card: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.muted },
  rowVal: { fontSize: 13, color: C.text, fontWeight: '500' },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, gap: 10 },
  lineItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  lineItemInfo: { flex: 1, gap: 3 },
  lineItemName: { fontSize: 14, fontWeight: '600', color: C.text },
  lineItemNotes: { fontSize: 11, color: C.muted, lineHeight: 15, marginTop: 3 },
  lineItemQty: { fontSize: 12, color: C.muted, marginTop: 2 },
  lineItemTotal: { fontSize: 15, fontWeight: '700', color: C.text },
  removeBtn: { padding: 6 },
  removeBtnText: { fontSize: 16, color: C.red, fontWeight: '700' },
  totalRow: { borderTopWidth: 1, borderTopColor: C.border2 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: 1 },
  totalVal: { fontSize: 20, fontWeight: '800', color: C.green },
  notes: { fontSize: 13, color: C.text, lineHeight: 20, padding: 14 },
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
  emptyText: { fontSize: 13, color: C.dim, fontStyle: 'italic', padding: 14 },
  collectBtn: {
    backgroundColor: C.green, borderRadius: 14, padding: 18, alignItems: 'center',
    marginTop: 4,
  },
  collectBtnText: { fontSize: 16, fontWeight: '800', color: C.bg },
  returnTripBtn: {
    backgroundColor: '#f97316' + '22',
    borderWidth: 1.5,
    borderColor: '#f97316',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  returnTripText: { fontSize: 15, fontWeight: '700', color: '#f97316' },
  emailBtn: {
    padding: 16, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#4a9eff18', borderWidth: 1.5, borderColor: '#4a9eff55',
  },
  emailBtnText: { fontSize: 15, fontWeight: '700', color: '#4a9eff' },
  alertDispatchBtn: {
    backgroundColor: '#f56565' + '18',
    borderWidth: 1.5,
    borderColor: '#f56565',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  alertDispatchText: { fontSize: 15, fontWeight: '700', color: '#f56565' },
});

const pm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 44, gap: 14,
  },
  handle: { width: 36, height: 4, backgroundColor: C.border2, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  sub: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: -6 },
  amtRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 14, borderWidth: 1.5, borderColor: C.border2,
    paddingHorizontal: 16, marginVertical: 4,
  },
  dollar: { fontSize: 28, color: C.muted, marginRight: 4 },
  amtInput: { flex: 1, fontSize: 36, fontWeight: '300', color: C.text, paddingVertical: 12 },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  methodBtn: {
    flex: 1, minWidth: 90, alignItems: 'center', padding: 14,
    backgroundColor: C.bg, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, gap: 6,
  },
  methodBtnActive: { borderColor: C.green, backgroundColor: C.green + '11' },
  methodIcon: { fontSize: 26 },
  methodLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center' },
  checkRow: { gap: 6 },
  checkLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  checkInput: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1.5, borderColor: C.border2,
    padding: 14, fontSize: 18, color: C.text, fontWeight: '600',
  },
  doneBar: {
    alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 16,
    backgroundColor: C.green + '22', borderRadius: 8, borderWidth: 1, borderColor: C.green + '55',
    marginTop: 4,
  },
  doneTxt: { fontSize: 13, fontWeight: '700', color: C.green },
  finNote: {
    backgroundColor: C.amber + '11', borderRadius: 10, borderWidth: 1, borderColor: C.amber + '44',
    padding: 12,
  },
  finNoteText: { fontSize: 12, color: C.amber, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 12, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  cancelTxt: { color: C.muted, fontWeight: '600', fontSize: 15 },
  confirmBtn: { flex: 2, padding: 15, borderRadius: 12, backgroundColor: C.green, alignItems: 'center' },
  confirmTxt: { color: C.bg, fontWeight: '800', fontSize: 15 },
});

const tm = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 28, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  truckRow: { flexDirection: 'row', padding: 12, gap: 8 },
  truckBtn: {
    flex: 1, padding: 10, borderRadius: 10, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  truckBtnActive: { borderColor: C.amber, backgroundColor: C.amber + '11' },
  truckBtnText: { fontSize: 13, fontWeight: '600', color: C.muted },
  searchWrap: { padding: 12 },
  search: {
    backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border2,
    padding: 12, fontSize: 15, color: C.text,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  itemRowSelected: { borderColor: C.amber, backgroundColor: C.amber + '11' },
  itemName: { fontSize: 14, fontWeight: '600', color: C.text },
  itemSku: { fontSize: 11, color: C.muted, marginTop: 3 },
  qtyBadge: {
    backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: C.border,
  },
  qtyText: { fontSize: 12, fontWeight: '700', color: C.muted },
  addPanel: {
    padding: 20, borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.surface, gap: 12,
  },
  addPanelTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border2, justifyContent: 'center', alignItems: 'center',
  },
  qtyBtnText: { fontSize: 20, color: C.text, fontWeight: '300' },
  qtyInput: {
    width: 50, textAlign: 'center', fontSize: 18, fontWeight: '700', color: C.text,
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border2,
    paddingVertical: 6,
  },
  addTotal: { marginLeft: 'auto', fontSize: 18, fontWeight: '800', color: C.amber },
  confirmBtn: {
    backgroundColor: C.green, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: C.bg },
});

const am = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 44, gap: 14,
  },
  handle: { width: 36, height: 4, backgroundColor: C.border2, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', color: '#f56565', textAlign: 'center' },
  sub: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18, marginTop: -6 },
  input: {
    fontSize: 14, color: C.text, lineHeight: 22,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: '#f56565' + '55',
    padding: 14, minHeight: 110, textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 12, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  cancelTxt: { color: C.muted, fontWeight: '600', fontSize: 15 },
  sendBtn: { flex: 2, padding: 15, borderRadius: 12, backgroundColor: '#f56565', alignItems: 'center' },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

const em = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 44, gap: 14,
  },
  handle: { width: 36, height: 4, backgroundColor: C.border2, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  sub: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: -6 },
  label: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  input: {
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border2,
    padding: 14, fontSize: 16, color: C.text,
  },
  prefillBtn: {
    alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12,
    backgroundColor: '#4a9eff18', borderRadius: 8, borderWidth: 1, borderColor: '#4a9eff44',
  },
  prefillTxt: { fontSize: 12, color: '#4a9eff', fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  cancelTxt: { color: C.muted, fontWeight: '600', fontSize: 15 },
  sendBtn: { flex: 2, padding: 15, borderRadius: 12, backgroundColor: '#4a9eff', alignItems: 'center' },
  sendTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
