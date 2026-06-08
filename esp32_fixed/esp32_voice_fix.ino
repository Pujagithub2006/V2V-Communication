#include <WiFi.h>
#include <Wire.h>
#include <HTTPClient.h>

#include <I2Cdev.h>
#include <MPU6050.h>

#include <math.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <SPIFFS.h>

MPU6050 mpu;

const char* ssid = "Pujacha Mobile";
const char* password = "ERROR 418";

// IP of Vehicle 2
String otherESP = "http://10.78.143.178:8080/fall";

#define LED_PIN 19
#define BUZZER_PIN 18

AsyncWebServer server(8080);

float baseline = 0;
String lastAudio = "/latestAudio.mp3";
String dataMessage = "Waiting for sensor data...";
String interAlert = "";

// Voice notification flag
bool newVoiceAvailable = false;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(21, 22);
  mpu.initialize();

  if (mpu.testConnection())
    Serial.println("✅ MPU6050 connected!");
  else
    Serial.println("❌ MPU6050 not detected!");

  Serial.printf("Connecting to %s", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n✅ WiFi connected!");
  Serial.print("🌐 IP: "); Serial.println(WiFi.localIP());

  if (!SPIFFS.begin(true)) { Serial.println("❌ SPIFFS Mount Failed"); return; }

  long sum = 0;
  for (int i = 0; i < 100; i++) {
    int16_t ax, ay, az; mpu.getAcceleration(&ax,&ay,&az);
    sum += sqrt(ax*ax+ay*ay+az*az); delay(10);
  }
  baseline = sum/100.0;
  Serial.print("📏 Baseline: "); Serial.println(baseline);

  // --- Endpoints ---

  // Upload audio - FIXED: Handle binary WAV data properly
  server.on("/uploadAudio", HTTP_POST, [](AsyncWebServerRequest *request){
    // Save the RAW audio data from request body as binary
    if(request->hasParam("plain", true)) {
      String audioData = request->getParam("plain", true)->value();
      File file = SPIFFS.open("/audio.raw", "w");
      // Write as binary data
      file.write((const uint8_t*)audioData.c_str(), audioData.length());
      file.close();
      lastAudio = "/audio.raw";
      Serial.println("✅ Audio saved successfully (" + String(audioData.length()) + " bytes)");
      request->send(200, "text/plain", "Upload complete");
    } else {
      request->send(400, "text/plain", "No audio data received");
    }
  });

  server.on("/latestAudio.mp3", HTTP_GET, [](AsyncWebServerRequest *r){
    if(SPIFFS.exists("/audio.raw")) {
      r->send(SPIFFS, "/audio.raw", "audio/wav");
    } else {
      r->send(404, "text/plain", "No audio file");
    }
  });

  server.on("/debugAudio", HTTP_GET, [](AsyncWebServerRequest *r){
    File file = SPIFFS.open(lastAudio, "r");
    if(file) {
      String response = "Audio exists. Size: " + String(file.size()) + " bytes";
      file.close();
      r->send(200, "text/plain", response);
    } else {
      r->send(200, "text/plain", "No audio file");
    }
  });

  // Play received voice - FIXED: Serve as WAV
  server.on("/playVoice", HTTP_GET, [](AsyncWebServerRequest *request){
    File file = SPIFFS.open("/receivedVoice.raw", "r");
    if(file && file.size() > 10) {  // If file has reasonable size
      request->send(SPIFFS, "/receivedVoice.raw", "audio/wav");
      Serial.println("🔊 Playing received voice (" + String(file.size()) + " bytes)");
    } else {
      request->send(200, "text/plain", "No audio yet");
    }
    file.close();
  });

  // /data → MIT App
  server.on("/data", HTTP_GET, [](AsyncWebServerRequest *r){
    r->send(200,"text/plain",dataMessage);
  });

  // /fall → from Vehicle 1
  server.on("/fall", HTTP_GET, [](AsyncWebServerRequest *r){
    interAlert = "🚨 Vehicle 1 has fallen!";
    Serial.println(interAlert);
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(600);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    r->send(200,"text/plain","Alert received!");
  });

  // Voice message relay endpoint - FIXED: Handle binary WAV data
  server.on("/voiceMessage", HTTP_POST, [](AsyncWebServerRequest *request){
    // SAVE BINARY AUDIO DATA
    if(request->hasParam("plain", true)) {
      String audioData = request->getParam("plain", true)->value();
      
      // SAVE TO FILE AS BINARY
      File file = SPIFFS.open("/receivedVoice.raw", "w");
      file.write((const uint8_t*)audioData.c_str(), audioData.length());
      file.close();
      
      // Set flag for new voice notification
      newVoiceAvailable = true;
      
      Serial.println("✅ Voice saved: " + String(audioData.length()) + " bytes");
      request->send(200, "text/plain", "Voice received");
    } else {
      request->send(400, "text/plain", "No audio data received");
    }
  });

  // Alternative endpoint for React app fallback
  server.on("/playVoice", HTTP_POST, [](AsyncWebServerRequest *request){
    if(request->hasParam("plain", true)) {
      String audioData = request->getParam("plain", true)->value();
      
      File file = SPIFFS.open("/receivedVoice.raw", "w");
      file.write((const uint8_t*)audioData.c_str(), audioData.length());
      file.close();
      
      newVoiceAvailable = true;
      
      Serial.println("✅ Voice saved via /playVoice POST: " + String(audioData.length()) + " bytes");
      request->send(200, "text/plain", "Voice received");
    } else {
      request->send(400, "text/plain", "No audio data received");
    }
  });

  // Check if new voice arrived - FIXED: Proper flag handling
  server.on("/checkNewVoice", HTTP_GET, [](AsyncWebServerRequest *request){
    if(newVoiceAvailable) {
      request->send(200, "text/plain", "yes");
      newVoiceAvailable = false;  // Reset flag after checking
      Serial.println("📢 New voice notification sent");
    } else {
      request->send(200, "text/plain", "no");
    }
  });

  // Download received voice as raw audio - NEW: For React app
  server.on("/receivedVoice.raw", HTTP_GET, [](AsyncWebServerRequest *request){
    File file = SPIFFS.open("/receivedVoice.raw", "r");
    if(file && file.size() > 10) {
      request->send(SPIFFS, "/receivedVoice.raw", "audio/wav");
      Serial.println("📥 Sending received voice file (" + String(file.size()) + " bytes)");
    } else {
      request->send(404, "text/plain", "No voice file available");
    }
    file.close();
  });

  // Enable CORS headers globally so the React browser app can read status and upload voice
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  // Handle CORS Preflight OPTIONS requests
  server.onNotFound([](AsyncWebServerRequest *request) {
    if (request->method() == HTTP_OPTIONS) {
      request->send(200);
    } else {
      request->send(404, "text/plain", "Not Found");
    }
  });

  server.begin();
  Serial.println("🚀 Server started on port 8080");
  Serial.println("🎤 Voice endpoints ready:");
  Serial.println("   POST /voiceMessage - Receive WAV voice");
  Serial.println("   POST /playVoice - Alternative voice endpoint");
  Serial.println("   GET /checkNewVoice - Check for new voice");
  Serial.println("   GET /receivedVoice.raw - Download voice file");
}

void loop() {
  int16_t ax, ay, az; mpu.getAcceleration(&ax,&ay,&az);
  float mag = sqrt(ax*ax+ay*ay+az*az);
  float diff = abs(mag - baseline);

  if (diff > 6000) {
    dataMessage = "🔴 Vehicle 2 FALL DETECTED!";
    Serial.println(dataMessage);
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(500);
    digitalWrite(BUZZER_PIN, LOW);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(otherESP);
      int code = http.GET();
      if (code>0) Serial.println("📡 Alert sent to Vehicle 1!");
      http.end();
    }
  }
  else if (diff > 3000) {
    dataMessage = "🟠 Vehicle 2 TILT detected!";
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
  }
  else if (diff > 1500) {
    dataMessage = "🟡 Sudden movement detected!";
  }
  else {
    dataMessage = "✅ Vehicle 2 stable.";
    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
  }

  delay(500);
}
