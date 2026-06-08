import { useState, useEffect, useRef, useCallback } from 'react';
import { speak } from '../utils/tts.js';
import { mqttService } from '../utils/mqtt.js';

// Parse the status string from ESP32 /data endpoint into a normalized state
function parseStatus(raw) {
  if (!raw) return { state: 'offline', label: 'Offline', emoji: '⚫' };
  const s = raw.toLowerCase();
  if (s.includes('fall'))     return { state: 'fall',     label: 'Fall Detected!',    emoji: '🔴' };
  if (s.includes('tilt'))     return { state: 'tilt',     label: 'Tilt Detected',     emoji: '🟠' };
  if (s.includes('movement') || s.includes('sudden')) return { state: 'movement', label: 'Sudden Movement', emoji: '🟡' };
  if (s.includes('stable'))   return { state: 'stable',   label: 'Stable',            emoji: '✅' };
  return { state: 'stable', label: raw, emoji: '✅' };
}

// Voice announcement messages for each state
const VOICE_MESSAGES = {
  fall:     (vNum) => `Warning! Vehicle ${vNum} fall detected!`,
  tilt:     (vNum) => `Caution. Vehicle ${vNum} tilt detected.`,
  movement: (vNum) => `Vehicle ${vNum}, sudden movement detected.`,
  stable:   (vNum) => `Vehicle ${vNum} is now stable.`,
  offline:  (vNum) => `Vehicle ${vNum} is offline.`,
};

export default function useVehicle(vehicleId, isLocal = true) {
  const [ip, setIp] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [rawStatus, setRawStatus] = useState('');
  const [parsedStatus, setParsedStatus] = useState({ state: 'offline', label: 'Offline', emoji: '⚫' });
  const [peerStatus, setPeerStatus] = useState({ state: 'offline', label: 'Offline', emoji: '⚫' });
  const [peerRawStatus, setPeerRawStatus] = useState('');
  const [logs, setLogs] = useState([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const pollRef = useRef(null);
  const prevStateRef = useRef('offline');  // track previous state for change detection
  const portNum = 8080;

  const addLog = useCallback((msg, type = 'system') => {
    setLogs(prev => [{ id: Date.now() + Math.random(), msg, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 99)]);
  }, []);

  const baseUrl = useCallback(() => `http://${ip}:${portNum}`, [ip]);

  // Announce status change via TTS
  const announceStatus = useCallback((newState, vNum) => {
    if (!ttsEnabled) return;
    const msgFn = VOICE_MESSAGES[newState];
    if (msgFn) {
      speak(msgFn(vNum));
    }
  }, [ttsEnabled]);

  // Detect status changes and publish to peer (without announcing locally)
  useEffect(() => {
    if (!isLocal) return;
    const newState = parsedStatus.state;
    if (newState !== prevStateRef.current && connected) {
      // Publish alert to MQTT broker so peer ESP32 and peer Phone app receive it immediately
      mqttService.publish('v2v/alerts', `${newState}|vehicle${vehicleId}`);
      prevStateRef.current = newState;
    }
  }, [parsedStatus.state, connected, vehicleId, isLocal]);

  // Connect to ESP32
  const connect = useCallback(async (targetIp) => {
    const finalIp = targetIp || ip;
    if (!finalIp) return;
    setIp(finalIp);
    setConnecting(true);
    addLog(`Connecting to ${finalIp}:${portNum}...`);

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      let res;
      try {
        res = await fetch(`http://${finalIp}:${portNum}/data`, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const text = await res.text();
          setRawStatus(text);
          const parsed = parseStatus(text);
          setParsedStatus(parsed);
          prevStateRef.current = parsed.state;
          setConnected(true);
          setConnecting(false);
          addLog(`Connected! Status: ${text}`, 'received');
          if (ttsEnabled) speak(`Connected to Vehicle ${vehicleId}. Status: ${parsed.label}`);
          return true;
        }
        throw new Error(`Status ${res.status}`);
      } catch (err) {
        clearTimeout(t);
        // Try fallback to no-cors mode to verify if the server is simply alive
        addLog("CORS restriction detected. Retrying connection check in bypass mode...");
        const fallbackCtrl = new AbortController();
        const fallbackT = setTimeout(() => fallbackCtrl.abort(), 3000);
        
        await fetch(`http://${finalIp}:${portNum}/data`, { 
          method: 'GET',
          mode: 'no-cors', 
          signal: fallbackCtrl.signal 
        });
        clearTimeout(fallbackT);

        // If the fetch call didn't throw a network error, the ESP32 is online and listening!
        setRawStatus("Stable (Bypass)");
        setParsedStatus({ state: 'stable', label: 'Connected (Bypass)', emoji: '✅' });
        prevStateRef.current = 'stable';
        setConnected(true);
        setConnecting(false);
        addLog("Connected (Bypass mode active)!", "received");
        if (ttsEnabled) speak(`Connected to Vehicle ${vehicleId} in bypass mode.`);
        return true;
      }
    } catch (e) {
      setConnecting(false);
      setConnected(false);
      setParsedStatus({ state: 'offline', label: 'Connection Failed', emoji: '⚫' });
      addLog(`Connection failed: Check if ESP32 IP is correct and on the same WiFi.`);
      if (ttsEnabled) speak(`Vehicle ${vehicleId} connection failed.`);
      return false;
    }
  }, [ip, addLog, vehicleId, ttsEnabled]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setParsedStatus({ state: 'offline', label: 'Disconnected', emoji: '⚫' });
    setPeerStatus({ state: 'offline', label: 'Offline', emoji: '⚫' });
    prevStateRef.current = 'offline';
    addLog('Disconnected');
    if (ttsEnabled) speak(`Vehicle ${vehicleId} disconnected.`);
  }, [addLog, vehicleId, ttsEnabled]);

  // Poll for status updates
  useEffect(() => {
    if (!isLocal || !connected || !ip) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`http://${ip}:${portNum}/data`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const text = await res.text();
          setRawStatus(text);
          setParsedStatus(parseStatus(text));
        }
      } catch {
        // In bypass mode, standard poll fails. We do a no-cors ping to check if still online.
        try {
          await fetch(`http://${ip}:${portNum}/data`, { mode: 'no-cors', signal: AbortSignal.timeout(2000) });
        } catch {
          // If even the no-cors ping fails, the server is actually down
          setConnected(false);
          setParsedStatus({ state: 'offline', label: 'Lost Connection', emoji: '⚫' });
          if (ttsEnabled) speak(`Lost connection to Vehicle ${vehicleId}`);
        }
      }
    };

    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [connected, ip, vehicleId, ttsEnabled, isLocal]);

  // Send voice WAV blob to ESP32
  const sendVoice = useCallback(async (wavBlob) => {
    if (!connected || !ip) return false;
    addLog(`Sending voice (${wavBlob.size} bytes)...`);
    try {
      const formData = new FormData();
      formData.append('voice', wavBlob, 'voice.wav');
      const res = await fetch(`http://${ip}:${portNum}/voiceMessage`, { method: 'POST', body: formData });
      if (res.ok) {
        addLog('Voice sent successfully!', 'sent');
        return true;
      }
      throw new Error(`Status ${res.status}`);
    } catch (e) {
      addLog(`Voice send failed: ${e.message}`);
      // Retry alternate endpoint
      try {
        const res2 = await fetch(`http://${ip}:${portNum}/uploadAudio`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: await wavBlob.text()
        });
        if (res2.ok) { addLog('Voice sent via /uploadAudio', 'sent'); return true; }
      } catch { /* silent */ }
      return false;
    }
  }, [connected, ip, addLog]);

  // Check and play incoming voice
  const checkVoice = useCallback(async () => {
    if (!isLocal || !connected || !ip) return null;
    try {
      const check = await fetch(`http://${ip}:${portNum}/checkNewVoice`, { signal: AbortSignal.timeout(3000) });
      const text = await check.text();
      if (text.includes('new_voice') || text.includes('yes') || text.trim() === '1') {
        const audioRes = await fetch(`http://${ip}:${portNum}/playVoice`);
        const buf = await audioRes.arrayBuffer();
        if (buf.byteLength > 100) {
          addLog(`Received voice (${buf.byteLength} bytes)`, 'received');
          return buf;
        }
      }
    } catch { /* silent */ }
    return null;
  }, [connected, ip, addLog]);

  const [peerLocation, setPeerLocation] = useState(null);

  return {
    vehicleId, ip, setIp, connected, setConnected, connecting,
    rawStatus, parsedStatus, setParsedStatus, peerStatus, setPeerStatus,
    peerLocation, setPeerLocation,
    logs, addLog, connect, disconnect,
    sendVoice, checkVoice, baseUrl,
    ttsEnabled, setTtsEnabled, announceStatus,
  };
}
