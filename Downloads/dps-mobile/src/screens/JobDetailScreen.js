import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Linking, Image,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import dayjs from 'dayjs';
import { C, STATUS } from '../theme';
import { getJob, updateJobStatus, addJobNote, pingGps, getMyJobs, getJobPhotos, uploadJobPhoto, BASE_URL } from '../services/api';
import { queueStatusUpdate, queueNoteAppend, queuePhotoUpload } from '../services/offlineQueue';
import { useAuth } from '../hooks/useAuth';

export default function JobDetailScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]); // { uri, remote: bool }[]
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Track connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    try {
      const [j, serverPhotos] = await Promise.all([
        getJob(jobId),
        getJobPhotos(jobId).catch(() => []),
      ]);
      setJob(j);
      navigation.setOptions({ title: j.customer_name });
      setPhotos(serverPhotos.map((p) => ({
        uri: `${BASE_URL}/uploads/photos/${p.file_path}`,
        remote: true,
        id: p.id,
      })));
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Auto duty management
  const handleAutoDuty = async (newStatus) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;

      if (newStatus === 'en_route') {
        // Check if this is first job of the day - go on duty
        const today = dayjs().format('YYYY-MM-DD');
        const allJobs = await getMyJobs(today);
        const myJobs = (allJobs || []).filter(j => j.technician_id === user?.id);
        const activeJobs = myJobs.filter(j => ['en_route','on_site'].includes(j.status));
        if (activeJobs.length === 0) {
          // First job going active - go on duty
          await pingGps(latitude, longitude, true);
        }
      } else if (newStatus === 'completed') {
        // Check if this is the last active job - go off duty
        const today = dayjs().format('YYYY-MM-DD');
        const allJobs = await getMyJobs(today);
        const myJobs = (allJobs || []).filter(j => j.technician_id === user?.id);
        const remainingActive = myJobs.filter(j =>
          j.id !== jobId && ['en_route','on_site','scheduled'].includes(j.status)
        );
        if (remainingActive.length === 0) {
          // Last job done - go off duty
          await pingGps(latitude, longitude, false);
          Alert.alert('All Done!', 'Great work today. You have been marked off duty.');
        } else {
          await pingGps(latitude, longitude, true);
        }
      }
    } catch(e) {
      console.error('Auto duty error:', e);
    }
  };

  const changeStatus = async (newStatus) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      if (isOnline) {
        await updateJobStatus(jobId, newStatus);
        await handleAutoDuty(newStatus);
      } else {
        await queueStatusUpdate(jobId, newStatus);
        Alert.alert('Saved Offline', 'Status queued — will sync when you reconnect.');
      }
      setJob(j => ({...j, status: newStatus}));
    } catch(e) {
      Alert.alert('Error', 'Could not update status');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const existing = job.notes ? job.notes + '\n' : '';
      const timestamped = `[${dayjs().format('h:mm A')}] ${note.trim()}`;
      const updated = existing + timestamped;
      if (isOnline) {
        await addJobNote(jobId, updated);
      } else {
        await queueNoteAppend(jobId, updated);
        Alert.alert('Saved Offline', 'Note queued — will sync when you reconnect.');
      }
      setJob(j => ({...j, notes: updated}));
      setNote('');
      setShowNoteInput(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch(e) {
      Alert.alert('Error', 'Could not save note');
    } finally {
      setSaving(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Please allow camera access in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;

    const asset = result.assets[0];
    const localEntry = { uri: asset.uri, remote: false };
    setPhotos(p => [...p, localEntry]);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (isOnline) {
      setUploadingPhoto(true);
      try {
        const saved = await uploadJobPhoto(jobId, asset.uri, asset.mimeType || 'image/jpeg');
        // Replace local preview with server URL
        setPhotos(p => p.map(ph =>
          ph.uri === asset.uri
            ? { uri: `${BASE_URL}/uploads/photos/${saved.file_path}`, remote: true, id: saved.id }
            : ph
        ));
      } catch (uploadErr) {
        // Upload failed — queue it for later
        await queuePhotoUpload(jobId, asset.uri, asset.mimeType || 'image/jpeg');
        Alert.alert('Upload Failed', 'Photo saved locally and will upload when you reconnect.');
      } finally {
        setUploadingPhoto(false);
      }
    } else {
      await queuePhotoUpload(jobId, asset.uri, asset.mimeType || 'image/jpeg');
    }
  };

  const callCustomer = () => {
    if (job?.customer_phone) Linking.openURL(`tel:${job.customer_phone}`);
  };

  const openMaps = () => {
    if (job?.address) {
      const addr = encodeURIComponent(job.address);
      // Try Apple Maps first, falls back to Google Maps
      Linking.openURL(`maps://maps.apple.com/?daddr=${addr}&dirflg=d`).catch(() =>
        Linking.openURL(`https://maps.google.com/?daddr=${addr}`)
      );
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={C.green} size="large"/></View>;
  if (!job) return <View style={styles.center}><Text style={{color:C.muted}}>Job not found</Text></View>;

  const s = STATUS[job.status] || STATUS.scheduled;
  const start = job.scheduled_start ? dayjs(job.scheduled_start).format('ddd, MMM D · h:mm A') : null;
  const end   = job.scheduled_end   ? dayjs(job.scheduled_end).format('h:mm A') : null;

  const STATUS_FLOW = [
    { key:'scheduled', icon:'📅', label:'Scheduled' },
    { key:'en_route',  icon:'🚚', label:'En Route'  },
    { key:'on_site',   icon:'🔧', label:'On Site'   },
    { key:'completed', icon:'✅', label:'Done'      },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{padding:16,gap:16}}>

      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Offline — changes will sync when you reconnect</Text>
        </View>
      )}

      {/* Status header with customer name + GPS indicator */}
      <View style={[styles.statusCard, {borderColor:s.color+'44', backgroundColor:s.color+'0d'}]}>
        <View style={styles.statusCardTop}>
          <View style={{flex:1}}>
            <Text style={styles.customerName}>{job.customer_name}</Text>
            <Text style={styles.jobTypeText}>{job.job_type || 'Service Call'} · #{job.job_number}</Text>
          </View>
          <View style={[styles.gpsPill, {backgroundColor:(job.status==='en_route'||job.status==='on_site')?C.green+'22':C.surface2, borderColor:(job.status==='en_route'||job.status==='on_site')?C.green:C.border}]}>
            <View style={[styles.gpsDot, {backgroundColor:(job.status==='en_route'||job.status==='on_site')?C.green:C.dim}]}/>
            <Text style={[styles.gpsLabel, {color:(job.status==='en_route'||job.status==='on_site')?C.green:C.muted}]}>
              {job.status==='en_route'?'ON DUTY':job.status==='on_site'?'ON SITE':job.status==='completed'?'DONE':'OFFLINE'}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, {backgroundColor:s.color+'22', borderColor:s.color+'44'}]}>
          <Text style={[styles.statusBig, {color:s.color}]}>{s.label}</Text>
        </View>
      </View>

      {/* Status flow */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>UPDATE STATUS</Text>
        <View style={styles.statusFlow}>
          {STATUS_FLOW.map(sf => {
            const active = job.status === sf.key;
            const sc = STATUS[sf.key].color;
            return (
              <TouchableOpacity key={sf.key} onPress={() => changeStatus(sf.key)} disabled={saving}
                style={[styles.statusBtn, active && {backgroundColor:sc+'22', borderColor:sc}]}>
                <Text style={styles.statusBtnIcon}>{sf.icon}</Text>
                <Text style={[styles.statusBtnLabel, active && {color:sc, fontWeight:'700'}]}>{sf.label}</Text>
                {active && <View style={[styles.activeIndicator, {backgroundColor:sc}]}/>}
              </TouchableOpacity>
            );
          })}
        </View>
        {(job.status === 'en_route' || job.status === 'completed') && (
          <Text style={styles.autoDutyNote}>
            {job.status === 'en_route' ? '📍 Auto went on duty' : '📍 Auto duty check run'}
          </Text>
        )}
      </View>

      {/* Customer */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CUSTOMER</Text>
        <View style={styles.infoCard}>
          <Text style={styles.customerBig}>{job.customer_name}</Text>
          {job.customer_phone && (
            <TouchableOpacity style={styles.actionRow} onPress={callCustomer}>
              <Text style={styles.actionIcon}>📞</Text>
              <Text style={styles.actionText}>{job.customer_phone}</Text>
              <Text style={styles.actionBtn}>Call</Text>
            </TouchableOpacity>
          )}
          {job.address && (
            <TouchableOpacity style={styles.actionRow} onPress={openMaps}>
              <Text style={styles.actionIcon}>📍</Text>
              <Text style={[styles.actionText, styles.addressLink]} numberOfLines={2}>{job.address}</Text>
              <Text style={styles.actionBtn}>Maps</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Schedule */}
      {start && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SCHEDULED</Text>
          <View style={styles.infoCard}>
            <Text style={styles.scheduleText}>{start}{end ? ` – ${end}` : ''}</Text>
          </View>
        </View>
      )}

      {/* Notes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>NOTES</Text>
          <TouchableOpacity onPress={() => setShowNoteInput(v => !v)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add Note</Text>
          </TouchableOpacity>
        </View>
        {showNoteInput && (
          <View style={styles.noteInput}>
            <TextInput value={note} onChangeText={setNote} placeholder="Type note here..." placeholderTextColor={C.muted} style={styles.noteField} multiline autoFocus/>
            <View style={styles.noteActions}>
              <TouchableOpacity onPress={() => setShowNoteInput(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveNote} style={styles.saveBtn} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Note'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {job.notes ? (
          <View style={styles.notesDisplay}>
            {job.notes.split('\n').filter(Boolean).map((line, i) => (
              <Text key={i} style={styles.noteLine}>{line}</Text>
            ))}
          </View>
        ) : (!showNoteInput && <Text style={styles.emptyNotes}>No notes yet</Text>)}
      </View>

      {/* Photos */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>PHOTOS</Text>
          <TouchableOpacity onPress={takePhoto} style={styles.addBtn}>
            <Text style={styles.addBtnText}>📷 Take Photo</Text>
          </TouchableOpacity>
        </View>
        {uploadingPhoto && <ActivityIndicator color={C.green} style={{alignSelf:'flex-start',marginTop:8}}/>}
        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:10}}>
            <View style={{flexDirection:'row',gap:10}}>
              {photos.map((ph, i) => (
                <View key={i}>
                  <Image source={{uri: ph.uri}} style={styles.photo}/>
                  {!ph.remote && <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        {photos.length === 0 && !uploadingPhoto && <Text style={styles.emptyNotes}>No photos yet</Text>}
      </View>



      <View style={{height:40}}/>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:C.bg},
  center:{flex:1,backgroundColor:C.bg,justifyContent:'center',alignItems:'center'},
  statusCard:{borderRadius:14,borderWidth:1.5,padding:14,gap:10},
  statusCardTop:{flexDirection:'row',alignItems:'flex-start',gap:10},
  customerName:{fontSize:20,fontWeight:'800',color:C.text},
  statusBadge:{borderRadius:8,borderWidth:1,paddingHorizontal:12,paddingVertical:5,alignSelf:'flex-start'},
  statusBig:{fontSize:13,fontWeight:'800',letterSpacing:1},
  jobTypeText:{fontSize:13,color:C.muted,marginTop:2},
  gpsPill:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderRadius:20,paddingHorizontal:10,paddingVertical:5,flexShrink:0},
  gpsDot:{width:7,height:7,borderRadius:4},
  gpsLabel:{fontSize:10,fontWeight:'700',letterSpacing:0.5},
  section:{gap:8},
  sectionLabel:{fontSize:10,color:C.muted,letterSpacing:2,fontWeight:'600'},
  sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  addBtn:{backgroundColor:C.surface2,borderRadius:8,paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderColor:C.border},
  addBtnText:{fontSize:12,color:C.green,fontWeight:'600'},
  statusFlow:{flexDirection:'row',gap:8},
  statusBtn:{flex:1,alignItems:'center',padding:12,borderRadius:12,backgroundColor:C.surface,borderWidth:1.5,borderColor:C.border,gap:6,position:'relative'},
  statusBtnIcon:{fontSize:20},
  statusBtnLabel:{fontSize:10,color:C.muted,fontWeight:'500',textAlign:'center'},
  activeIndicator:{position:'absolute',bottom:0,left:'25%',right:'25%',height:3,borderRadius:2},
  autoDutyNote:{fontSize:11,color:C.muted,fontStyle:'italic',textAlign:'center'},
  infoCard:{backgroundColor:C.surface,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border,gap:12},
  customerBig:{fontSize:18,fontWeight:'700',color:C.text},
  actionRow:{flexDirection:'row',alignItems:'center',gap:10},
  actionIcon:{fontSize:16,width:24},
  actionText:{flex:1,fontSize:13,color:C.text},
  addressLink:{color:C.blue,textDecorationLine:'underline'},
  actionBtn:{fontSize:12,color:C.green,fontWeight:'700',backgroundColor:C.green+'22',paddingHorizontal:12,paddingVertical:4,borderRadius:6},
  scheduleText:{fontSize:15,color:C.text,fontWeight:'500'},
  noteInput:{backgroundColor:C.surface,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border2,gap:10},
  noteField:{color:C.text,fontSize:14,minHeight:80,textAlignVertical:'top'},
  noteActions:{flexDirection:'row',gap:10,justifyContent:'flex-end'},
  cancelBtn:{paddingHorizontal:16,paddingVertical:8,borderRadius:8,backgroundColor:C.surface2},
  cancelBtnText:{color:C.muted,fontSize:13},
  saveBtn:{paddingHorizontal:16,paddingVertical:8,borderRadius:8,backgroundColor:C.green+'22',borderWidth:1,borderColor:C.green},
  saveBtnText:{color:C.green,fontSize:13,fontWeight:'700'},
  notesDisplay:{backgroundColor:C.surface,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border,gap:6},
  noteLine:{fontSize:13,color:C.text,lineHeight:20},
  emptyNotes:{fontSize:13,color:C.dim,fontStyle:'italic'},
  photo:{width:120,height:120,borderRadius:10},
  pendingBadge:{position:'absolute',bottom:4,left:4,backgroundColor:'rgba(0,0,0,0.6)',borderRadius:4,paddingHorizontal:5,paddingVertical:2},
  pendingBadgeText:{color:'#fff',fontSize:9,fontWeight:'700'},
  offlineBanner:{backgroundColor:'#ff9500'+'22',borderWidth:1,borderColor:'#ff9500',borderRadius:10,padding:10},
  offlineBannerText:{color:'#ff9500',fontSize:12,fontWeight:'600',textAlign:'center'},
  payBtn:{backgroundColor:C.green+'22',borderWidth:1.5,borderColor:C.green,borderRadius:14,padding:18,alignItems:'center'},
  payBtnText:{fontSize:16,color:C.green,fontWeight:'700'},
});
