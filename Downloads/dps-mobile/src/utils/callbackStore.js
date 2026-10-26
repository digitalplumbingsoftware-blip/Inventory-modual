/**
 * callbackStore — stores non-serializable functions outside React Navigation state.
 *
 * Instead of passing a function as a nav param (which triggers the serialization
 * warning and can break state persistence), callers store the callback here and
 * pass only the returned key as a plain string param.
 *
 * Usage (caller):
 *   import { storeCallback } from '../utils/callbackStore';
 *   const key = storeCallback((items) => { ... });
 *   navigation.navigate('PricebookMain', { callbackKey: key });
 *
 * Usage (receiver):
 *   import { getCallback, removeCallback } from '../utils/callbackStore';
 *   const cb = getCallback(route.params?.callbackKey);
 *   // after use:
 *   removeCallback(route.params?.callbackKey);
 */

const _store = {};
let _seq = 0;

export function storeCallback(fn) {
  const key = `__cb_${++_seq}_${Date.now()}`;
  _store[key] = fn;
  return key;
}

export function getCallback(key) {
  if (!key) return null;
  return _store[key] || null;
}

export function removeCallback(key) {
  if (key) delete _store[key];
}
