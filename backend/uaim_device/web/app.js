// UAIM Industrial Device Adapter - Interactive Web App Controller

let currentDeviceId = null;
let devicesCache = [];
let ws = null;
let totalScansCount = 0;
let rfidTagsMap = new Map(); // EPC -> row data
let activeCycleId = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initWebSocket();
  refreshDevices();
  setInterval(refreshDevicesHealth, 3000);
  initGlobalScannerListener();
});

// Switch Tabs
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.remove("active");
    const attr = b.getAttribute("onclick");
    if (attr && attr.includes(tabId)) {
      b.classList.add("active");
    }
  });
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  
  const content = document.getElementById(tabId);
  if (content) content.classList.add("active");
}

// WebSocket Connection & Event Dispatch
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/events`;
  
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    const ind = document.getElementById("ws-indicator");
    const txt = document.getElementById("ws-status-text");
    ind.classList.remove("disconnected");
    txt.textContent = "WS Stream: Connected";
  };

  ws.onclose = () => {
    const ind = document.getElementById("ws-indicator");
    const txt = document.getElementById("ws-status-text");
    ind.classList.add("disconnected");
    txt.textContent = "WS Stream: Reconnecting...";
    setTimeout(initWebSocket, 2000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "IDENTIFICATION_EVENT" && data.event) {
        handleIncomingEvent(data.event);
      }
    } catch (e) {
      console.error("WS Parse error", e);
    }
  };
}

// Handle Incoming Normalized Event
function handleIncomingEvent(evt) {
  totalScansCount++;
  document.getElementById("header-total-scans").textContent = totalScansCount;

  // Append to Live Feed
  appendFeedItem(evt);

  // Handle RFID Tag
  if (evt.identifier_type === "RFID_EPC" || evt.identifier_type === "RFID_TID") {
    handleRfidTagEvent(evt);
  }

  // Handle Barcode / QR Code / Material QR / Work Order QR
  if (
    evt.identifier_type === "BARCODE" ||
    evt.identifier_type === "QR_CODE" ||
    evt.identifier_type === "MATERIAL_QR" ||
    evt.identifier_type === "WORK_ORDER_QR" ||
    evt.identifier_type === "DATAMATRIX" ||
    evt.identifier_type === "UNKNOWN_SCAN"
  ) {
    handleBarcodeEvent(evt);
  }

  // Note: Local session's RFID, MC, and WO fields are maintained exclusively by
  // the local hardware wedge / scanner capture in this browser session.

  // Handle Read Cycle Lifecycle
  if (evt.event_type === "READ_CYCLE_STARTED") {
    activeCycleId = evt.read_cycle_id || evt.identifier;
    const pill = document.getElementById("gate-status-pill");
    pill.className = "state-tag RUNNING";
    pill.textContent = "GATE ACTIVE";
    document.getElementById("active-cycle-label").textContent = `Cycle: ${activeCycleId}`;
  } else if (evt.event_type === "READ_CYCLE_COMPLETED") {
    const pill = document.getElementById("gate-status-pill");
    pill.className = "state-tag CONNECTED";
    pill.textContent = "GATE CLOSED";
    const total = evt.metadata?.total_unique_tags || 0;
    const dur = Math.round(evt.metadata?.duration_ms || 0);
    document.getElementById("active-cycle-label").textContent = `Summary: ${total} tags in ${dur}ms`;
  }
}

// Update or Insert in RFID Table
function handleRfidTagEvent(evt) {
  const tbody = document.getElementById("rfid-table-body");
  const existing = rfidTagsMap.get(evt.identifier);

  if (existing) {
    existing.reads += 1;
    existing.rssi = evt.rssi ?? existing.rssi;
    existing.antenna = evt.antenna_id ?? existing.antenna;
    existing.timestamp = evt.timestamp;
    existing.cycle = evt.read_cycle_id ?? existing.cycle;
    updateRfidRow(existing);
  } else {
    const record = {
      epc: evt.identifier,
      antenna: evt.antenna_id ?? 1,
      rssi: evt.rssi ?? -50,
      reads: 1,
      station: evt.station_id || "STATION-01",
      cycle: evt.read_cycle_id || "-",
      timestamp: evt.timestamp,
    };
    rfidTagsMap.set(evt.identifier, record);
    insertRfidRow(record);
  }
}

function insertRfidRow(record) {
  const tbody = document.getElementById("rfid-table-body");
  if (rfidTagsMap.size === 1) {
    tbody.innerHTML = "";
  }

  const tr = document.createElement("tr");
  tr.id = `row-${record.epc}`;
  tr.innerHTML = renderRfidRowHtml(record);
  tbody.prepend(tr);
}

function updateRfidRow(record) {
  const tr = document.getElementById(`row-${record.epc}`);
  if (tr) {
    tr.innerHTML = renderRfidRowHtml(record);
    tr.style.backgroundColor = "rgba(59, 130, 246, 0.25)";
    setTimeout(() => { tr.style.backgroundColor = ""; }, 400);
  }
}

function renderRfidRowHtml(record) {
  const rssiVal = record.rssi !== null ? `${record.rssi} dBm` : "N/A";
  const pct = Math.min(100, Math.max(10, 100 + (record.rssi || -60)));
  const timeFormatted = new Date(record.timestamp).toLocaleTimeString();

  return `
    <td class="epc-cell">${record.epc}</td>
    <td><span style="background:rgba(59,130,246,0.15); color:#60a5fa; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Ant ${record.antenna}</span></td>
    <td>
      <div class="rssi-bar-container">
        <div class="rssi-bar"><div class="rssi-fill" style="width:${pct}%"></div></div>
        <span style="font-size:0.75rem;">${rssiVal}</span>
      </div>
    </td>
    <td><strong style="color:var(--accent-green)">${record.reads}</strong></td>
    <td><span style="color:var(--text-muted); font-size:0.75rem;">${record.station}</span></td>
    <td><span style="color:var(--accent-cyan); font-size:0.75rem;">${record.cycle}</span></td>
    <td style="color:var(--text-muted); font-size:0.75rem;">${timeFormatted}</td>
    <td>
      <div style="display:flex; gap:4px;">
        <button class="btn" style="font-size:0.7rem; padding:2px 6px;" title="Copy EPC" onclick="copyText('${record.epc}')">📋</button>
        <button class="btn btn-primary" style="font-size:0.7rem; padding:2px 8px;" title="Load into Tag Writer" onclick="loadTagIntoWriter('${record.epc}')">✍️ Encode</button>
      </div>
    </td>
  `;
}

// Display 2D QR / Barcode Card
function handleBarcodeEvent(evt) {
  const container = document.getElementById("barcode-cards-container");
  if (container.children.length === 1 && container.innerText.includes("No Barcode")) {
    container.innerHTML = "";
  }

  const card = document.createElement("div");
  card.className = "qr-preview-card";
  const timeFormatted = new Date(evt.timestamp).toLocaleTimeString();
  const symbology = evt.metadata?.symbology || evt.identifier_type;
  const entity = evt.entity_type || (evt.identifier_type === "MATERIAL_QR" ? "MATERIAL" : evt.identifier_type === "WORK_ORDER_QR" ? "WORK_ORDER" : "UNKNOWN");
  const isQr = evt.identifier_type.includes("QR");

  card.innerHTML = `
    <div class="qr-box" style="${entity === 'MATERIAL' ? 'border:2px solid #38bdf8;' : entity === 'WORK_ORDER' ? 'border:2px solid #a78bfa;' : ''}">
      ${isQr ? '📱 QR' : '📊 BAR'}
      <div style="font-size:0.6rem; color:var(--text-muted); margin-top:2px;">${entity}</div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="state-tag ${isQr ? 'RUNNING' : 'CONNECTED'}">${symbology} (${entity})</span>
        <span style="font-size:0.75rem; color:var(--text-muted);">${timeFormatted}</span>
      </div>
      <div class="${isQr ? 'qr-cell' : 'epc-cell'}" style="font-size:1rem; word-break:break-all; font-weight:700;">
        ${evt.identifier}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
        <span>Device: <strong>${evt.device_id}</strong> (${evt.vendor} ${evt.model})</span>
        <button class="btn" style="padding:2px 8px;" onclick="copyText('${evt.identifier}')">📋 Copy</button>
      </div>
    </div>
  `;

  container.prepend(card);
}

// Live Feed Ticker
function appendFeedItem(evt) {
  const box = document.getElementById("event-feed-box");
  const div = document.createElement("div");
  let typeClass = "RFID";
  if (evt.identifier_type === "BARCODE") typeClass = "BARCODE";
  if (evt.identifier_type.includes("QR")) typeClass = "QR_CODE";
  if (evt.event_type.includes("CYCLE")) typeClass = "CYCLE";
  if (evt.event_type === "UNKNOWN_SCAN") typeClass = "BARCODE";

  div.className = `feed-item ${typeClass}`;
  div.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center;">
      <span style="color:var(--text-muted)">[${new Date(evt.timestamp).toLocaleTimeString()}]</span>
      <span style="font-weight:700; color:#fff;">${evt.device_id}</span>
      <span style="color:var(--accent-cyan); font-weight:600;">${evt.identifier_type}</span>
      <span style="color:#e2e8f0; font-family:monospace;">${evt.identifier || '(EMPTY/INVALID)'}</span>
      ${evt.entity_type ? `<span style="font-size:0.7rem; padding:1px 6px; border-radius:4px; background:rgba(255,255,255,0.08);">${evt.entity_type}</span>` : ''}
    </div>
    <span style="color:var(--text-muted); font-size:0.7rem;">${evt.event_type}</span>
  `;

  box.prepend(div);
  if (box.children.length > 100) {
    box.removeChild(box.lastChild);
  }
}

// Fetch Device List & Health
async function refreshDevices() {
  try {
    const res = await fetch("/api/v1/devices");
    devicesCache = await res.json();
    window.devicesCache = devicesCache;
    renderDeviceList();
    populateSimulatorDevices();
  } catch (e) {
    console.error("Failed to load devices", e);
  }
}

async function refreshDevicesHealth() {
  for (const dev of devicesCache) {
    try {
      const res = await fetch(`/api/v1/devices/${dev.device_id}/health`);
      const health = await res.json();
      updateDeviceHealthBadge(dev.device_id, health);
    } catch (e) {}
  }
}

function renderDeviceList() {
  const list = document.getElementById("device-list");
  list.innerHTML = "";
  document.getElementById("device-count-badge").textContent = `${devicesCache.length} Devices`;
  populateWriterDevices();

  devicesCache.forEach((dev, idx) => {
    const card = document.createElement("div");
    card.className = `device-card ${currentDeviceId === dev.device_id ? 'selected' : ''}`;
    card.id = `dev-card-${dev.device_id}`;
    card.onclick = () => selectDevice(dev.device_id);

    const modeLabel = dev.device_type === "RFID_FIXED" 
      ? `Mode: ${dev.fixed_mode || 'AUTOSCAN'}`
      : `Input: ${dev.handheld_mode || 'KEYSTROKE'}`;

    card.innerHTML = `
      <div class="device-card-header">
        <div>
          <div class="dev-name">${dev.name}</div>
          <div class="dev-sub">${dev.vendor} ${dev.model} • ${dev.device_id}</div>
        </div>
        <span id="badge-state-${dev.device_id}" class="state-tag DISCONNECTED">LOADING</span>
      </div>
      
      <div class="device-stats">
        <div class="stat-item">
          <span class="stat-label">ENDPOINT</span>
          <span class="stat-val">${dev.host || 'local'}:${dev.port || '0'}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">MODE</span>
          <span class="stat-val" style="color:var(--accent-cyan); font-size:0.65rem;">${modeLabel}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">RECONNECTS</span>
          <span id="stat-rec-${dev.device_id}" class="stat-val">0</span>
        </div>
      </div>

      <div class="btn-group" onclick="event.stopPropagation()">
        <button class="btn btn-primary" onclick="deviceAction('${dev.device_id}', 'connect')">Connect</button>
        <button class="btn btn-success" onclick="deviceAction('${dev.device_id}', 'start')">Start</button>
        <button class="btn" onclick="deviceAction('${dev.device_id}', 'stop')">Stop</button>
        <button class="btn btn-danger" onclick="deviceAction('${dev.device_id}', 'disconnect')">Disconnect</button>
      </div>
    `;

    list.appendChild(card);
    if (idx === 0 && !currentDeviceId) {
      selectDevice(dev.device_id);
    }
  });

  refreshDevicesHealth();
}

function updateDeviceHealthBadge(devId, health) {
  const badge = document.getElementById(`badge-state-${devId}`);
  if (badge) {
    badge.className = `state-tag ${health.adapter_state}`;
    badge.textContent = health.adapter_state;
  }
  const lat = document.getElementById(`stat-lat-${devId}`);
  if (lat) {
    lat.textContent = health.latency_ms !== null ? `${health.latency_ms}ms` : "-";
  }
  const rec = document.getElementById(`stat-rec-${devId}`);
  if (rec) {
    rec.textContent = health.reconnect_count || "0";
  }
}

// Select Active Device for Configuration
function selectDevice(devId) {
  currentDeviceId = devId;
  document.querySelectorAll(".device-card").forEach(c => c.classList.remove("selected"));
  const selected = document.getElementById(`dev-card-${devId}`);
  if (selected) selected.classList.add("selected");

  const dev = devicesCache.find(d => d.device_id === devId);
  if (!dev) return;

  document.getElementById("active-device-name").textContent = `${dev.name} (${dev.device_id})`;
  document.getElementById("cfg-device-id").value = dev.device_id;
  const nameInput = document.getElementById("cfg-name");
  if (nameInput) nameInput.value = dev.name || "";
  document.getElementById("cfg-host").value = dev.host || "";
  document.getElementById("cfg-port").value = dev.port || "";
  document.getElementById("cfg-station").value = dev.station_id || "";
}

// Device Lifecycle Action
async function deviceAction(devId, action) {
  try {
    const res = await fetch(`/api/v1/devices/${devId}/${action}`, { method: "POST" });
    const data = await res.json();
    setTimeout(refreshDevicesHealth, 300);
  } catch (e) {
    alert(`Failed to ${action} device: ` + e.message);
  }
}

// Save Settings Form
async function saveDeviceConfig(e) {
  e.preventDefault();
  const devId = document.getElementById("cfg-device-id").value;
  if (!devId) return;

  const payload = {
    name: document.getElementById("cfg-name")?.value || null,
    host: document.getElementById("cfg-host").value || null,
    port: parseInt(document.getElementById("cfg-port").value) || null,
    station_id: document.getElementById("cfg-station").value || null,
  };

  try {
    const res = await fetch(`/api/v1/devices/${devId}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert("Device configuration updated successfully!");
      refreshDevices();
    }
  } catch (err) {
    alert("Error saving settings: " + err.message);
  }
}

// Send CoLa Command
async function sendColaCommand() {
  if (!currentDeviceId) return;
  const cmd = document.getElementById("cola-cmd-input").value.trim();
  if (!cmd) return;

  const out = document.getElementById("cola-cmd-output");
  out.textContent = "Executing...";

  try {
    const res = await fetch(`/api/v1/devices/${currentDeviceId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd })
    });
    const data = await res.json();
    out.textContent = JSON.stringify(data.result, null, 2);
  } catch (err) {
    out.textContent = "Error: " + err.message;
  }
}

// Keystroke Emulation Scanner Wedge Handler
function handleWedgeKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    submitWedgeScan();
  }
}

async function submitWedgeScan() {
  const input = document.getElementById("wedge-input");
  const rawVal = input.value;
  if (!rawVal) return;

  const targetDev = currentDeviceId || (devicesCache.find(d => d.device_type !== "RFID_FIXED")?.device_id) || "HH-001";

  // If window.RS38_WEDGE is active, process with full framing & classification
  if (window.RS38_WEDGE && typeof window.RS38_WEDGE.injectScan === "function") {
    window.RS38_WEDGE.injectScan(rawVal);
    input.value = "";
    input.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
    setTimeout(() => { input.style.backgroundColor = ""; }, 250);
    return;
  }

  try {
    await fetch(`/api/v1/devices/${targetDev}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_scan: rawVal,
        input_method: "KEYBOARD_WEDGE"
      })
    });
    input.value = "";
    input.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
    setTimeout(() => { input.style.backgroundColor = ""; }, 250);
  } catch (err) {
    console.error("Wedge scan error", err);
  }
}

function initGlobalScannerListener() {
  // RS38_WEDGE handles permanent hidden focus and burst keystroke capture globally
  if (window.RS38_WEDGE && typeof window.RS38_WEDGE.ensureScannerFocus === "function") {
    window.RS38_WEDGE.ensureScannerFocus();
  }
}

// Gate Controls
async function startGateReadCycle() {
  if (!currentDeviceId) return;
  const cycleId = `PALLET-RC-${Date.now().toString().slice(-6)}`;
  await fetch(`/api/v1/devices/${currentDeviceId}/read-cycle/start?cycle_id=${cycleId}`, { method: "POST" });
}

async function stopGateReadCycle() {
  if (!currentDeviceId) return;
  await fetch(`/api/v1/devices/${currentDeviceId}/read-cycle/complete`, { method: "POST" });
}

function clearRfidTable() {
  rfidTagsMap.clear();
  document.getElementById("rfid-table-body").innerHTML = `
    <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Waiting for RFID tag observations...</td></tr>
  `;
}

function clearBarcodeCards() {
  document.getElementById("barcode-cards-container").innerHTML = `
    <div style="text-align:center; color:var(--text-muted); padding:3rem;">No Barcode or QR code scanned yet. Pull the scanner trigger or use the wedge bar above.</div>
  `;
}

function clearFeed() {
  document.getElementById("event-feed-box").innerHTML = "";
}

function copyText(txt) {
  navigator.clipboard.writeText(txt).then(() => {
    alert("Copied to clipboard: " + txt);
  });
}

// ==========================================
// SICK RFU630 TAG WRITER / ENCODER FUNCTIONS
// ==========================================

function populateWriterDevices() {
  const sel = document.getElementById("writer-device-id");
  if (!sel) return;
  
  const currentVal = sel.value;
  sel.innerHTML = "";
  const rfidDevs = devicesCache.filter(d => d.device_type === "RFID_FIXED");
  if (rfidDevs.length === 0) {
    sel.innerHTML = '<option value="RFID-001">Pallet Gate SICK RFU630 (RFID-001)</option>';
    return;
  }
  rfidDevs.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.device_id;
    opt.textContent = `${d.name} (${d.device_id})`;
    if (d.device_id === currentVal || d.device_id === currentDeviceId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function validateWriterEpcInput() {
  const input = document.getElementById("writer-epc-input");
  if (!input) return;

  // Clean hex: uppercase alphanumeric only
  let clean = input.value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  input.value = clean;

  const chars = clean.length;
  const words = Math.ceil(chars / 4);
  const bits = words * 16;
  const badge = document.getElementById("writer-epc-len-badge");
  if (badge) {
    badge.textContent = `${chars} chars (${words} words / ${bits} bits)`;
    if (chars === 24) {
      badge.style.color = "#34d399";
    } else if (chars % 4 === 0 && chars > 0) {
      badge.style.color = "#38bdf8";
    } else {
      badge.style.color = "#f59e0b";
    }
  }
}

function toggleWriterAddressingMode() {
  const addressedRadio = document.getElementById("writer-mode-addressed");
  const isAddressed = addressedRadio ? addressedRadio.checked : false;
  const targetContainer = document.getElementById("writer-target-epc-container");
  if (targetContainer) {
    targetContainer.style.display = isAddressed ? "block" : "none";
  }
}

function generateRandomEpc() {
  const prefix = "E2801190"; // Standard Gen2 Wakefit prefix
  const chars = "0123456789ABCDEF";
  let randomPart = "";
  for (let i = 0; i < 16; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const fullEpc = prefix + randomPart;
  const input = document.getElementById("writer-epc-input");
  if (input) {
    input.value = fullEpc;
    validateWriterEpcInput();
  }
}

function setSampleEpc() {
  const input = document.getElementById("writer-epc-input");
  if (input) {
    input.value = "E280116060000204968C090F";
    validateWriterEpcInput();
  }
}

function loadTagIntoWriter(epc) {
  // Switch to Writer tab cleanly
  switchTab('tab-writer');

  // Select Addressed Mode
  const addressedRadio = document.getElementById("writer-mode-addressed");
  if (addressedRadio) {
    addressedRadio.checked = true;
    toggleWriterAddressingMode();
  }

  // Set Target EPC
  const targetInput = document.getElementById("writer-target-epc-input");
  if (targetInput) {
    targetInput.value = epc;
  }

  const epcInput = document.getElementById("writer-epc-input");
  if (epcInput) {
    epcInput.value = "";
    epcInput.placeholder = "Enter new EPC to replace " + epc;
    validateWriterEpcInput();
    epcInput.focus();
  }
}

async function executeWriteTag(event) {
  if (event) {
    if (typeof event.preventDefault === "function") event.preventDefault();
    if (typeof event.stopPropagation === "function") event.stopPropagation();
  }

  const deviceSelect = document.getElementById("writer-device-id");
  const deviceId = (deviceSelect && deviceSelect.value) ? deviceSelect.value : (currentDeviceId || "RFID-001");
  const epcInput = document.getElementById("writer-epc-input");
  const epc = epcInput ? epcInput.value.trim() : "";
  const addressedRadio = document.getElementById("writer-mode-addressed");
  const isAddressed = addressedRadio ? addressedRadio.checked : false;
  const targetEpcInput = document.getElementById("writer-target-epc-input");
  const targetEpc = (isAddressed && targetEpcInput) ? targetEpcInput.value.trim() : null;
  const bankSelect = document.getElementById("writer-bank");
  const memoryBank = bankSelect ? parseInt(bankSelect.value, 10) : 1;
  const offsetInput = document.getElementById("writer-offset");
  const wordOffset = offsetInput ? parseInt(offsetInput.value, 10) : 2;
  const retriesInput = document.getElementById("writer-retries");
  const retries = retriesInput ? parseInt(retriesInput.value, 10) : 32;
  const antennaSelect = document.getElementById("writer-antenna-id");
  const antennaId = antennaSelect ? parseInt(antennaSelect.value, 10) : 1;

  if (!epc) {
    alert("Please enter a valid EPC hex string to write.");
    return false;
  }

  const spinner = document.getElementById("writer-status-spinner");
  const submitBtn = document.getElementById("writer-submit-btn");
  const resultBox = document.getElementById("writer-result-box");
  const resultBadge = document.getElementById("writer-result-badge");
  const resultMsg = document.getElementById("writer-result-message");
  const resultCmd = document.getElementById("writer-result-cmd");
  const resultRaw = document.getElementById("writer-result-raw");
  const resultLatency = document.getElementById("writer-result-latency");

  if (spinner) spinner.style.display = "inline";
  if (submitBtn) submitBtn.disabled = true;

  try {
    const payload = {
      epc: epc,
      target_epc: targetEpc || null,
      memory_bank: memoryBank,
      word_offset: wordOffset,
      retries: retries,
      antenna_id: antennaId
    };

    const res = await fetch(`/api/v1/devices/${deviceId}/tag/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (resultBox) resultBox.style.display = "flex";
    if (resultCmd) resultCmd.textContent = data.command_sent || "N/A";
    if (resultRaw) resultRaw.textContent = data.raw_response || JSON.stringify(data);
    if (resultLatency) resultLatency.textContent = `${data.latency_ms || 0} ms`;

    if (res.ok && data.success) {
      if (resultBadge) {
        resultBadge.className = "state-tag RUNNING";
        resultBadge.textContent = "SUCCESS (TAG WRITTEN)";
      }
      if (resultMsg) {
        resultMsg.style.color = "#34d399";
        resultMsg.textContent = `✅ Successfully wrote EPC [${data.epc}] to tag! ${data.status_message}`;
      }
    } else {
      if (resultBadge) {
        resultBadge.className = "state-tag ERROR";
        resultBadge.textContent = "WRITE FAILED";
      }
      if (resultMsg) {
        resultMsg.style.color = "#f87171";
        resultMsg.textContent = `❌ Write Failed: ${data.detail || data.status_message || "Transponder rejected write or not in field"}`;
      }
    }

  } catch (err) {
    if (resultBox) resultBox.style.display = "flex";
    if (resultBadge) {
      resultBadge.className = "state-tag ERROR";
      resultBadge.textContent = "COMMUNICATION ERROR";
    }
    if (resultMsg) {
      resultMsg.style.color = "#f87171";
      resultMsg.textContent = `❌ Network/Request Error: ${err.message}`;
    }
  } finally {
    if (spinner) spinner.style.display = "none";
    if (submitBtn) submitBtn.disabled = false;
  }
  return false;
}


