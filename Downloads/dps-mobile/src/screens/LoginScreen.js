import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Vibration, ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { C } from '../theme';
import { getTechs, loginWithPin } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [techs, setTechs] = useState([]);
  const [selectedTech, setSelectedTech] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTechs, setLoadingTechs] = useState(true);
  const [shake, setShake] = useState(false);
  const PIN_LENGTH = 4;

  useEffect(() => {
    loadTechs();
  }, []);

  const loadTechs = async () => {
    try {
      // Use admin credentials stored from previous login, or use a public endpoint
      // For now, we use a static tech list endpoint (no auth required for PIN login flow)
      const res = await fetch('http://192.168.86.33:4000/api/auth/techs-for-pin');
      const data = await res.json();
      setTechs(data || []);
    } catch (e) {
      // Fallback - show manual login
      console.error(e);
    } finally {
      setLoadingTechs(false);
    }
  };

  const pressDigit = async (d) => {
    if (pin.length >= PIN_LENGTH) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPin = pin + d;
    setPin(newPin);
    if (newPin.length === PIN_LENGTH) {
      submitPin(newPin);
    }
  };

  const pressBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin(p => p.slice(0, -1));
  };

  const submitPin = async (p) => {
    if (!selectedTech) {
      Alert.alert('Select Technician', 'Please select your name first.');
      setPin('');
      return;
    }
    setLoading(true);
    try {
      const data = await loginWithPin(selectedTech.id, p);
      await login(data.token, data.user);
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate([0, 80, 80, 80]);
      setPin('');
      Alert.alert('Incorrect PIN', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const DIGITS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['','0','⌫'],
  ];

  if (loadingTechs) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.green} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logo}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoWave}>〜</Text>
        </View>
        <Text style={styles.logoText}>DPS</Text>
        <Text style={styles.logoSub}>DIGITAL PLUMBING SOFTWARE</Text>
      </View>

      {/* Tech selector */}
      <Text style={styles.label}>SELECT YOUR NAME</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.techRow} contentContainerStyle={{gap:10,paddingHorizontal:24}}>
        {techs.map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => { setSelectedTech(t); setPin(''); }}
            style={[styles.techChip, selectedTech?.id===t.id && {borderColor: t.color||C.green, backgroundColor: (t.color||C.green)+'22'}]}
          >
            <View style={[styles.techAvatar, {backgroundColor:(t.color||C.green)+'33', borderColor: t.color||C.green}]}>
              <Text style={[styles.techInitials, {color: t.color||C.green}]}>{t.initials}</Text>
            </View>
            <Text style={[styles.techName, selectedTech?.id===t.id && {color: t.color||C.green}]}>{t.first_name}</Text>
          </TouchableOpacity>
        ))}
        {techs.length === 0 && (
          <Text style={{color: C.muted, fontSize:14, paddingVertical:16}}>No technicians found — check backend connection</Text>
        )}
      </ScrollView>

      {/* PIN dots */}
      <View style={styles.pinRow}>
        {Array.from({length: PIN_LENGTH}).map((_,i) => (
          <View key={i} style={[styles.pinDot, pin.length > i && styles.pinDotFilled]}/>
        ))}
      </View>

      {selectedTech && (
        <Text style={styles.pinHint}>Enter PIN for {selectedTech.first_name}</Text>
      )}

      {/* Numpad */}
      <View style={styles.numpad}>
        {DIGITS.map((row, ri) => (
          <View key={ri} style={styles.numpadRow}>
            {row.map((d, di) => (
              <TouchableOpacity
                key={di}
                style={[styles.numKey, d==='' && {opacity:0}]}
                onPress={() => d==='⌫' ? pressBack() : d!=='' ? pressDigit(d) : null}
                disabled={d==='' || loading}
                activeOpacity={0.6}
              >
                {loading && d==='0' ? (
                  <ActivityIndicator color={C.text} size="small"/>
                ) : (
                  <Text style={[styles.numKeyText, d==='⌫' && {fontSize:22}]}>{d}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg, paddingTop:60 },
  center: { flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center' },
  logo: { alignItems:'center', marginBottom:32 },
  logoCircle: { width:60,height:60,borderRadius:30,borderWidth:2,borderColor:C.green,justifyContent:'center',alignItems:'center',marginBottom:10 },
  logoWave: { fontSize:24,color:C.green },
  logoText: { fontSize:28,fontWeight:'800',color:C.text,letterSpacing:4 },
  logoSub: { fontSize:10,color:C.muted,letterSpacing:3,marginTop:2 },
  label: { fontSize:10,color:C.muted,letterSpacing:2,textAlign:'center',marginBottom:12 },
  techRow: { maxHeight:90,flexShrink:0,marginBottom:8 },
  techChip: { alignItems:'center',padding:10,borderRadius:12,borderWidth:1.5,borderColor:C.border,backgroundColor:C.surface,minWidth:72 },
  techAvatar: { width:36,height:36,borderRadius:18,borderWidth:1.5,justifyContent:'center',alignItems:'center',marginBottom:4 },
  techInitials: { fontSize:12,fontWeight:'700' },
  techName: { fontSize:11,color:C.muted,fontWeight:'500' },
  pinRow: { flexDirection:'row',gap:16,justifyContent:'center',marginTop:28,marginBottom:8 },
  pinDot: { width:14,height:14,borderRadius:7,borderWidth:2,borderColor:C.border2,backgroundColor:'transparent' },
  pinDotFilled: { backgroundColor:C.green,borderColor:C.green },
  pinHint: { textAlign:'center',fontSize:12,color:C.muted,marginBottom:24 },
  numpad: { paddingHorizontal:40,gap:12,marginTop:8 },
  numpadRow: { flexDirection:'row',gap:12,justifyContent:'center' },
  numKey: { width:80,height:80,borderRadius:40,backgroundColor:C.surface,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:C.border },
  numKeyText: { fontSize:28,color:C.text,fontWeight:'300' },
});
