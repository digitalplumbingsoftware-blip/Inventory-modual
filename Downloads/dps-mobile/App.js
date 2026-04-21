import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';

import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { startOfflineSync, stopOfflineSync } from './src/services/offlineQueue';
import { C } from './src/theme';

import LoginScreen            from './src/screens/LoginScreen';
import JobsScreen             from './src/screens/JobsScreen';
import JobDetailScreen        from './src/screens/JobDetailScreen';
import PaymentScreen          from './src/screens/PaymentScreen';
import ProfileScreen          from './src/screens/ProfileScreen';
import PricebookScreen        from './src/screens/PricebookScreen';
import InvoicesScreen         from './src/screens/InvoicesScreen';
import InvoiceDetailScreen    from './src/screens/InvoiceDetailScreen';
import ScanPartsScreen        from './src/screens/ScanPartsScreen';
import EstimatesHomeScreen    from './src/screens/EstimatesHomeScreen';
import EstimatesScreen        from './src/screens/EstimatesScreen';
import EstimateDetailScreen   from './src/screens/EstimateDetailScreen';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

const H = {
  headerStyle:      { backgroundColor:'#080b10', borderBottomWidth:1, borderBottomColor:C.border },
  headerTintColor:  C.text,
  headerTitleStyle: { fontWeight:'700', color:C.text, fontSize:16 },
  cardStyle:        { backgroundColor:C.bg },
};

function SettingsBtn({ navigation }) {
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Settings')}
      style={{ marginRight:16, width:34, height:34, borderRadius:17, backgroundColor:C.surface2, borderWidth:1, borderColor:C.border, justifyContent:'center', alignItems:'center' }}>
      <Text style={{ fontSize:16 }}>⚙️</Text>
    </TouchableOpacity>
  );
}

function JobsStack() {
  return (
    <Stack.Navigator screenOptions={H}>
      <Stack.Screen name="MyJobs" component={JobsScreen}
        options={({ navigation }) => ({ title:'My Jobs', headerRight:()=><SettingsBtn navigation={navigation}/> })}/>
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title:'Job Detail' }}/>
      <Stack.Screen name="ScanParts" component={ScanPartsScreen} options={{ title:'Scan Parts' }}/>
      <Stack.Screen name="Settings"  component={ProfileScreen}   options={{ title:'Settings' }}/>
    </Stack.Navigator>
  );
}

function EstimatesStack() {
  return (
    <Stack.Navigator screenOptions={H}>
      <Stack.Screen name="EstimatesHome" component={EstimatesHomeScreen}
        options={({ navigation }) => ({ title:'Estimates', headerRight:()=><SettingsBtn navigation={navigation}/> })}/>
      <Stack.Screen name="EstimatesList"   component={EstimatesScreen}      options={{ title:'Estimates' }}/>
      <Stack.Screen name="EstimateDetail"  component={EstimateDetailScreen} options={{ title:'Estimate' }}/>
      <Stack.Screen name="PricebookMain"   component={PricebookScreen}      options={{ title:'Pricebook' }}/>
      <Stack.Screen name="Settings"        component={ProfileScreen}        options={{ title:'Settings' }}/>
    </Stack.Navigator>
  );
}

function InvoicesStack() {
  return (
    <Stack.Navigator screenOptions={H}>
      <Stack.Screen name="InvoicesList" component={InvoicesScreen}
        options={({ navigation }) => ({ title:'Invoices', headerRight:()=><SettingsBtn navigation={navigation}/> })}/>
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title:'Invoice' }}/>
      <Stack.Screen name="Settings"      component={ProfileScreen}       options={{ title:'Settings' }}/>
    </Stack.Navigator>
  );
}

function PaymentStack() {
  return (
    <Stack.Navigator screenOptions={H}>
      <Stack.Screen name="PaymentMain" component={PaymentScreen}
        options={({ navigation }) => ({ title:'Collect Payment', headerRight:()=><SettingsBtn navigation={navigation}/> })}/>
      <Stack.Screen name="Settings" component={ProfileScreen} options={{ title:'Settings' }}/>
    </Stack.Navigator>
  );
}

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{ alignItems:'center', gap:2 }}>
      <Text style={{ fontSize:20, opacity:focused?1:0.4 }}>{emoji}</Text>
      <Text style={{ fontSize:9, color:focused?C.amber:C.muted, fontWeight:focused?'700':'400', letterSpacing:0.4 }}>{label}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown:false, tabBarShowLabel:false,
      tabBarStyle:{ backgroundColor:'#080b10', borderTopColor:C.border, height:82, paddingBottom:18 } }}>
      <Tab.Screen name="Jobs"      component={JobsStack}
        options={{ tabBarIcon:({focused})=><TabIcon emoji="📋" label="JOBS"      focused={focused}/> }}/>
      <Tab.Screen name="Estimates" component={EstimatesStack}
        options={{ tabBarIcon:({focused})=><TabIcon emoji="📄" label="ESTIMATES" focused={focused}/> }}/>
      <Tab.Screen name="Invoices"  component={InvoicesStack}
        options={{ tabBarIcon:({focused})=><TabIcon emoji="🧾" label="INVOICES"  focused={focused}/> }}/>
      <Tab.Screen name="Payment"   component={PaymentStack}
        options={{ tabBarIcon:({focused})=><TabIcon emoji="💳" label="PAYMENT"   focused={focused}/> }}/>
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center' }}><ActivityIndicator color={C.green} size="large"/></View>;
  return (
    <NavigationContainer theme={{ dark:true, colors:{ primary:C.amber, background:C.bg, card:'#080b10', text:C.text, border:C.border, notification:C.red } }}>
      {user ? <MainTabs/> : (
        <Stack.Navigator screenOptions={{ headerShown:false }}>
          <Stack.Screen name="Login" component={LoginScreen}/>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    startOfflineSync(({ flushed }) => {
      Alert.alert('Back Online', `Synced ${flushed} offline change${flushed !== 1 ? 's' : ''}.`);
    });
    return () => stopOfflineSync();
  }, []);

  return (
    <SafeAreaProvider><AuthProvider><StatusBar style="light"/><AppNavigator/></AuthProvider></SafeAreaProvider>
  );
}
