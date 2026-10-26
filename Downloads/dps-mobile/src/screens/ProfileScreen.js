import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { useAuth } from '../hooks/useAuth';
import { clockIn, clockOut, getPunchStatus } from '../services/api';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [clockedIn,  setClockedIn]  = useState(false);
  const [clockBusy,  setClockBusy]  = useState(false);
  const [clockLoading, setClockLoading] = useState(true);

  useEffect(() => {
    getPunchStatus()
      .then(d => setClockedIn(!!d.clocked_in))
      .catch(() => {})
      .finally(() => setClockLoading(false));
  }, []);

  const handleClockToggle = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setClockBusy(true);
    try {
      if (clockedIn) {
        await clockOut();
        setClockedIn(false);
      } else {
        await clockIn();
        setClockedIn(true);
      }
    } catch(e) {
      Alert.alert('Error', e?.response?.data?.error || e.message || 'Could not update timesheet');
    } finally {
      setClockBusy(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: (user?.color||C.green)+'33', borderColor: user?.color||C.green }]}>
          <Text style={[styles.avatarText, { color: user?.color||C.green }]}>{user?.initials || '??'}</Text>
        </View>
        <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
        <Text style={styles.role}>{user?.role?.toUpperCase()}</Text>
      </View>

      {/* Info */}
      <View style={styles.card}>
        {[
          ['Email', user?.email || '—'],
          ['Phone', user?.phone || '—'],
          ['Role',  user?.role  || '—'],
        ].map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowLabel}>{k}</Text>
            <Text style={styles.rowVal}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Clock In / Out */}
      <TouchableOpacity
        style={[styles.clockBtn, clockedIn ? styles.clockBtnOut : styles.clockBtnIn]}
        onPress={handleClockToggle}
        disabled={clockBusy || clockLoading}>
        {clockBusy || clockLoading ? (
          <ActivityIndicator color={clockedIn ? C.red : C.green} />
        ) : (
          <>
            <Text style={[styles.clockDot, { color: clockedIn ? C.red : C.green }]}>⬤</Text>
            <Text style={[styles.clockText, { color: clockedIn ? C.red : C.green }]}>
              {clockedIn ? 'Clock Out' : 'Clock In'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>DPS Mobile v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:C.bg, padding:24, gap:16 },
  avatarSection:{ alignItems:'center', gap:8, paddingVertical:16 },
  avatar:       { width:80, height:80, borderRadius:40, borderWidth:2, justifyContent:'center', alignItems:'center' },
  avatarText:   { fontSize:28, fontWeight:'800' },
  name:         { fontSize:22, fontWeight:'700', color:C.text },
  role:         { fontSize:11, color:C.muted, letterSpacing:2 },
  card:         { backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border },
  row:          { flexDirection:'row', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderBottomColor:C.border },
  rowLabel:     { fontSize:13, color:C.muted },
  rowVal:       { fontSize:13, color:C.text, fontWeight:'500' },
  clockBtn:     { borderRadius:14, padding:18, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:10, borderWidth:1.5 },
  clockBtnIn:   { backgroundColor:'#27674918', borderColor:'#27674955' },
  clockBtnOut:  { backgroundColor:'#f5656518', borderColor:'#f5656555' },
  clockDot:     { fontSize:10 },
  clockText:    { fontSize:17, fontWeight:'800' },
  logoutBtn:    { backgroundColor:'#f5656508', borderWidth:1.5, borderColor:C.red, borderRadius:14, padding:16, alignItems:'center' },
  logoutText:   { fontSize:16, color:C.red, fontWeight:'700' },
  version:      { textAlign:'center', fontSize:11, color:C.dim },
});
