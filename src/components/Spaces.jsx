import React, { useState, useEffect, useRef, useCallback } from 'react';
import { startMicCapture, stopMicCapture, playRawAudio } from '../utils/audio.js';

/*
  PROXIMITY VOICE SPACES — Twitter Spaces concept adapted for V2V:
  
  - Each vehicle automatically creates a "Space" with 100m radius.
  - The vehicle owner is the HOST of their space.
  - Other vehicles within 100m are MEMBERS of that space.
  - HOST can talk to all members. Members can talk to host. Members CANNOT talk to each other.
  - If vehicle B is in range of both A and C, B is a member of A's space AND C's space,
    but A and C cannot talk to each other through B's membership.
  - Uses Geolocation API to compute distances between vehicles.
*/

const RADIUS_METERS = 100;

// Haversine distance between two lat/lng points in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Spaces({ vehicle, allVehicles, myLocation }) {
  const [geoError, setGeoError] = useState('');
  const [recording, setRecording] = useState(false);
  const [targetVehicleId, setTargetVehicleId] = useState(null); // which space host am I talking to
  const [incomingAudio, setIncomingAudio] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const recRef = useRef(null);
  const voicePollRef = useRef(null);

  const targetHostIdRef = useRef(null);

  // Check if location is enabled
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported');
    } else if (!myLocation) {
      setGeoError('Waiting for GPS coordinates...');
    } else {
      setGeoError('');
    }
  }, [myLocation]);

  // Build the spaces model from all connected vehicles
  const spaces = React.useMemo(() => {
    if (!myLocation) return [];

    // Each vehicle that is connected creates a space
    // We compute who is "in range" of whom
    const vehicleLocations = allVehicles
      .filter(v => v.connected)
      .map(v => {
        const isMe = v.vehicleId === vehicle.vehicleId;
        // Use real geolocation if available, fallback to mock offset for testing
        const lat = isMe 
          ? myLocation.lat 
          : (v.peerLocation ? v.peerLocation.lat : myLocation.lat + (v.vehicleId - 1) * 0.0002);
        const lng = isMe 
          ? myLocation.lng 
          : (v.peerLocation ? v.peerLocation.lng : myLocation.lng);

        return {
          id: v.vehicleId,
          ip: v.ip,
          status: v.parsedStatus,
          lat,
          lng,
          connected: v.connected,
        };
      });

    // My vehicle's space: I am host, nearby vehicles are members
    const myV = vehicleLocations.find(v => v.id === vehicle.vehicleId);
    if (!myV) return [];

    const result = [];

    // For each connected vehicle, create its space perspective
    vehicleLocations.forEach(hostV => {
      const members = vehicleLocations.filter(otherV => {
        if (otherV.id === hostV.id) return false;
        const dist = haversine(hostV.lat, hostV.lng, otherV.lat, otherV.lng);
        return dist <= RADIUS_METERS;
      });

      result.push({
        hostId: hostV.id,
        hostIp: hostV.ip,
        hostStatus: hostV.status,
        isMySpace: hostV.id === vehicle.vehicleId,
        members: members.map(m => ({
          id: m.id,
          ip: m.ip,
          status: m.status,
          distance: Math.round(haversine(hostV.lat, hostV.lng, m.lat, m.lng)),
        })),
        iAmMember: members.some(m => m.id === vehicle.vehicleId) || hostV.id === vehicle.vehicleId,
      });
    });

    return result;
  }, [myLocation, allVehicles, vehicle.vehicleId]);

  // Poll for incoming voice messages
  useEffect(() => {
    if (!vehicle.connected) return;

    voicePollRef.current = setInterval(async () => {
      if (recording || playingAudio) return;
      const buf = await vehicle.checkVoice();
      if (buf) {
        setIncomingAudio(true);
        setPlayingAudio(true);
        try {
          await playRawAudio(buf);
        } catch (e) {
          console.error('Playback error:', e);
        }
        setPlayingAudio(false);
        setTimeout(() => setIncomingAudio(false), 1000);
      }
    }, 3000);

    return () => clearInterval(voicePollRef.current);
  }, [vehicle.connected, recording, playingAudio, vehicle.checkVoice]);

  const isRecordingRef = useRef(false);
  const startPromiseRef = useRef(null);

  // Send voice WAV blob helper
  const sendWavToTarget = useCallback(async (wavBlob, targetHostId) => {
    const targetSpace = spaces.find(s => s.hostId === targetHostId);
    if (!targetSpace) {
      await vehicle.sendVoice(wavBlob);
      return;
    }

    if (targetSpace.isMySpace) {
      // I am host: send to all members of my space
      if (targetSpace.members.length === 0) {
        vehicle.addLog("No members in space to send voice to.");
        return;
      }
      for (const member of targetSpace.members) {
        const memberObj = allVehicles.find(v => v.vehicleId === member.id);
        if (memberObj && memberObj.connected) {
          await memberObj.sendVoice(wavBlob);
        }
      }
    } else {
      // I am member: send to host of this space
      const hostObj = allVehicles.find(v => v.vehicleId === targetHostId);
      if (hostObj && hostObj.connected) {
        await hostObj.sendVoice(wavBlob);
      } else {
        vehicle.addLog(`Host V${targetHostId} is not connected.`);
      }
    }
  }, [spaces, vehicle, allVehicles]);

  // Start recording voice for a specific space host
  const handleMicDown = useCallback(async (spaceHostId) => {
    if (!vehicle.connected) return;
    targetHostIdRef.current = spaceHostId;
    setTargetVehicleId(spaceHostId);
    setRecording(true);
    isRecordingRef.current = true;

    const promise = startMicCapture();
    startPromiseRef.current = promise;

    try {
      const session = await promise;
      if (!isRecordingRef.current) {
        // User has already released the mic button before getUserMedia completed
        stopMicCapture(session);
        return;
      }
      recRef.current = session;
    } catch (e) {
      setRecording(false);
      isRecordingRef.current = false;
      startPromiseRef.current = null;
      vehicle.addLog(`Mic error: ${e.message}`);
    }
  }, [vehicle]);

  // Stop recording and send
  const handleMicUp = useCallback(async () => {
    isRecordingRef.current = false;
    const targetHostId = targetHostIdRef.current;
    
    // If mic is still starting, wait for it and clean up/send
    if (startPromiseRef.current) {
      try {
        const session = await startPromiseRef.current;
        startPromiseRef.current = null;
        setRecording(false);
        const wavBlob = stopMicCapture(session);
        recRef.current = null;
        setTargetVehicleId(null);
        targetHostIdRef.current = null;

        if (wavBlob && wavBlob.size > 100) {
          await sendWavToTarget(wavBlob, targetHostId);
        }
      } catch (e) {
        console.error("Error during delayed mic release:", e);
      }
      return;
    }

    if (!recRef.current) return;
    setRecording(false);
    const wavBlob = stopMicCapture(recRef.current);
    recRef.current = null;
    setTargetVehicleId(null);
    targetHostIdRef.current = null;

    if (wavBlob && wavBlob.size > 100) {
      await sendWavToTarget(wavBlob, targetHostId);
    }
  }, [sendWavToTarget]);

  const myVehicleNum = vehicle.vehicleId;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Spaces header */}
      <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>📡</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Voice Spaces</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
          Proximity-based voice communication. Each vehicle hosts a space for
          others within {RADIUS_METERS}m. Hold the mic to talk.
        </p>
        {geoError && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(252,163,17,0.1)', border: '1px solid rgba(252,163,17,0.2)', fontSize: 11, color: 'var(--accent-amber)' }}>
            ⚠️ {geoError}
          </div>
        )}
        {myLocation && (
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            📍 {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)} (±{Math.round(myLocation.accuracy || 0)}m)
          </div>
        )}
      </div>

      {/* Incoming audio indicator */}
      {incomingAudio && (
        <div className="card" style={{
          borderColor: 'rgba(6,214,160,0.3)', background: 'rgba(6,214,160,0.06)',
          display: 'flex', alignItems: 'center', gap: 12, padding: 14,
        }}>
          <span style={{ fontSize: 20 }}>🔊</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-green)' }}>
              {playingAudio ? 'Playing incoming voice...' : 'Voice received!'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>From a vehicle in your space</div>
          </div>
          {playingAudio && (
            <div className="waveform-bar" style={{ marginLeft: 'auto' }}>
              <div className="bar"></div><div className="bar"></div><div className="bar"></div>
              <div className="bar"></div><div className="bar"></div>
            </div>
          )}
        </div>
      )}

      {!vehicle.connected ? (
        <div className="empty-state">
          <div className="icon">🔌</div>
          <h3>Not Connected</h3>
          <p>Connect to your ESP32 vehicle in Settings to use Voice Spaces</p>
        </div>
      ) : spaces.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📍</div>
          <h3>Waiting for Location</h3>
          <p>Enable location access to discover nearby vehicle spaces</p>
        </div>
      ) : (
        <>
          <span className="section-title">Active Spaces</span>
          {spaces.map(space => (
            <div key={space.hostId} className="space-card">
              <div className="space-header">
                <div>
                  <div className="space-name">
                    {space.isMySpace ? '🏠 My Space' : `Vehicle ${space.hostId}'s Space`}
                  </div>
                  <div className="space-host">
                    {space.isMySpace ? `You are the host` : `Host: Vehicle ${space.hostId}`} • {RADIUS_METERS}m radius
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span className="space-badge live">LIVE</span>
                  <span className="space-badge count">{space.members.length + 1}</span>
                </div>
              </div>

              {/* Members avatars */}
              <div className="space-members">
                <div className="space-avatar host" title={`Vehicle ${space.hostId} (Host)`}>
                  V{space.hostId}
                </div>
                {space.members.map(m => (
                  <div key={m.id} className="space-avatar member" title={`Vehicle ${m.id} — ${m.distance}m away`}>
                    V{m.id}
                  </div>
                ))}
              </div>

              {space.members.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
                  No other vehicles within {RADIUS_METERS}m range
                </div>
              )}

              {space.members.length > 0 && (
                <div className="space-meta">
                  {space.members.map(m => (
                    <span key={m.id}>V{m.id}: {m.distance}m</span>
                  ))}
                </div>
              )}

              {/* Mic button — only show if I'm part of this space */}
              {space.iAmMember && space.members.length > 0 && (
                <div className="mic-container" style={{ paddingTop: 12, paddingBottom: 4 }}>
                  <div className={`mic-ring ${recording && targetVehicleId === space.hostId ? 'active' : ''}`}>
                    <button
                      className={`mic-btn ${recording && targetVehicleId === space.hostId ? 'recording' : ''}`}
                      onMouseDown={() => handleMicDown(space.hostId)}
                      onMouseUp={handleMicUp}
                      onTouchStart={(e) => { e.preventDefault(); handleMicDown(space.hostId); }}
                      onTouchEnd={(e) => { e.preventDefault(); handleMicUp(); }}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" fill="white"/>
                      </svg>
                    </button>
                  </div>
                  <div className="mic-label">
                    {recording && targetVehicleId === space.hostId
                      ? 'Release to send'
                      : space.isMySpace
                        ? 'Hold to talk to members'
                        : `Hold to talk to V${space.hostId}`
                    }
                  </div>
                  {recording && targetVehicleId === space.hostId && (
                    <div className="waveform-bar">
                      <div className="bar"></div><div className="bar"></div><div className="bar"></div>
                      <div className="bar"></div><div className="bar"></div>
                    </div>
                  )}
                </div>
              )}

              {/* Explanation of the host-only rule */}
              {!space.isMySpace && space.members.length > 1 && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  background: 'rgba(123,97,255,0.05)', border: '1px dashed rgba(123,97,255,0.15)',
                  fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  💡 You can only talk to the host (V{space.hostId}), not other members. This is how V2V Spaces work — each host manages their own channel.
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* How it works */}
      <div className="card" style={{ padding: 16 }}>
        <span className="section-title" style={{ padding: 0, marginBottom: 10, display: 'block' }}>How V2V Spaces Work</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { icon: '📡', text: 'Each vehicle creates a space with 100m radius' },
            { icon: '👑', text: 'Vehicle owner is the HOST of their space' },
            { icon: '🎙️', text: 'Host ↔ Members can talk. Members ✗ Members cannot.' },
            { icon: '🚶', text: 'Leave the 100m radius → auto-removed from space' },
            { icon: '🔄', text: 'Overlapping spaces are independent channels' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
