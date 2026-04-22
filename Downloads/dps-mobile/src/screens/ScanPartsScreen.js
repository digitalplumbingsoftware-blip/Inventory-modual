import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';
import { C } from '../theme';
import { getItemByBarcode, getInventoryLocations, postInventoryMove } from '../services/api';
import { queueInventoryMove } from '../services/offlineQueue';
import { useAuth } from '../hooks/useAuth';

export default function ScanPartsScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { user } = useAuth();

  const [permission, requestPermission] = useCameraPermissions();
  const [truckLocation, setTruckLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [confirmedParts, setConfirmedParts] = useState([]);

  // Pending scan card state
  const [pendingItem, setPendingItem] = useState(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [confirming, setConfirming] = useState(false);

  // Debounce guard — prevents processing the same scan multiple times
  const isProcessing = useRef(false);

  // Green flash animation
  const flashOpacity = useRef(new Animated.Value(0)).current;

  // Connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    return unsub;
  }, []);

  // Resolve truck location on mount
  useEffect(() => {
    (async () => {
      try {
        const locations = await getInventoryLocations();
        const truck = locations.find(
          (l) => l.technician_id === user?.id && l.type === 'truck'
        );
        if (!truck) {
          setLocationError('No truck assigned — contact your manager.');
        } else {
          setTruckLocation(truck);
        }
      } catch {
        setLocationError('Could not load truck info — check your connection.');
      }
    })();
  }, [user?.id]);

  const flashGreen = useCallback(() => {
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [flashOpacity]);

  const onBarcodeScanned = useCallback(async ({ data: barcodeValue }) => {
    if (isProcessing.current || pendingItem) return;
    isProcessing.current = true;

    try {
      const items = await getItemByBarcode(barcodeValue);
      if (!items || items.length === 0) {
        setPendingItem({ notFound: true, barcode: barcodeValue });
      } else {
        const item = items[0];
        const truckStock = item.stock?.find((s) => s.location_id === truckLocation?.id);
        setPendingItem({ ...item, truckQty: truckStock?.qty ?? 0 });
        setPendingQty(1);
      }
    } catch {
      Alert.alert('Error', 'Could not look up barcode — check your connection.');
    } finally {
      isProcessing.current = false;
    }
  }, [pendingItem, truckLocation?.id]);

  const confirmScan = async () => {
    if (!pendingItem || pendingItem.notFound) {
      setPendingItem(null);
      isProcessing.current = false;
      return;
    }

    setConfirming(true);
    try {
      const moveData = {
        item_id: pendingItem.id,
        from_location: truckLocation.id,
        to_location: null,
        qty: pendingQty,
        type: 'use',
        job_id: jobId,
      };

      if (isOnline) {
        await postInventoryMove(moveData);
        flashGreen();
      } else {
        await queueInventoryMove(pendingItem.id, truckLocation.id, pendingQty, 'use', jobId);
      }

      setConfirmedParts((prev) => {
        const existing = prev.find((p) => p.id === pendingItem.id);
        if (existing) {
          return prev.map((p) =>
            p.id === pendingItem.id ? { ...p, qty: p.qty + pendingQty } : p
          );
        }
        return [...prev, { ...pendingItem, qty: pendingQty, queued: !isOnline }];
      });
    } catch {
      Alert.alert('Error', 'Could not log part — check your connection.');
    } finally {
      setConfirming(false);
      setPendingItem(null);
      isProcessing.current = false;
    }
  };

  const decrementPart = async (part) => {
    try {
      const reverseData = {
        item_id: part.id,
        from_location: null,
        to_location: truckLocation.id,
        qty: 1,
        type: 'return',
        job_id: jobId,
      };

      if (isOnline) {
        await postInventoryMove(reverseData);
      } else {
        await queueInventoryMove(part.id, null, 1, 'return', jobId);
      }

      setConfirmedParts((prev) =>
        prev
          .map((p) => p.id === part.id ? { ...p, qty: p.qty - 1 } : p)
          .filter((p) => p.qty > 0)
      );
    } catch {
      Alert.alert('Error', 'Could not remove part.');
    }
  };

  if (!permission) return <View style={s.center}><ActivityIndicator color={C.green} /></View>;

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Camera permission required</Text>
        <TouchableOpacity style={s.btn} onPress={requestPermission}>
          <Text style={s.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (locationError) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{locationError}</Text>
      </View>
    );
  }

  if (!truckLocation) {
    return <View style={s.center}><ActivityIndicator color={C.green} size="large" /></View>;
  }

  return (
    <View style={s.container}>
      {/* Green flash overlay */}
      <Animated.View style={[s.flashOverlay, { opacity: flashOpacity }]} pointerEvents="none" />

      {/* Offline banner */}
      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineBannerText}>Offline — parts will sync when reconnected</Text>
        </View>
      )}

      {/* Camera or scan card */}
      {!pendingItem ? (
        <CameraView
          style={s.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
          onBarcodeScanned={onBarcodeScanned}
        >
          <View style={s.scanOverlay}>
            <View style={s.scanFrame} />
            <Text style={s.scanHint}>Point at barcode in material book</Text>
          </View>
        </CameraView>
      ) : pendingItem.notFound ? (
        <View style={s.cardWrap}>
          <View style={[s.card, { borderColor: C.red + '44' }]}>
            <Text style={s.cardTitle}>Part not recognized</Text>
            <Text style={s.cardSub}>Barcode: {pendingItem.barcode}</Text>
            <Text style={s.cardHint}>Add this item in Settings &gt; Inventory</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: C.surface2 }]} onPress={() => {
              setPendingItem(null);
              isProcessing.current = false;
            }}>
              <Text style={[s.btnText, { color: C.muted }]}>Scan Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={s.cardWrap}>
          <View style={s.card}>
            <Text style={s.cardTitle}>{pendingItem.name}</Text>
            <Text style={s.cardSku}>SKU: {pendingItem.sku}</Text>
            <View style={s.cardRow}>
              <View style={s.cardStat}>
                <Text style={s.cardStatLabel}>UNIT COST</Text>
                <Text style={s.cardStatValue}>
                  {pendingItem.cost != null
                    ? `$${parseFloat(pendingItem.cost).toFixed(2)}`
                    : '$0.00 — update cost in Settings'}
                </Text>
              </View>
              <View style={s.cardStat}>
                <Text style={s.cardStatLabel}>TRUCK STOCK</Text>
                <Text style={[s.cardStatValue, pendingItem.truckQty === 0 && { color: C.red }]}>
                  {pendingItem.truckQty}
                </Text>
              </View>
            </View>
            <View style={s.qtyRow}>
              <TouchableOpacity style={s.qtyBtn} onPress={() => setPendingQty(q => Math.max(1, q - 1))}>
                <Text style={s.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.qtyValue}>{pendingQty}</Text>
              <TouchableOpacity style={s.qtyBtn} onPress={() => setPendingQty(q => q + 1)}>
                <Text style={s.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={s.cardActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => {
                setPendingItem(null);
                isProcessing.current = false;
              }}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={confirmScan} disabled={confirming}>
                <Text style={s.confirmBtnText}>{confirming ? 'Logging...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Parts used list */}
      {confirmedParts.length > 0 && (
        <View style={s.partsList}>
          <Text style={s.partsListTitle}>PARTS USED ({confirmedParts.length})</Text>
          <ScrollView>
            {confirmedParts.map((part) => (
              <View key={part.id} style={s.partRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.partName}>{part.name}</Text>
                  {part.queued && <Text style={s.queuedTag}>Syncing...</Text>}
                </View>
                <Text style={s.partQty}>×{part.qty}</Text>
                <TouchableOpacity style={s.decrementBtn} onPress={() => decrementPart(part)}>
                  <Text style={s.decrementBtnText}>−</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  camera: { flex: 1 },
  scanOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  scanFrame: { width: 220, height: 140, borderWidth: 2, borderColor: C.green, borderRadius: 12 },
  scanHint: { color: '#fff', fontSize: 13, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  flashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.green + '55', zIndex: 10 },
  offlineBanner: { backgroundColor: '#ff9500' + '22', borderBottomWidth: 1, borderBottomColor: '#ff9500', padding: 8 },
  offlineBannerText: { color: '#ff9500', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  cardWrap: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border2, padding: 20, gap: 14 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  cardSku: { fontSize: 12, color: C.muted },
  cardHint: { fontSize: 13, color: C.muted, fontStyle: 'italic' },
  cardRow: { flexDirection: 'row', gap: 16 },
  cardStat: { flex: 1, gap: 4 },
  cardStatLabel: { fontSize: 9, color: C.muted, letterSpacing: 2, fontWeight: '700' },
  cardStatValue: { fontSize: 18, fontWeight: '700', color: C.text },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border2, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontSize: 22, color: C.text, fontWeight: '600' },
  qtyValue: { fontSize: 28, fontWeight: '800', color: C.text, minWidth: 40, textAlign: 'center' },
  cardActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center' },
  cancelBtnText: { color: C.muted, fontWeight: '600' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 10, backgroundColor: C.green + '22', borderWidth: 1.5, borderColor: C.green, alignItems: 'center' },
  confirmBtnText: { color: C.green, fontWeight: '800', fontSize: 16 },
  errorText: { color: C.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green },
  btnText: { color: C.green, fontWeight: '700', fontSize: 14 },
  partsList: { maxHeight: 200, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, padding: 12, gap: 8 },
  partsListTitle: { fontSize: 9, color: C.muted, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  partName: { fontSize: 13, color: C.text, fontWeight: '600' },
  queuedTag: { fontSize: 10, color: '#ff9500', fontWeight: '600' },
  partQty: { fontSize: 14, color: C.muted, fontWeight: '700', minWidth: 30, textAlign: 'right' },
  decrementBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border2, justifyContent: 'center', alignItems: 'center' },
  decrementBtnText: { color: C.text, fontSize: 16, fontWeight: '700' },
});
