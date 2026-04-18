import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { updateJobStatus, addJobNote, uploadJobPhoto } from './api';

const QUEUE_KEY = 'dps_offline_queue';

// ── Queue storage ─────────────────────────────────────────────────────────────
async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ── Enqueue operations ────────────────────────────────────────────────────────
export async function queueStatusUpdate(jobId, status) {
  const queue = await loadQueue();
  // Replace any prior pending status update for this job — last write wins
  const filtered = queue.filter((op) => !(op.type === 'status' && op.jobId === jobId));
  filtered.push({ type: 'status', jobId, status, ts: Date.now() });
  await saveQueue(filtered);
}

export async function queueNoteAppend(jobId, note) {
  const queue = await loadQueue();
  // Notes are append-only — always add, never replace
  queue.push({ type: 'note', jobId, note, ts: Date.now() });
  await saveQueue(queue);
}

export async function queuePhotoUpload(jobId, uri, mimeType) {
  const queue = await loadQueue();
  queue.push({ type: 'photo', jobId, uri, mimeType, ts: Date.now() });
  await saveQueue(queue);
}

// ── Flush queue ───────────────────────────────────────────────────────────────
export async function flushQueue() {
  const queue = await loadQueue();
  if (!queue.length) return { flushed: 0, failed: 0 };

  const remaining = [];
  let flushed = 0;
  let failed = 0;

  for (const op of queue) {
    try {
      if (op.type === 'status') {
        await updateJobStatus(op.jobId, op.status);
      } else if (op.type === 'note') {
        await addJobNote(op.jobId, op.note);
      } else if (op.type === 'photo') {
        await uploadJobPhoto(op.jobId, op.uri, op.mimeType);
      }
      flushed++;
    } catch {
      // Keep failed ops for next flush attempt
      remaining.push(op);
      failed++;
    }
  }

  await saveQueue(remaining);
  return { flushed, failed };
}

// ── Connectivity listener ─────────────────────────────────────────────────────
let _unsubscribe = null;

export function startOfflineSync(onFlush) {
  if (_unsubscribe) return;
  _unsubscribe = NetInfo.addEventListener(async (state) => {
    if (state.isConnected && state.isInternetReachable) {
      const result = await flushQueue();
      if (result.flushed > 0 && onFlush) onFlush(result);
    }
  });
}

export function stopOfflineSync() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}
