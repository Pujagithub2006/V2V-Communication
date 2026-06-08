import mqtt from 'mqtt';

class MQTTService {
  constructor() {
    this.client = null;
    this.onMessageCallback = null;
  }

  connect(vehicleId, onMessage) {
    this.onMessageCallback = onMessage;
    if (this.client) {
      console.log('MQTT: Already connected or connecting...');
      return;
    }
    // Connect to public HiveMQ MQTT broker over insecure WebSockets (reliable for local testing)
    const brokerUrl = 'ws://broker.hivemq.com:8000/mqtt';
    const clientId = `v2v_web_${vehicleId}_${Math.random().toString(16).substr(2, 6)}`;
    
    console.log(`MQTT: Connecting with Client ID: ${clientId}`);

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 2000,
      });

      this.client.on('connect', () => {
        console.log('✅ MQTT: Connected to HiveMQ Broker');
        this.client.subscribe('v2v/discovery', (err) => {
          if (err) console.error('MQTT: Subscribe discovery failed', err);
        });
        this.client.subscribe('v2v/alerts', (err) => {
          if (err) console.error('MQTT: Subscribe alerts failed', err);
        });
      });

      this.client.on('message', (topic, payload) => {
        if (this.onMessageCallback) {
          try {
            this.onMessageCallback(topic, payload.toString());
          } catch (e) {
            console.error('MQTT: Callback error:', e);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('❌ MQTT Error:', err);
      });

      this.client.on('close', () => {
        console.log('🔌 MQTT connection closed');
      });
    } catch (e) {
      console.error('MQTT connection init failed:', e);
    }
  }

  publish(topic, message) {
    if (this.client && this.client.connected) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      this.client.publish(topic, payload, { qos: 0 });
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}

export const mqttService = new MQTTService();
