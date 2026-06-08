import React from 'react';

const StatusIcon = ({ state }) => {
  const icons = {
    stable: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#06d6a0" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    tilt: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fca311" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    movement: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#4cc9f0" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    fall: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef233c" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    offline: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#4a5568" strokeWidth="2">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    ),
  };
  return icons[state] || icons.offline;
};

export default function Dashboard({ vehicle, peerVehicle }) {
  const { parsedStatus, connected, ip, ttsEnabled } = vehicle;
  const peerSt = peerVehicle?.parsedStatus || vehicle.peerStatus || { state: 'offline', label: 'Not Connected', emoji: '⚫' };
  const peerConnected = peerVehicle?.connected || false;
  const peerIp = peerVehicle?.ip || '';

  const vehicleNum = vehicle.vehicleId || 1;
  const peerNum = vehicleNum === 1 ? 2 : 1;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero status */}
      <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {parsedStatus.state === 'fall' ? '🚨' : parsedStatus.state === 'tilt' ? '⚠️' : parsedStatus.state === 'movement' ? '📡' : connected ? '🛡️' : '📡'}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
          Vehicle {vehicleNum}
        </h2>
        <div className={`status-pill ${parsedStatus.state}`} style={{ display: 'inline-flex', margin: '8px auto' }}>
          <span className="status-dot-sm"></span>
          {parsedStatus.label}
        </div>
        {ttsEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 12 }}>🔊</span>
            <span style={{ fontSize: 10, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>VOICE ALERTS ON</span>
          </div>
        )}
        {connected && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
            {ip}:8080
          </p>
        )}
        {!connected && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Go to Settings to connect your ESP32
          </p>
        )}
      </div>

      {/* Vehicle grid */}
      <span className="section-title">Vehicle Status</span>
      <div className="vehicle-grid">
        {/* My vehicle */}
        <div className={`vehicle-card ${parsedStatus.state === 'fall' ? 'alert' : ''}`}>
          <div className="vehicle-icon v1">🚗</div>
          <div className="vehicle-info">
            <div className="vehicle-name">Vehicle {vehicleNum} (Mine)</div>
            <div className="vehicle-detail">
              {connected ? `Connected • ${ip}` : 'Not connected'}
            </div>
          </div>
          <div className={`status-pill ${parsedStatus.state}`} style={{ fontSize: 10, padding: '4px 8px' }}>
            <span className="status-dot-sm"></span>
            {parsedStatus.label}
          </div>
        </div>

        {/* Peer vehicle */}
        <div className={`vehicle-card ${peerSt.state === 'fall' ? 'alert' : ''}`}>
          <div className="vehicle-icon v2">🚙</div>
          <div className="vehicle-info">
            <div className="vehicle-name">Vehicle {peerNum} (Peer)</div>
            <div className="vehicle-detail">
              {peerConnected ? `Connected • ${peerIp}` : 'Monitoring via V2V link'}
            </div>
          </div>
          <div className={`status-pill ${peerSt.state}`} style={{ fontSize: 10, padding: '4px 8px' }}>
            <span className="status-dot-sm"></span>
            {peerSt.label}
          </div>
        </div>
      </div>

      {/* Fall alert banners */}
      {parsedStatus.state === 'fall' && (
        <div className="card" style={{ borderColor: 'rgba(239,35,60,0.3)', background: 'rgba(239,35,60,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-red)' }}>FALL ALERT ACTIVE</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                Vehicle {vehicleNum} has detected a fall. Alert sent to Vehicle {peerNum}.
              </div>
            </div>
          </div>
        </div>
      )}

      {peerSt.state === 'fall' && (
        <div className="card" style={{ borderColor: 'rgba(247,37,133,0.3)', background: 'rgba(247,37,133,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📢</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-pink)' }}>PEER FALL ALERT</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                Vehicle {peerNum} has fallen! Check on the driver immediately.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sensor info */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="section-title" style={{ padding: 0 }}>Sensor Thresholds</span>
          <StatusIcon state={parsedStatus.state} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Stable', range: '< 300', color: '#06d6a0' },
            { label: 'Movement', range: '300 – 800', color: '#4cc9f0' },
            { label: 'Tilt', range: '800 – 1500', color: '#fca311' },
            { label: 'Fall', range: '> 1500', color: '#ef233c' },
          ].map(t => (
            <div key={t.label} style={{
              padding: '10px 12px', borderRadius: 8,
              background: `${t.color}08`, border: `1px solid ${t.color}20`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, boxShadow: `0 0 6px ${t.color}` }}></div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.color }}>{t.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.range}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
