import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../theme';

// Square's secure card form (Web Payments SDK) in a WebView. Card numbers are typed
// into Square's own fields and never reach our app or server — tokenize() returns a
// one-time token the backend charges with. (Square's native SDK needs a custom
// build, which Expo Go can't load.)
//
// Usage: <SquareCardField ref={r} config={squareConfig}/> then `await r.current.tokenize()`
// → { token, brand, last4 }  (throws with a readable message if the card is invalid)

function cardPage({ applicationId, locationId, sdkUrl }) {
  const style = {
    input: { backgroundColor: C.surface, color: C.text, fontSize: '16px' },
    'input::placeholder': { color: C.dim },
    '.input-container': { borderColor: C.border2, borderRadius: '12px' },
    '.input-container.is-focus': { borderColor: C.green },
    '.input-container.is-error': { borderColor: C.red },
    '.message-text': { color: C.muted },
    '.message-icon': { color: C.muted },
    '.message-text.is-error': { color: C.red },
    '.message-icon.is-error': { color: C.red },
  };
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;padding:0;background:transparent}</style>
<script src="${sdkUrl}"></script>
</head><body><div id="card"></div><script>
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var card;
  (async function () {
    try {
      var payments = window.Square.payments(${JSON.stringify(applicationId)}, ${JSON.stringify(locationId)});
      card = await payments.card({ style: ${JSON.stringify(style)} });
      await card.attach('#card');
      post({ type: 'ready' });
      new ResizeObserver(function () { post({ type: 'height', h: document.body.scrollHeight }); }).observe(document.body);
    } catch (e) { post({ type: 'error', message: e.message || String(e) }); }
  })();
  window.tokenizeCard = async function () {
    try {
      var r = await card.tokenize();
      if (r.status === 'OK') {
        var c = (r.details && r.details.card) || {};
        post({ type: 'token', token: r.token, brand: c.brand, last4: c.last4 });
      } else {
        post({ type: 'invalid', message: (r.errors && r.errors[0] && r.errors[0].message) || 'Check the card details' });
      }
    } catch (e) { post({ type: 'invalid', message: e.message || 'Check the card details' }); }
  };
</script></body></html>`;
}

const SquareCardField = forwardRef(function SquareCardField({ config, onReady }, ref) {
  const web = useRef(null);
  const pending = useRef(null);
  const [height, setHeight] = useState(110);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    tokenize: () => new Promise((resolve, reject) => {
      if (!ready) return reject(new Error('Card form is still loading'));
      pending.current = { resolve, reject };
      web.current?.injectJavaScript('window.tokenizeCard(); true;');
    }),
  }), [ready]);

  const onMessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'ready') { setReady(true); onReady?.(); }
    else if (msg.type === 'height' && msg.h) setHeight(Math.max(60, msg.h));
    else if (msg.type === 'error') setError(msg.message);
    else if (msg.type === 'token') { pending.current?.resolve(msg); pending.current = null; }
    else if (msg.type === 'invalid') { pending.current?.reject(new Error(msg.message)); pending.current = null; }
  };

  return (
    <View>
      <WebView
        ref={web}
        // Square only runs on secure (https) pages; the HTML is local, the origin is nominal
        source={{ html: cardPage(config), baseUrl: 'https://localhost' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        scrollEnabled={false}
        style={[styles.web, { height }]}
        containerStyle={{ backgroundColor: 'transparent' }}
        keyboardDisplayRequiresUserAction={false}
      />
      {!ready && !error && (
        <View style={styles.loading}><ActivityIndicator color={C.green}/><Text style={styles.loadingText}>Loading secure card form…</Text></View>
      )}
      {!!error && <Text style={styles.error}>⚠ Card form couldn't load: {error}</Text>}
    </View>
  );
});

export default SquareCardField;

const styles = StyleSheet.create({
  web:         { backgroundColor: 'transparent' },
  loading:     { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: C.muted, fontSize: 13 },
  error:       { color: C.red, fontSize: 12, marginTop: 6 },
});
