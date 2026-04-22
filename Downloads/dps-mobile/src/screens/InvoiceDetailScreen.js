import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import dayjs from 'dayjs';
import { C } from '../theme';

export default function InvoiceDetailScreen({ route }) {
  const { invoice: inv } = route.params;

  const STATUS_COLOR = { draft: C.muted, sent: C.blue, paid: C.green, overdue: C.red, void: C.dim };
  const color = STATUS_COLOR[inv.status] || C.muted;
  const subtotal = parseFloat(inv.subtotal || 0);
  const tax = parseFloat(inv.tax_amount || 0);
  const total = parseFloat(inv.total || 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Header */}
      <View style={[styles.header, { borderColor: color + '44', backgroundColor: color + '0d' }]}>
        <View>
          <Text style={styles.invNum}>Invoice #{inv.invoice_number || inv.id?.slice(0,8)}</Text>
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
        ].map(([k,v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowLabel}>{k}</Text>
            <Text style={styles.rowVal}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Line items */}
      <View>
        <Text style={styles.sectionLabel}>LINE ITEMS</Text>
        <View style={styles.card}>
          {inv.line_items && inv.line_items.length > 0 ? (
            inv.line_items.map((item, i) => (
              <View key={i} style={[styles.lineItem, i < inv.line_items.length - 1 && styles.lineItemBorder]}>
                <View style={styles.lineItemInfo}>
                  <Text style={styles.lineItemName}>{item.name || item.description}</Text>
                  <Text style={styles.lineItemQty}>{item.quantity} x ${parseFloat(item.unit_price).toFixed(2)}</Text>
                </View>
                <Text style={styles.lineItemTotal}>${(item.quantity * item.unit_price).toFixed(2)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No line items</Text>
          )}
        </View>
      </View>

      {/* Totals */}
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Subtotal</Text>
          <Text style={styles.rowVal}>${subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Tax</Text>
          <Text style={styles.rowVal}>${tax.toFixed(2)}</Text>
        </View>
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalVal}>${total.toFixed(2)}</Text>
        </View>
      </View>

      {/* Notes */}
      {inv.notes && (
        <View>
          <Text style={styles.sectionLabel}>NOTES</Text>
          <View style={styles.card}>
            <Text style={styles.notes}>{inv.notes}</Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { borderRadius: 14, borderWidth: 1.5, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invNum: { fontSize: 13, color: C.muted, fontWeight: '600', marginBottom: 4 },
  customer: { fontSize: 20, fontWeight: '800', color: C.text },
  statusBadge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sectionLabel: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.muted },
  rowVal: { fontSize: 13, color: C.text, fontWeight: '500' },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  lineItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  lineItemInfo: { flex: 1, gap: 3 },
  lineItemName: { fontSize: 14, fontWeight: '600', color: C.text },
  lineItemQty: { fontSize: 12, color: C.muted },
  lineItemTotal: { fontSize: 15, fontWeight: '700', color: C.text },
  totalRow: { borderTopWidth: 1, borderTopColor: C.border2 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: 1 },
  totalVal: { fontSize: 20, fontWeight: '800', color: C.green },
  notes: { fontSize: 13, color: C.text, lineHeight: 20, padding: 14 },
  emptyText: { fontSize: 13, color: C.dim, fontStyle: 'italic', padding: 14 },
});
