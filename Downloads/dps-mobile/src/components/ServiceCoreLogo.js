import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Rect, Circle, Path } from 'react-native-svg';

// ServiceCore Pro brand colors
export const BRAND = { blue:'#5b9cf0', orange:'#e07a3f', green:'#4fae7e' };

export function ServiceCoreMark({ size = 56 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Polygon points="30,8 52.5,21 52.5,47 30,60 7.5,47 7.5,21" fill="#1a2744" stroke="#2a3f66" strokeWidth={1.5} />
      <Polygon points="30,13.5 47.7,23.7 47.7,44.3 30,54.5 12.3,44.3 12.3,23.7" stroke="#3b5a8c" strokeWidth={1} strokeOpacity={0.7} />
      <Polygon points="17,32 30,21 43,32" fill={BRAND.blue} />
      <Rect x={20} y={32} width={20} height={12} fill="#24365a" />
      <Rect x={22.5} y={34.5} width={4.5} height={3} fill={BRAND.blue} />
      <Rect x={33} y={34.5} width={4.5} height={3} fill={BRAND.blue} />
      <Rect x={28} y={37} width={4} height={7} fill="#101a30" />
      <Rect x={16} y={45} width={28} height={3} rx={1.5} fill={BRAND.green} />
      <Rect x={19} y={49.5} width={22} height={2.5} rx={1.25} fill={BRAND.green} fillOpacity={0.45} />
      <Circle cx={50} cy={14} r={8} stroke={BRAND.orange} strokeWidth={2.6} />
      <Circle cx={50} cy={14} r={3.6} fill={BRAND.orange} />
      <Path d="M50 3v4M50 21v4M39 14h4M57 14h4" stroke={BRAND.orange} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

// Stacked lockup for splash/login screens
export default function ServiceCoreLogo({ size = 64 }) {
  return (
    <View style={styles.wrap}>
      <ServiceCoreMark size={size} />
      <Text style={styles.word}>
        <Text style={{ color:'#fff' }}>Service</Text>
        <Text style={{ color:BRAND.blue }}>Core</Text>
      </Text>
      <View style={styles.row}>
        <View style={styles.pill}><Text style={styles.pillText}>PRO</Text></View>
        <Text style={styles.tag}>• FIELD SERVICE PLATFORM</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { alignItems:'center' },
  word:     { fontSize:30, fontWeight:'800', letterSpacing:-0.5, marginTop:10 },
  row:      { flexDirection:'row', alignItems:'center', marginTop:6 },
  pill:     { backgroundColor:BRAND.orange, borderRadius:999, paddingHorizontal:8, paddingVertical:1, marginRight:6 },
  pillText: { color:'#fff', fontSize:10, fontWeight:'800', letterSpacing:1.5 },
  tag:      { color:BRAND.green, fontSize:10, letterSpacing:2.5 },
});
