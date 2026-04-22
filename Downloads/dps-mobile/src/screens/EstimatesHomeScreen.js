import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator
} from 'react-native';
import api from '../services/api';

export default function EstimatesHomeScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/invoices?type=estimate&limit=5').catch(() => ({ data: { invoices: [] } })),
    ]).then(([estRes]) => {
      setRecent(estRes.data.invoices || estRes.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const statusColor = {
    draft: '#64748b', sent: '#4a9eff', accepted: '#3ecf8e',
    declined: '#f56565', invoiced: '#a78bfa',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Hero action buttons */}
      <View style={styles.heroRow}>
        <TouchableOpacity
          style={[styles.heroBtn, styles.heroBtnPrimary]}
          onPress={() => navigation.navigate('NewEstimate')}
        >
          <Text style={styles.heroBtnIcon}>✏️</Text>
          <Text style={styles.heroBtnLabel}>New Estimate</Text>
          <Text style={styles.heroBtnSub}>Build from scratch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.heroBtn, styles.heroBtnGreen]}
          onPress={() => navigation.navigate('PricebookMain')}
        >
          <Text style={styles.heroBtnIcon}>💰</Text>
          <Text style={styles.heroBtnLabel}>Pricebook</Text>
          <Text style={styles.heroBtnSub}>272 jobs · 5 tiers</Text>
        </TouchableOpacity>
      </View>

      {/* Quick links row */}
      <View style={styles.quickRow}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => navigation.navigate('EstimatesList')}
        >
          <Text style={styles.quickIcon}>📄</Text>
          <Text style={styles.quickLabel}>All Estimates</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => navigation.navigate('EstimatesList', { filter: 'draft' })}
        >
          <Text style={styles.quickIcon}>🕓</Text>
          <Text style={styles.quickLabel}>Drafts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => navigation.navigate('EstimatesList', { filter: 'sent' })}
        >
          <Text style={styles.quickIcon}>📬</Text>
          <Text style={styles.quickLabel}>Sent</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => navigation.navigate('EstimatesList', { filter: 'accepted' })}
        >
          <Text style={styles.quickIcon}>✅</Text>
          <Text style={styles.quickLabel}>Accepted</Text>
        </TouchableOpacity>
      </View>

      {/* Recent estimates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECENT ESTIMATES</Text>
        {loading ? (
          <ActivityIndicator color="#1abc9c" style={{ marginTop: 20 }} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No estimates yet</Text>
            <Text style={styles.emptySub}>Tap "New Estimate" or browse the Pricebook to get started</Text>
          </View>
        ) : (
          recent.map(est => (
            <TouchableOpacity
              key={est.id}
              style={styles.estimateRow}
              onPress={() => navigation.navigate('EstimateDetail', { id: est.id })}
            >
              <View style={styles.estimateLeft}>
                <Text style={styles.estimateCustomer}>{est.customer_name || 'Unknown'}</Text>
                <Text style={styles.estimateDate}>
                  {est.created_at ? new Date(est.created_at).toLocaleDateString() : '—'}
                </Text>
              </View>
              <View style={styles.estimateRight}>
                <Text style={styles.estimateTotal}>
                  ${parseFloat(est.total || 0).toFixed(2)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: (statusColor[est.status] || '#64748b') + '22' }]}>
                  <Text style={[styles.statusText, { color: statusColor[est.status] || '#64748b' }]}>
                    {(est.status || 'draft').toUpperCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  heroRow: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 8 },
  heroBtn: {
    flex: 1, borderRadius: 14, padding: 18, alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  heroBtnPrimary: { backgroundColor: '#1B4F72' },
  heroBtnGreen: { backgroundColor: '#1abc9c' },
  heroBtnIcon: { fontSize: 28, marginBottom: 6 },
  heroBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  heroBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  quickBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#e5e5e5',
  },
  quickIcon: { fontSize: 18, marginBottom: 4 },
  quickLabel: { fontSize: 10, color: '#555', fontWeight: '600', textAlign: 'center' },
  section: { margin: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  estimateLeft: { flex: 1 },
  estimateCustomer: { fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 2 },
  estimateDate: { fontSize: 12, color: '#888' },
  estimateRight: { alignItems: 'flex-end', gap: 4 },
  estimateTotal: { fontSize: 15, fontWeight: '700', color: '#1B4F72' },
  statusBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '700' },
});
