import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Linking, Image, Dimensions,
  RefreshControl,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import dayjs from 'dayjs';
import { C, STATUS } from '../theme';
import { getJob, updateJob, updateJobStatus, addJobNote, pingGps, getMyJobs, getJobPhotos, uploadJobPhoto, getJobMaterialCost, getMapsKey, BASE_URL } from '../services/api';
import { queueStatusUpdate, queueNoteAppend, queuePhotoUpload } from '../services/offlineQueue';
import { useAuth } from '../hooks/useAuth';

export default function JobDetailScreen({ route, navigation }) {
  const { jobId } = route.params;
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]); // { uri, remote: bool }[]
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [materialCost, setMaterialCost] = useState(null);
  const [mapsKey, setMapsKey] = useState('');
  // Track connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    return unsub;
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(prev => prev);
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
    finally { setLoading(false); setRefreshing(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when screen comes back into focus (e.g. after invoice screen sets return_trip_needed)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { load(); });
    return unsub;
  }, [navigation, load]);

  const loadMaterialCost = useCallback(async () => {
    try {
      const data = await getJobMaterialCost(jobId);
      setMaterialCost(data);
    } catch {
      // non-fatal — parts section just stays empty
    }
  }, [jobId]);

  useEffect(() => { loadMaterialCost(); }, [loadMaterialCost]);

  // Fetch Google Maps key for street view (fire once)
  useEffect(() => {
    getMapsKey().then(setMapsKey).catch(()=>{});
  }, []);

  // Auto duty management + GPS ping on every status change
  const handleAutoDuty = async (newStatus, currentJob) => {
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;

      if (newStatus === 'completed') {
        const returnNeeded = currentJob?.return_trip_needed;
        const projectId    = currentJob?.project_id;

        if (returnNeeded) {
          // — Return trip flagged —
          if (!projectId) {
            // Dispatcher hasn't scheduled the follow-up yet — stay on duty
            await pingGps(latitude, longitude, true);
            return;
          }

          // Check if the sibling (follow-up) visit is today
          const today = dayjs().format('YYYY-MM-DD');
          const allJobs = await getMyJobs(today);
          const myJobs  = (allJobs || []).filter(j => j.technician_id === user?.id);

          const siblingToday = myJobs.some(j =>
            j.project_id === projectId &&
            j.id !== jobId &&
            !['completed', 'cancelled'].includes(j.status)
          );

          if (siblingToday) {
            // Return trip is later today — stay on duty
            await pingGps(latitude, longitude, true);
            return;
          }

          // Sibling is another day. Check if THIS was the last active job today.
          const otherActiveToday = myJobs.filter(j =>
            j.id !== jobId &&
            !['completed', 'cancelled'].includes(j.status) &&
            j.project_id !== projectId  // exclude any other visits of the same project
          );

          if (otherActiveToday.length === 0) {
            // Last job of the day — go off duty even though return trip is pending
            await pingGps(latitude, longitude, false);
            Alert.alert(
              '✅ Done for Today!',
              'Return trip is scheduled for another day. You have been marked off duty.',
              [{ text: 'OK' }]
            );
          } else {
            // Still have unrelated jobs today — stay on duty
            await pingGps(latitude, longitude, true);
          }
          return;
        }

        // Normal completion (no return trip needed)
        const today = dayjs().format('YYYY-MM-DD');
        const allJobs = await getMyJobs(today);
        const myJobs  = (allJobs || []).filter(j => j.technician_id === user?.id);
        const remainingJobs = myJobs.filter(j =>
          j.id !== jobId &&
          !['completed', 'cancelled'].includes(j.status)
        );
        if (remainingJobs.length === 0) {
          await pingGps(latitude, longitude, false);
          Alert.alert(
            '🎉 All Done!',
            'Great work today! You have been marked off duty.',
            [{ text: 'OK' }]
          );
        } else {
          await pingGps(latitude, longitude, true);
        }
      } else {
        // en_route, on_site, or any other status → stay on duty, ping position
        await pingGps(latitude, longitude, true);
      }
    } catch(e) {
      console.error('Auto duty error:', e);
    }
  };

  const changeStatus = async (newStatus, returnTripNeeded = false) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      // Build the effective job snapshot BEFORE async calls so handleAutoDuty sees the right flags
      const effectiveJob = {
        ...job,
        status: newStatus,
        return_trip_needed: returnTripNeeded || job.return_trip_needed,
      };
      if (isOnline) {
        await updateJobStatus(jobId, newStatus);
        if (returnTripNeeded) {
          // Explicitly persist the return_trip_needed flag when completing via "Done for Now"
          await updateJob(jobId, { return_trip_needed: true });
        }
        await handleAutoDuty(newStatus, effectiveJob);
      } else {
        await queueStatusUpdate(jobId, newStatus);
        Alert.alert('Saved Offline', 'Status queued — will sync when you reconnect.');
      }
      setJob(j => ({
        ...j,
        status: newStatus,
        ...(returnTripNeeded ? { return_trip_needed: true } : {}),
      }));
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
  const isFollowUpCall = job.job_type === 'Follow Up Call';
  const start = job.scheduled_start ? dayjs(job.scheduled_start).format('ddd, MMM D · h:mm A') : null;
  const end   = job.scheduled_end   ? dayjs(job.scheduled_end).format('h:mm A') : null;

  const STATUS_FLOW = isFollowUpCall ? [
    { key:'scheduled',     icon:'📅', label:'Scheduled'     },
    { key:'ready_to_call', icon:'📞', label:'Ready to Call' },
    { key:'completed',     icon:'✅', label:'Completed'     },
  ] : [
    { key:'scheduled', icon:'📅', label:'Scheduled' },
    { key:'en_route',  icon:'🚚', label:'En Route'  },
    { key:'on_site',   icon:'🔧', label:'On Site'   },
    {
      key:'completed',
      icon: job.return_trip_needed ? '🔄' : '✅',
      label: job.return_trip_needed ? 'Done for Now' : 'Completed',
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{padding:16,gap:16}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]}/>}
    >

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
            <Text style={styles.jobTypeText}>{job.job_type || 'Service Call'} · {job.display_number || '#'+job.job_number}</Text>
          </View>
          <View style={[styles.gpsPill, {backgroundColor:(job.status==='en_route'||job.status==='on_site')?C.green+'22':C.surface2, borderColor:(job.status==='en_route'||job.status==='on_site')?C.green:C.border}]}>
            <View style={[styles.gpsDot, {backgroundColor:(job.status==='en_route'||job.status==='on_site')?C.green:C.dim}]}/>
            <Text style={[styles.gpsLabel, {color:(job.status==='en_route'||job.status==='on_site')?C.green:C.muted}]}>
              {job.status==='en_route'?'ON DUTY':job.status==='on_site'?'ON SITE':job.status==='completed'?(job.return_trip_needed?'RETURN':'DONE'):'OFFLINE'}
            </Text>
          </View>
        </View>
        {/* Status badge — "DONE FOR NOW" overrides "COMPLETED" when return trip is pending */}
        <View style={[styles.statusBadge, {
          backgroundColor: (job.status==='completed' && job.return_trip_needed) ? '#f97316'+'22' : s.color+'22',
          borderColor: (job.status==='completed' && job.return_trip_needed) ? '#f97316'+'44' : s.color+'44',
        }]}>
          <Text style={[styles.statusBig, {
            color: (job.status==='completed' && job.return_trip_needed) ? '#f97316' : s.color,
          }]}>
            {job.status==='completed' && job.return_trip_needed ? '🔄 DONE FOR NOW' : s.label}
          </Text>
        </View>
      </View>

      {/* Status flow — forward-only */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>JOB STATUS</Text>

        {/* Progress track */}
        {(() => {
          const FLOW_KEYS = STATUS_FLOW.map(x => x.key);
          const curIdx = FLOW_KEYS.indexOf(job.status);
          const tsField = { en_route:'en_route_at', on_site:'on_site_at', completed:'completed_at' };
          return (
            <View style={{flexDirection:'row', alignItems:'flex-start', marginBottom:14}}>
              {STATUS_FLOW.map((sf, i) => {
                const done = i <= curIdx;
                const sc = STATUS[sf.key].color;
                const ts = tsField[sf.key] ? job[tsField[sf.key]] : null;
                return (
                  <React.Fragment key={sf.key}>
                    <View style={{alignItems:'center', flex:1, gap:3}}>
                      <View style={{
                        width:26, height:26, borderRadius:13,
                        backgroundColor: done ? sc : sc+'22',
                        borderWidth:2, borderColor: done ? sc : sc+'44',
                        alignItems:'center', justifyContent:'center',
                      }}>
                        {done && <View style={{width:9, height:9, borderRadius:5, backgroundColor:'#fff'}}/>}
                      </View>
                      <Text style={{fontSize:8, color:done?sc:C.muted, fontWeight:done?'700':'400', letterSpacing:0.5, textAlign:'center', lineHeight:11}}>
                        {sf.label.toUpperCase()}
                      </Text>
                      {ts ? (
                        <Text style={{fontSize:8, color:C.muted, textAlign:'center'}}>
                          {dayjs(ts).format('h:mm A')}
                        </Text>
                      ) : null}
                    </View>
                    {i < STATUS_FLOW.length - 1 && (
                      <View style={{
                        flex:1, height:2, marginTop:12,
                        backgroundColor: i < curIdx ? STATUS[STATUS_FLOW[i+1].key].color : C.border,
                      }}/>
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          );
        })()}

        {/* Single forward action button */}
        {(() => {
          const FLOW_KEYS = STATUS_FLOW.map(x => x.key);
          const curIdx = FLOW_KEYS.indexOf(job.status);
          const nextSf = STATUS_FLOW[curIdx + 1] ?? null;
          if (!nextSf) {
            const doneForNow = job.return_trip_needed;
            return (
              <View style={{
                padding:14, borderRadius:12, borderWidth:1, alignItems:'center', gap:4,
                backgroundColor: doneForNow ? '#f9731611' : C.green+'11',
                borderColor: doneForNow ? '#f9731644' : C.green+'44',
              }}>
                <Text style={{fontSize:15, fontWeight:'800', color: doneForNow ? '#f97316' : C.green}}>
                  {doneForNow ? '🔄 Done for Now' : '✓ Job Complete'}
                </Text>
                {doneForNow && (
                  <Text style={{fontSize:11, color:'#f97316', opacity:0.8}}>
                    Return trip needed — dispatcher will reschedule
                  </Text>
                )}
              </View>
            );
          }
          const sc = STATUS[nextSf.key].color;
          return (
            <TouchableOpacity
              onPress={() => changeStatus(nextSf.key)}
              disabled={saving}
              style={{padding:16, backgroundColor:sc+'22', borderRadius:12, borderWidth:1.5, borderColor:sc, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10}}>
              <View style={{width:8, height:8, borderRadius:4, backgroundColor:sc}}/>
              <Text style={{fontSize:15, color:sc, fontWeight:'700'}}>
                {saving ? 'Updating…' : `Mark as ${nextSf.label}`}
              </Text>
            </TouchableOpacity>
          );
        })()}

        {/* Return-trip shortcut when on_site — always visible so tech can flag "done for now" */}
        {job.status === 'on_site' && (
          <TouchableOpacity
            onPress={() => changeStatus('completed', true)}
            disabled={saving}
            style={{marginTop:8, padding:13, backgroundColor:'#f9731622', borderRadius:12, borderWidth:1.5, borderColor:'#f97316', flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8}}>
            <Text style={{fontSize:13, color:'#f97316', fontWeight:'700'}}>🔄 Done for Now — Return Trip Needed</Text>
          </TouchableOpacity>
        )}

        {/* Reopen — flips a completed job back to on_site so materials, POs and
            invoice edits unlock again. Keeps completed_at so history isn't lost. */}
        {job.status === 'completed' && (
          <TouchableOpacity
            onPress={() => Alert.alert(
              'Reopen this job?',
              'This puts the job back to On Site so you can add materials, POs, and invoice items. The original completion time stays recorded.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reopen', style: 'destructive', onPress: () => changeStatus('on_site', false) },
              ]
            )}
            disabled={saving}
            style={{marginTop:8, padding:13, backgroundColor:C.blue+'22', borderRadius:12, borderWidth:1.5, borderColor:C.blue, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8}}>
            <Text style={{fontSize:13, color:C.blue, fontWeight:'700'}}>🔓 Reopen Job — add materials / POs</Text>
          </TouchableOpacity>
        )}

        {(job.status === 'en_route' || job.status === 'completed') && (
          <Text style={styles.autoDutyNote}>
            {job.status === 'en_route'
              ? '📍 Auto went on duty'
              : job.return_trip_needed
                ? '🔄 Marked done for now — return trip pending'
                : '📍 Auto duty check run'}
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

      {/* Street View — shown when we have an address and a Maps key */}
      {job.address && mapsKey ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STREET VIEW</Text>
          <View style={styles.streetViewCard}>
            <Image
              source={{ uri: `https://maps.googleapis.com/maps/api/streetview?size=640x240&location=${encodeURIComponent(job.address)}&key=${mapsKey}&fov=90&pitch=5&source=outdoor` }}
              style={styles.streetViewImg}
              resizeMode="cover"
            />
            <Text style={styles.streetViewCredit}>© Google Street View</Text>
          </View>
        </View>
      ) : null}

      {/* Schedule */}
      {start && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SCHEDULED</Text>
          <View style={styles.infoCard}>
            <Text style={styles.scheduleText}>{start}{end ? ` – ${end}` : ''}</Text>
          </View>
        </View>
      )}

      {/* Call Details / Description */}
      {job.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CALL DETAILS</Text>
          <View style={styles.infoCard}>
            {job.description.split('\n').filter(Boolean).map((line, i) => (
              <Text key={i} style={[styles.noteLine, line.startsWith('ISSUE:') || line.startsWith('NOTES:') ? {color:C.amber, fontWeight:'700', fontSize:11, letterSpacing:0.5} : {}]}>{line}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* Estimates & Invoices */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>BILLING</Text>

        {/* Follow Up Call banner */}
        {job.job_type === 'Follow Up Call' && (
          <View style={{backgroundColor:'#6366f111', borderWidth:1, borderColor:'#6366f133', borderRadius:10, padding:12, flexDirection:'row', alignItems:'center', gap:10, marginBottom:8}}>
            <Text style={{fontSize:16}}>📞</Text>
            <View style={{flex:1}}>
              <Text style={{fontSize:12, fontWeight:'700', color:'#6366f1'}}>Follow Up Call</Text>
              <Text style={{fontSize:11, color:C.muted}}>Invoices are not created for follow-up calls. You can still create or review estimates.</Text>
            </View>
          </View>
        )}

        {(() => {
          // Estimates and invoices are locked until the tech is on site.
          // Before that (scheduled / en_route) tapping shows a soft alert instead
          // of navigating — no more creating paperwork from the truck.
          const onSite  = job.status === 'on_site' || job.status === 'completed';
          const gate = (label) => Alert.alert(
            'Not yet',
            `You must be on site to open ${label}. Tap "On Site" on the status bar above when you arrive.`,
            [{ text: 'OK' }]
          );

          return (
            <View style={{flexDirection:'row', gap:10}}>
              <TouchableOpacity
                style={[styles.billingBtn, {borderColor: C.amber+'66', backgroundColor: C.amber+'11'}, !onSite && { opacity: 0.5 }]}
                onPress={() => onSite
                  ? navigation.navigate('EstimatesList', { jobId, jobNumber: job.display_number || job.job_number, customerId: job.customer_id, customerName: job.customer_name })
                  : gate('Estimates')}
              >
                <Text style={{fontSize:22, marginBottom:4}}>{onSite ? '📄' : '🔒'}</Text>
                <Text style={[styles.billingBtnLabel, {color: C.amber}]}>Estimates</Text>
              </TouchableOpacity>
              {job.job_type !== 'Follow Up Call' && (
                <TouchableOpacity
                  style={[styles.billingBtn, {borderColor: C.green+'66', backgroundColor: C.green+'11'}, !onSite && { opacity: 0.5 }]}
                  onPress={() => onSite
                    ? navigation.navigate('InvoicesList', { jobId, jobNumber: job.display_number || job.job_number, customerId: job.customer_id, customerName: job.customer_name })
                    : gate('Invoices')}
                >
                  <Text style={{fontSize:22, marginBottom:4}}>{onSite ? '🧾' : '🔒'}</Text>
                  <Text style={[styles.billingBtnLabel, {color: C.green}]}>Invoices</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Customer history — always available */}
        {job.customer_id && (
          <TouchableOpacity
            style={{marginTop:10, padding:12, backgroundColor:C.blue+'11', borderWidth:1, borderColor:C.blue+'55', borderRadius:10, flexDirection:'row', alignItems:'center', gap:10}}
            onPress={() => navigation.navigate('CustomerHistory', {
              customerId: job.customer_id,
              customerName: job.customer_name,
              excludeJobId: job.id,
            })}
          >
            <Text style={{fontSize:20}}>📜</Text>
            <View style={{flex:1}}>
              <Text style={{color:C.blue, fontWeight:'700', fontSize:13}}>Customer History</Text>
              <Text style={{color:C.muted, fontSize:11, marginTop:1}}>Every prior job for {job.customer_name || 'this customer'}</Text>
            </View>
            <Text style={{color:C.muted, fontSize:20}}>›</Text>
          </TouchableOpacity>
        )}
      </View>

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



      {/* Parts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>PARTS USED</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('ScanParts', { jobId })}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>📦 Scan Parts</Text>
          </TouchableOpacity>
        </View>
        {materialCost && materialCost.line_items.length > 0 ? (
          <View style={styles.infoCard}>
            {materialCost.line_items.map((item, i) => (
              <View key={i} style={styles.partRow}>
                <Text style={styles.partName}>{item.name}</Text>
                <Text style={styles.partQty}>×{item.qty}</Text>
                <Text style={styles.partTotal}>${parseFloat(item.line_total).toFixed(2)}</Text>
              </View>
            ))}
            <View style={[styles.partRow, { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 8 }]}>
              <Text style={[styles.partName, { fontWeight: '700' }]}>Materials</Text>
              <Text style={[styles.partTotal, { color: C.green, fontWeight: '800' }]}>
                ${materialCost.total_material_cost.toFixed(2)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyNotes}>No parts scanned yet</Text>
        )}
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
  autoDutyNote:{fontSize:11,color:C.muted,fontStyle:'italic',textAlign:'center'},
  infoCard:{backgroundColor:C.surface,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border,gap:12},
  customerBig:{fontSize:18,fontWeight:'700',color:C.text},
  actionRow:{flexDirection:'row',alignItems:'center',gap:10},
  actionIcon:{fontSize:16,width:24},
  actionText:{flex:1,fontSize:13,color:C.text},
  addressLink:{color:C.blue,textDecorationLine:'underline'},
  actionBtn:{fontSize:12,color:C.green,fontWeight:'700',backgroundColor:C.green+'22',paddingHorizontal:12,paddingVertical:4,borderRadius:6},
  streetViewCard:{borderRadius:12,overflow:'hidden',borderWidth:1,borderColor:C.border,position:'relative'},
  streetViewImg:{width:'100%',height:180},
  streetViewCredit:{position:'absolute',bottom:5,right:8,fontSize:9,color:'rgba(255,255,255,0.5)',fontFamily:'monospace'},
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
  billingBtn:{flex:1,borderWidth:1.5,borderRadius:12,padding:14,alignItems:'center'},
  billingBtnLabel:{fontSize:12,fontWeight:'700'},
  partRow:{flexDirection:'row',alignItems:'center',gap:8},
  partName:{flex:1,fontSize:13,color:C.text},
  partQty:{fontSize:13,color:C.muted,minWidth:28,textAlign:'right'},
  partTotal:{fontSize:13,color:C.text,fontWeight:'600',minWidth:56,textAlign:'right'},
});
