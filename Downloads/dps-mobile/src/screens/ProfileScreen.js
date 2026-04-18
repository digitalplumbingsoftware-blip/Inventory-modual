import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { useAuth } from '../hooks/useAuth';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

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
          ['Email',    user?.email   || '—'],
          ['Phone',    user?.phone   || '—'],
          ['Role',     user?.role    || '—'],
        ].map(([k,v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowLabel}>{k}</Text>
            <Text style={styles.rowVal}>{v}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>DPS Mobile v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:C.bg, padding:24, gap:20 },
  avatarSection: { alignItems:'center', gap:8, paddingVertical:20 },
  avatar: { width:80, height:80, borderRadius:40, borderWidth:2, justifyContent:'center', alignItems:'center' },
  avatarText: { fontSize:28, fontWeight:'800' },
  name: { fontSize:22, fontWeight:'700', color:C.text },
  role: { fontSize:11, color:C.muted, letterSpacing:2 },
  card: { backgroundColor:C.surface, borderRadius:14, borderWidth:1, borderColor:C.border },
  row: { flexDirection:'row', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderBottomColor:C.border },
  rowLabel: { fontSize:13, color:C.muted },
  rowVal: { fontSize:13, color:C.text, fontWeight:'500' },
  logoutBtn: { backgroundColor:'#f5656518', borderWidth:1.5, borderColor:C.red, borderRadius:14, padding:16, alignItems:'center' },
  logoutText: { fontSize:16, color:C.red, fontWeight:'700' },
  version: { textAlign:'center', fontSize:11, color:C.dim },
});
