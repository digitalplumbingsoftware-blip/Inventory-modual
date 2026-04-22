import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { pingGps } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function GPSScreen() {
  const { user } = useAuth();
  const [onDuty, setOnDuty] = useState(false);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const startDuty = async () => {
    setLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location Required', 'Please enable location access to go on duty.');
      setLoading(false);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOnDuty(true);
    sendPing(true);
    // Ping every 60 seconds
    intervalRef.current = setInterval(() => sendPing(true), 60000);
    setLoading(false);
  };

  const stopDuty = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setOnDuty(false);
    sendPing(false);
  };

  const sendPing = async (duty) => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, accuracy: acc } = loc.coords;
      setLocation({ lat: latitude, lng: longitude });
      setAccuracy(Math.round(acc));
      await pingGps(latitude, longitude, duty);
      setLastPing(new Date());
    } catch(e) {
      console.error('GPS ping failed:', e);
    }
  };

  const manualPing = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendPing(onDuty);
  };

  const formatTime = (d) => {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };

  return (
    <View style={styles.container}>
      {/* Status indicator */}
      <View style={[styles.statusCard, { borderColor: onDuty ? C.green : C.border }]}>
        <View style={[styles.dot, { backgroundColor: onDuty ? C.green : C.dim }]}/>
        <Text style={[styles.statusText, { color: onDuty ? C.green : C.muted }]}>
          {onDuty ? 'ON DUTY' : 'OFF DUTY'}
        </Text>
        <Text style={styles.nameText}>{user?.first_name} {user?.last_name}</Text>
      </View>

      {/* Big toggle */}
      <TouchableOpacity
        style={[styles.dutyBtn, onDuty ? styles.dutyBtnOn : styles.dutyBtnOff]}
        onPress={onDuty ? stopDuty : startDuty}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={C.text} size="large"/>
        ) : (
          <>
            <Text style={styles.dutyBtnIcon}>{onDuty ? '⏹' : '▶'}</Text>
            <Text style={styles.dutyBtnText}>{onDuty ? 'Go Off Duty' : 'Go On Duty'}</Text>
            <Text style={styles.dutyBtnSub}>{onDuty ? 'Stop GPS tracking' : 'Start GPS tracking'}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* GPS info */}
      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>LATITUDE</Text>
          <Text style={styles.infoVal}>{location?.lat ? location.lat.toFixed(5) : '—'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>LONGITUDE</Text>
          <Text style={styles.infoVal}>{location?.lng ? location.lng.toFixed(5) : '—'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>ACCURACY</Text>
          <Text style={styles.infoVal}>{accuracy ? `±${accuracy}m` : '—'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>LAST PING</Text>
          <Text style={styles.infoVal}>{formatTime(lastPing)}</Text>
        </View>
      </View>

      {onDuty && (
        <TouchableOpacity style={styles.pingBtn} onPress={manualPing}>
          <Text style={styles.pingBtnText}>📡  Send Manual Ping</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footer}>
        {onDuty
          ? 'Your location is being shared with dispatch every 60 seconds'
          : 'Go on duty to start sharing your location with dispatch'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg, padding:24, gap:20 },
  statusCard: { flexDirection:'row', alignItems:'center', gap:10, padding:16, backgroundColor:C.surface, borderRadius:14, borderWidth:1.5 },
  dot: { width:10, height:10, borderRadius:5 },
  statusText: { fontSize:13, fontWeight:'800', letterSpacing:2, flex:1 },
  nameText: { fontSize:13, color:C.muted },
  dutyBtn: { borderRadius:20, padding:32, alignItems:'center', gap:8, borderWidth:2 },
  dutyBtnOn:  { backgroundColor:C.red+'15',   borderColor:C.red   },
  dutyBtnOff: { backgroundColor:C.green+'15', borderColor:C.green },
  dutyBtnIcon: { fontSize:36 },
  dutyBtnText: { fontSize:20, fontWeight:'800', color:C.text },
  dutyBtnSub: { fontSize:13, color:C.muted },
  infoGrid: { flexDirection:'row', flexWrap:'wrap', gap:12 },
  infoItem: { flex:1, minWidth:'40%', backgroundColor:C.surface, borderRadius:12, padding:14, borderWidth:1, borderColor:C.border },
  infoLabel: { fontSize:9, color:C.muted, letterSpacing:2, marginBottom:6 },
  infoVal: { fontSize:14, color:C.text, fontWeight:'600', fontVariant:['tabular-nums'] },
  pingBtn: { backgroundColor:C.blue+'15', borderWidth:1, borderColor:C.blue, borderRadius:12, padding:16, alignItems:'center' },
  pingBtnText: { fontSize:14, color:C.blue, fontWeight:'600' },
  footer: { fontSize:12, color:C.dim, textAlign:'center', lineHeight:18 },
});
