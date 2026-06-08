import React, { useState, useEffect, useRef } from 'react';
import useVehicle from './hooks/useVehicle.js';
import { speak } from './utils/tts.js';
import Dashboard from './components/Dashboard.jsx';
import Spaces from './components/Spaces.jsx';
import Settings from './components/Settings.jsx';
import { mqttService } from './utils/mqtt.js';

// SVG Icons for bottom nav
const IconDashboard = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={active ? '#06d6a0' : '#4a5568'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const IconSpaces = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={active ? '#06d6a0' : '#4a5568'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const IconSettings = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={active ? '#06d6a0' : '#4a5568'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [vehicleNum, setVehicleNum] = useState(1);
  const [myLocation, setMyLocation] = useState({
    lat: 12.97159,
    lng: 77.59456,
    accuracy: 10
  });

  // Create vehicle hooks (with isLocal flag)
  const vehicle1 = useVehicle(1, vehicleNum === 1);
  const vehicle2 = useVehicle(2, vehicleNum === 2);

  // Current vehicle based on selection
  const currentVehicle = vehicleNum === 1 ? vehicle1 : vehicle2;
  const peerVehicle = vehicleNum === 1 ? vehicle2 : vehicle1;
  const allVehicles = [vehicle1, vehicle2];

  // Store vehicle hooks and selected number in refs for stable callback closure
  const vehicle1Ref = useRef(vehicle1);
  const vehicle2Ref = useRef(vehicle2);
  const vehicleNumRef = useRef(vehicleNum);

  useEffect(() => {
    vehicle1Ref.current = vehicle1;
    vehicle2Ref.current = vehicle2;
    vehicleNumRef.current = vehicleNum;
  });

  // 1. Track location at App level
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => console.error('App Location Error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2. Connect to MQTT for cross-device syncing
  useEffect(() => {
    // Connect to MQTT Broker
    mqttService.connect(vehicleNum, (topic, message) => {
      try {
        const payload = JSON.parse(message);
        
        // Handle discovery broadcasts
        if (topic === 'v2v/discovery') {
          // If the message is from the OTHER vehicle
          if (payload.id !== vehicleNumRef.current) {
            const peer = vehicleNumRef.current === 1 ? vehicle2Ref.current : vehicle1Ref.current;
            peer.setIp(payload.ip);
            peer.setConnected(true);
            peer.setParsedStatus(payload.status);
            peer.setPeerLocation({ lat: payload.lat, lng: payload.lng });
          }
        }
        
        // Handle alert broadcasts
        if (topic === 'v2v/alerts') {
          const [state, source] = message.split('|');
          const sourceId = source === 'vehicle1' ? 1 : 2;
          if (sourceId !== vehicleNumRef.current) {
            const peer = vehicleNumRef.current === 1 ? vehicle2Ref.current : vehicle1Ref.current;
            // Update peer status immediately
            peer.setParsedStatus({
              state: state,
              label: state === 'fall' ? 'Fall Detected!' : state === 'tilt' ? 'Tilt Detected' : state === 'movement' ? 'Sudden Movement' : 'Stable',
              emoji: state === 'fall' ? '🔴' : state === 'tilt' ? '🟠' : state === 'movement' ? '🟡' : '✅'
            });
          }
        }
      } catch (e) {
        // Handle non-JSON payloads (like simple "fall" strings)
        if (topic === 'v2v/alerts') {
          const raw = message.trim().toLowerCase();
          const targetId = raw.includes('vehicle1') ? 1 : raw.includes('vehicle2') ? 2 : (vehicleNumRef.current === 1 ? 2 : 1);
          if (targetId !== vehicleNumRef.current) {
            const peer = vehicleNumRef.current === 1 ? vehicle2Ref.current : vehicle1Ref.current;
            const state = raw.includes('fall') ? 'fall' : raw.includes('tilt') ? 'tilt' : raw.includes('movement') ? 'movement' : 'stable';
            peer.setParsedStatus({
              state: state,
              label: state === 'fall' ? 'Fall Detected!' : state === 'tilt' ? 'Tilt Detected' : state === 'movement' ? 'Sudden Movement' : 'Stable',
              emoji: state === 'fall' ? '🔴' : state === 'tilt' ? '🟠' : state === 'movement' ? '🟡' : '✅'
            });
          }
        }
      }
    });

    return () => {
      mqttService.disconnect();
    };
  }, [vehicleNum]);

  // 3. Periodically publish our own location & IP for peer discovery
  useEffect(() => {
    if (!myLocation) return;

    const timer = setInterval(() => {
      const activeVehicle = vehicleNumRef.current === 1 ? vehicle1Ref.current : vehicle2Ref.current;
      mqttService.publish('v2v/discovery', {
        id: vehicleNumRef.current,
        ip: activeVehicle.ip,
        lat: myLocation.lat,
        lng: myLocation.lng,
        status: activeVehicle.parsedStatus,
        time: Date.now()
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [myLocation]);

  // 5. Track peer status changes and announce them via TTS (runs at App level so active in all tabs)
  const prevPeerStateRef = useRef('offline');
  const prevPeerIdRef = useRef(null);

  useEffect(() => {
    if (prevPeerIdRef.current !== peerVehicle.vehicleId) {
      prevPeerIdRef.current = peerVehicle.vehicleId;
      prevPeerStateRef.current = peerVehicle.parsedStatus.state;
      return;
    }

    const peerState = peerVehicle.parsedStatus.state;
    if (peerState !== prevPeerStateRef.current && peerState !== 'offline') {
      if (currentVehicle.ttsEnabled && peerVehicle.connected) {
        const PEER_VOICE = {
          fall:     (n) => `Alert! Vehicle ${n} has fallen! Check on the driver immediately.`,
          tilt:     (n) => `Vehicle ${n} tilt detected.`,
          movement: (n) => `Vehicle ${n} sudden movement detected.`,
          stable:   (n) => `Vehicle ${n} is now stable.`,
        };
        const msgFn = PEER_VOICE[peerState];
        if (msgFn) {
          speak(msgFn(peerVehicle.vehicleId));
          currentVehicle.addLog(`🔊 Peer Alert: "${msgFn(peerVehicle.vehicleId)}"`, 'system');
        }
      }
      prevPeerStateRef.current = peerState;
    }
  }, [peerVehicle.parsedStatus.state, peerVehicle.connected, peerVehicle.vehicleId, currentVehicle.ttsEnabled, currentVehicle.addLog]);

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">V2V</div>
          <div>
            <div className="header-title">V2V Shield</div>
            <div className="header-sub">Vehicle {vehicleNum}</div>
          </div>
        </div>
        <div className={`status-pill ${currentVehicle.connected ? currentVehicle.parsedStatus.state : 'offline'}`}>
          <span className="status-dot-sm"></span>
          {currentVehicle.connected ? currentVehicle.parsedStatus.label : 'Offline'}
        </div>
      </header>

      {/* Content */}
      <main className="app-content">
        {activeTab === 'dashboard' && (
          <Dashboard vehicle={currentVehicle} peerVehicle={peerVehicle} />
        )}
        {activeTab === 'spaces' && (
          <Spaces vehicle={currentVehicle} allVehicles={allVehicles} myLocation={myLocation} />
        )}
        {activeTab === 'settings' && (
          <Settings 
            vehicle={currentVehicle} 
            vehicleNum={vehicleNum} 
            onVehicleNumChange={setVehicleNum} 
            myLocation={myLocation}
            setMyLocation={setMyLocation}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')} id="nav-dashboard">
          <IconDashboard active={activeTab === 'dashboard'} />
          <span>Dashboard</span>
        </button>
        <button className={`nav-btn ${activeTab === 'spaces' ? 'active' : ''}`} onClick={() => setActiveTab('spaces')} id="nav-spaces">
          <IconSpaces active={activeTab === 'spaces'} />
          <span>Spaces</span>
        </button>
        <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} id="nav-settings">
          <IconSettings active={activeTab === 'settings'} />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}
