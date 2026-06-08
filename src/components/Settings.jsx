import React, { useState } from 'react';

const PRESET_IPS = ['10.78.143.179', '10.135.91.179', '192.168.4.1', '10.175.244.1'];

export default function Settings({ vehicle, vehicleNum, onVehicleNumChange, myLocation, setMyLocation }) {
  const [inputIp, setInputIp] = useState(vehicle.ip || '');
  const [showLogs, setShowLogs] = useState(false);

  // Derive initial simulated distance from mock offset
  const baseLat = 12.97159;
  const currentOffset = Math.abs(myLocation ? myLocation.lat - baseLat : 0);
  const [simDistance, setSimDistance] = useState(Math.round(currentOffset * 111000));

  const handleConnect = async () => {
    if (!inputIp.trim()) return;
    vehicle.setIp(inputIp.trim());
    await vehicle.connect(inputIp.trim());
  };

  const handleSimDistanceChange = (e) => {
    const dist = parseFloat(e.target.value);
    setSimDistance(dist);
    
    // Relative distance calculation:
    // If Vehicle 1, we offset its latitude. If Vehicle 2, we stay at base.
    // This creates an exact physical distance in meters for Haversine calculations!
    if (vehicleNum === 1) {
      setMyLocation({
        lat: baseLat + (dist / 111000),
        lng: 77.59456,
        accuracy: 10
      });
    } else {
      setMyLocation({
        lat: baseLat,
        lng: 77.59456 + (dist / 111000), // Slightly offset longitude for vehicle 2
        accuracy: 10
      });
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Vehicle identity */}
      <div className="card">
        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Vehicle Identity</h3>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Set which vehicle this app controls</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => onVehicleNumChange(n)}
              className="btn"
              style={{
                flex: 1,
                background: vehicleNum === n ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))' : 'rgba(255,255,255,0.03)',
                color: vehicleNum === n ? '#070b14' : 'var(--text-secondary)',
                border: vehicleNum === n ? 'none' : '1px solid var(--glass-border)',
                fontWeight: 700, fontSize: 13,
              }}
            >
              🚗 Vehicle {n}
            </button>
          ))}
        </div>
      </div>

      {/* Connection */}
      <div className="card setup-section">
        <div style={{ marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>ESP32 Connection</h3>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {vehicle.connected ? `Connected to ${vehicle.ip}:8080` : 'Enter the IP address of your ESP32'}
          </p>
        </div>

        <div className="input-group">
          <label>ESP32 IP Address</label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. 192.168.4.1"
            value={inputIp}
            onChange={(e) => setInputIp(e.target.value)}
            disabled={vehicle.connected}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_IPS.map(ip => (
            <button key={ip} onClick={() => { setInputIp(ip); }}
              disabled={vehicle.connected}
              style={{
                padding: '6px 10px', borderRadius: 8, fontSize: 11,
                fontFamily: 'var(--font-mono)', cursor: vehicle.connected ? 'default' : 'pointer',
                background: inputIp === ip ? 'rgba(6,214,160,0.1)' : 'rgba(255,255,255,0.03)',
                border: inputIp === ip ? '1px solid rgba(6,214,160,0.3)' : '1px solid var(--glass-border)',
                color: inputIp === ip ? 'var(--accent-cyan)' : 'var(--text-muted)',
                opacity: vehicle.connected ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {ip}
            </button>
          ))}
        </div>

        {vehicle.connected ? (
          <button className="btn btn-danger" onClick={vehicle.disconnect} style={{ width: '100%' }}>
            🔌 Disconnect
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleConnect}
            disabled={vehicle.connecting || !inputIp.trim()}
            style={{ width: '100%', opacity: (!inputIp.trim() || vehicle.connecting) ? 0.5 : 1 }}
          >
            {vehicle.connecting ? '⏳ Connecting...' : '🔗 Connect to ESP32'}
          </button>
        )}
      </div>

      {/* Proximity GPS Simulator */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🛰️</span>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Proximity GPS Simulator</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Simulate movement to test 100m Spaces radius</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
            <span>Simulated Distance:</span>
            <span style={{ color: 'var(--accent-green)' }}>{Math.round(simDistance)} meters</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="200" 
            value={simDistance}
            onChange={handleSimDistanceChange}
            style={{
              width: '100%',
              accentColor: 'var(--accent-green)',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.1)',
              height: 6,
              borderRadius: 3
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>0m (Connected)</span>
            <span>100m (Boundary)</span>
            <span>200m (Disconnected)</span>
          </div>
        </div>
        
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          {simDistance <= 100 ? (
            <span style={{ color: 'var(--accent-green)' }}>🟢 In Range: Both vehicles will see each other and have active voice communication.</span>
          ) : (
            <span style={{ color: 'var(--accent-amber)' }}>⚠️ Out of Range: Vehicles are separated by more than 100m. Voice Spaces disabled.</span>
          )}
        </div>
      </div>

      {/* Status indicator */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: vehicle.connected ? 'var(--accent-green)' : vehicle.connecting ? 'var(--accent-amber)' : 'var(--accent-red)',
            boxShadow: `0 0 8px ${vehicle.connected ? 'var(--accent-green)' : vehicle.connecting ? 'var(--accent-amber)' : 'var(--accent-red)'}`,
          }}></div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {vehicle.connected ? 'Connected' : vehicle.connecting ? 'Connecting...' : 'Disconnected'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Vehicle {vehicleNum} • Port 8080
            </div>
          </div>
        </div>
      </div>

      {/* Voice alerts toggle */}
      <div className="toggle-row" onClick={() => vehicle.setTtsEnabled(!vehicle.ttsEnabled)}>
        <div className="toggle-row-info">
          <span className="icon">🔊</span>
          <div>
            <h4>Voice Alerts</h4>
            <p>Speak status changes aloud (fall, tilt, movement)</p>
          </div>
        </div>
        <div className="toggle-switch">
          <input type="checkbox" checked={vehicle.ttsEnabled} readOnly />
          <span className="toggle-track"></span>
        </div>
      </div>

      {/* Logs toggle */}
      <div className="toggle-row" onClick={() => setShowLogs(!showLogs)}>
        <div className="toggle-row-info">
          <span className="icon">📋</span>
          <div>
            <h4>Connection Logs</h4>
            <p>{vehicle.logs.length} entries</p>
          </div>
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: showLogs ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>

      {showLogs && (
        <div className="card" style={{ padding: 12, maxHeight: 250, overflowY: 'auto' }}>
          {vehicle.logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>No logs yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {vehicle.logs.map(log => (
                <div key={log.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.msg}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{log.time}</div>
                  </div>
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase', flexShrink: 0, marginLeft: 8,
                    background: log.type === 'sent' ? 'rgba(76,201,240,0.1)' : log.type === 'received' ? 'rgba(6,214,160,0.1)' : 'rgba(255,255,255,0.05)',
                    color: log.type === 'sent' ? 'var(--accent-blue)' : log.type === 'received' ? 'var(--accent-green)' : 'var(--text-muted)',
                  }}>
                    {log.type}
                  </span>
                </div>
              ))}
            </div>
          )}
          {vehicle.logs.length > 0 && (
            <button className="btn btn-outline" onClick={() => vehicle.logs.length = 0}
              style={{ width: '100%', marginTop: 8, fontSize: 12, padding: 8 }}
            >
              🗑️ Clear Logs
            </button>
          )}
        </div>
      )}

      {/* Info */}
      <div className="card" style={{ padding: 14, borderStyle: 'dashed', borderColor: 'rgba(6,214,160,0.15)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>💡 Setup Guide:</strong><br />
          1. Connect your phone to the same WiFi as the ESP32<br />
          2. Enter the ESP32's IP address shown in Serial Monitor<br />
          3. Tap Connect — the app will poll <code style={{ color: 'var(--accent-cyan)' }}>/data</code> for status<br />
          4. Voice messages use 16kHz WAV over HTTP POST
        </div>
      </div>
    </div>
  );
}
