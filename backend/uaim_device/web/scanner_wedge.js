// CipherLab RS38 & Hardware Scanner Wedge Engine
// High-Precision Scanner Capture & Direct Actual Value Display

(function () {
  'use strict';

  // ASCII Control Characters
  const ETX = '\x03'; // 0x03 -> RFID Start Prefix
  const STX = '\x02'; // 0x02 -> QR Start Prefix
  const RS = '\x1E';  // 0x1E -> Alt RFID Prefix
  const GS = '\x1D';  // 0x1D -> Alt QR Prefix

  // Intentional manual form input IDs that should not be stolen while user is explicitly typing
  const MANUAL_FORM_INPUTS = new Set([
    'cfg-name',
    'cfg-host',
    'cfg-port',
    'cfg-station',
    'writer-epc-input',
    'writer-target-epc-input',
    'writer-offset',
    'writer-retries',
    'cola-cmd-input'
  ]);

  let scanCounts = { rfid: 0, mc: 0, wo: 0, total: 0 };
  let burstTimer = null;
  let lastKeyTimestamp = 0;
  const BURST_TIMEOUT_MS = 100; // 100ms silence timer allows complete hardware scanner bursts

  function getHiddenInput() {
    return document.getElementById('cipher-permanent-hidden-input');
  }

  // Ensure Hidden Scanner Capture Input is Permanently Focused
  function ensureScannerFocus() {
    const active = document.activeElement;
    
    // If the operator is deliberately focused on an editable manual form input, don't hijack
    if (active && active.tagName === 'INPUT' && MANUAL_FORM_INPUTS.has(active.id)) {
      return;
    }
    
    // If the operator is inside a select or textarea
    if (active && (active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
      return;
    }

    const hiddenInput = getHiddenInput();
    if (hiddenInput && active !== hiddenInput) {
      try {
        hiddenInput.focus({ preventScroll: true });
        updateFocusIndicator(true);
      } catch (e) {
        // Ignore focus errors
      }
    }
  }

  function updateFocusIndicator(isFocused) {
    const badge = document.getElementById('rs38-focus-status');
    if (!badge) return;
    if (isFocused) {
      badge.textContent = '🔒 Permanent Scanner Focus: ACTIVE';
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#34d399';
      badge.style.borderColor = 'rgba(52, 211, 153, 0.3)';
    } else {
      badge.textContent = '🔓 Scanner Focus: STANDBY (Click to lock)';
      badge.style.background = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = '#f87171';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
  }

  // Strip scanner transmission artifacts (AIM IDs, Code IDs, control bytes, metadata headers)
  // while preserving the exact actual unadulterated barcode data
  function sanitizeScanPayload(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let val = String(raw);

    // 1. Remove non-printable ASCII control characters (ASCII 0x00 to 0x1F and 0x7F to 0x9F)
    val = val.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // 2. Strip bracketed/literal control tags emitted as text by certain keyboard wedges
    // (e.g. [STX], <STX>, (STX), [ETX], <ETX>, [GS], <GS>, [RS], <RS>, [SOH], [EOT], [CR], [LF], [TAB])
    val = val.replace(/^(\[|\<|\()(STX|ETX|GS|RS|SOH|EOT|ACK|CR|LF|TAB|ENTER)(\]|\>|\))/gi, '');
    val = val.replace(/(\[|\<|\()(STX|ETX|GS|RS|SOH|EOT|ACK|CR|LF|TAB|ENTER)(\]|\>|\))$/gi, '');

    // 3. Strip AIM Symbology Identifiers (ISO 15424 is always ']' + 1 char symbology + 1 char modifier: e.g. ]Q3, ]Q1, ]d2, ]C1)
    // Also handle optional ESC (0x1b) or tilde (~) prefix: e.g. \x1b]Q3 or ~]Q3 or ]Q3
    val = val.replace(/^[\x1b~]?\][A-Za-z][0-9A-Za-z]/, '');

    // 4. Strip single-letter Code IDs from CipherLab RS38 / Zebra / Honeywell (e.g. q100889922110, Q100889922110)
    val = val.replace(/^[qQ](?=(100|200|400|10|20|40|\d{6,}))/, '');

    // 5. Strip GS1 Application Identifier wrappers (e.g. (01), (10), (21), (240), (100))
    val = val.replace(/^\((01|10|21|240|100|00|90|91|92)\)/, '');

    // 6. Strip explicit label/metadata headers if prepended (e.g. MC:100889922110, MAT:100889922110, QR:100..., WO:200...)
    val = val.replace(/^(MC|MAT|MATERIAL|WO|ORD|ORDER|SO|PO|WF|W\/O|QR|BARCODE|RFID|EPC|TID)[:\-_ \t]+/i, '');

    // 7. Strip leading 'MC' or 'WO' if directly attached before numeric codes (e.g. MC100889922110 -> 100889922110, WO200776655443 -> 200776655443)
    val = val.replace(/^(MC)(?=(100|10|\d{6,}))/i, '');
    val = val.replace(/^(WO)(?=(200|400|20|40|\d{6,}))/i, '');

    // 8. Strip surrounding quotes and whitespace
    val = val.replace(/^["'`]|["'`]$/g, '').trim();

    return val;
  }

  // Authoritative Client-Side Classification
  function classifyScan(raw) {
    if (!raw || typeof raw !== 'string') {
      return { type: 'EMPTY', valid: false, clean: '' };
    }

    const rawStr = String(raw);
    const hasRfidPrefix = rawStr.startsWith(ETX) || rawStr.startsWith(RS) || /^(RFID|EPC):/i.test(rawStr) || /\[(ETX|RS)\]/i.test(rawStr);
    const hasQrPrefix = rawStr.startsWith(STX) || rawStr.startsWith(GS) || /^(MC|MAT|MATERIAL|WO|ORD|SO|PO|WF|W\/O|QR|BARCODE):/i.test(rawStr) || /\[(STX|GS)\]/i.test(rawStr);

    // Get the exact, actual sanitized scanned string
    const clean = sanitizeScanPayload(rawStr);

    if (!clean) {
      return { type: 'EMPTY', valid: false, clean: '' };
    }

    const cleanUpper = clean.toUpperCase();

    // 1. RFID EPC: 24 Hexadecimal characters (or has RFID control prefix)
    const hexPattern = /^[0-9A-Fa-f]{16,64}$/;
    if (
      (clean.length === 24 && /^[0-9A-Fa-f]{24}$/.test(clean)) ||
      hasRfidPrefix ||
      cleanUpper.startsWith('E2') ||
      cleanUpper.startsWith('30') ||
      (hexPattern.test(clean) && !clean.startsWith('1') && !clean.startsWith('2') && !clean.startsWith('4') && clean.length >= 16)
    ) {
      if (hexPattern.test(clean) || hasRfidPrefix) {
        return { type: 'RFID', valid: true, clean: clean.toUpperCase(), source: 'RFID', entity: 'MATERIAL' };
      }
    }

    // 2. MATERIAL CODE (MC): 10 Characters (Starts with 100, 10, or 1)
    if (
      clean.startsWith('100') ||
      clean.startsWith('10') ||
      cleanUpper.startsWith('MC') ||
      cleanUpper.startsWith('MAT') ||
      cleanUpper.startsWith('MATERIAL') ||
      /^(MC|MAT|MATERIAL)[:\-_ ]/i.test(rawStr) ||
      (hasQrPrefix && clean.startsWith('1')) ||
      (clean.startsWith('1') && clean.length === 10)
    ) {
      return { type: 'MC', valid: true, clean: clean, source: 'QR', entity: 'MATERIAL' };
    }

    // 3. WORK ORDER (WO): 10 Characters (Starts with 200, 400, 20, 40, 300, 500, etc.)
    if (
      clean.startsWith('200') ||
      clean.startsWith('400') ||
      clean.startsWith('20') ||
      clean.startsWith('40') ||
      clean.startsWith('300') ||
      clean.startsWith('500') ||
      cleanUpper.startsWith('WO') ||
      cleanUpper.startsWith('ORD') ||
      cleanUpper.startsWith('SO') ||
      cleanUpper.startsWith('PO') ||
      cleanUpper.startsWith('WF') ||
      cleanUpper.startsWith('W/O') ||
      /^(WO|ORD|SO|PO|WF|W\/O)[:\-_ ]/i.test(rawStr) ||
      (hasQrPrefix && (clean.startsWith('2') || clean.startsWith('4') || clean.startsWith('3') || clean.startsWith('5') || clean.startsWith('6') || clean.startsWith('7') || clean.startsWith('8') || clean.startsWith('9'))) ||
      (/^[2-9]/.test(clean) && clean.length === 10)
    ) {
      return { type: 'WO', valid: true, clean: clean, source: 'QR', entity: 'WORK_ORDER' };
    }

    // 4. Fallback for valid long codes (>= 8 characters):
    if (clean.length >= 8) {
      if (clean.startsWith('1')) {
        return { type: 'MC', valid: true, clean: clean, source: 'QR', entity: 'MATERIAL' };
      } else {
        return { type: 'WO', valid: true, clean: clean, source: 'QR', entity: 'WORK_ORDER' };
      }
    }

    // 5. Incomplete Fragments (< 8 characters without explicit control framing) -> Reject to prevent pollution
    return { type: 'FRAGMENT', valid: false, clean: clean, source: 'UNKNOWN', entity: 'UNKNOWN' };
  }

  // Route Classified Scan directly into RFID, MC, or WO field
  function routeScanToField(classification, raw) {
    updateByteInspector(raw || classification.clean);

    const alertBanner = document.getElementById('cipher-unauthorized-alert');
    const modeBadge = document.getElementById('rs38-mode-badge');
    const modeTitle = document.getElementById('rs38-mode-title');
    const modeIcon = document.getElementById('rs38-mode-icon');

    if (!classification.valid) {
      if (alertBanner) alertBanner.style.display = 'flex';
      if (modeBadge) { modeBadge.className = 'state-tag ERROR'; modeBadge.textContent = 'REJECTED'; }
      if (modeTitle) modeTitle.textContent = `REJECTED SCAN: ${classification.clean}`;
      if (modeIcon) modeIcon.textContent = '❌';
      return;
    }

    if (alertBanner) alertBanner.style.display = 'none';

    if (classification.type === 'RFID') {
      scanCounts.rfid++;
      const field = document.getElementById('cipher-rfid-input');
      const countEl = document.getElementById('count-rfid');
      const card = document.getElementById('card-rfid');

      if (field) {
        field.value = classification.clean;
      }
      if (countEl) countEl.textContent = `${scanCounts.rfid} scans`;

      animateCard(card, 'rgba(52, 211, 153, 0.5)');

      if (modeBadge) {
        modeBadge.className = 'state-tag CONNECTED';
        modeBadge.textContent = 'RFID EPC';
      }
      if (modeTitle) modeTitle.textContent = `RFID EPC: ${classification.clean}`;
      if (modeIcon) modeIcon.textContent = '🏷️';
    } else if (classification.type === 'MC') {
      scanCounts.mc++;
      const field = document.getElementById('cipher-mc-input');
      const countEl = document.getElementById('count-mc');
      const card = document.getElementById('card-mc');

      if (field) {
        field.value = classification.clean;
      }
      if (countEl) countEl.textContent = `${scanCounts.mc} scans`;

      animateCard(card, 'rgba(56, 189, 248, 0.5)');

      if (modeBadge) {
        modeBadge.className = 'state-tag RUNNING';
        modeBadge.textContent = 'MC VALID';
      }
      if (modeTitle) modeTitle.textContent = `MATERIAL CODE: ${classification.clean}`;
      if (modeIcon) modeIcon.textContent = '📦';
    } else if (classification.type === 'WO') {
      scanCounts.wo++;
      const field = document.getElementById('cipher-wo-input');
      const countEl = document.getElementById('count-wo');
      const card = document.getElementById('card-wo');

      if (field) {
        field.value = classification.clean;
      }
      if (countEl) countEl.textContent = `${scanCounts.wo} scans`;

      animateCard(card, 'rgba(167, 139, 250, 0.5)');

      if (modeBadge) {
        modeBadge.className = 'state-tag RUNNING';
        modeBadge.textContent = 'WO VALID';
      }
      if (modeTitle) modeTitle.textContent = `WORK ORDER: ${classification.clean}`;
      if (modeIcon) modeIcon.textContent = '📋';
    }
  }

  function animateCard(card, highlightColor) {
    if (!card) return;
    const origBorder = card.style.borderColor;
    card.style.borderColor = highlightColor;
    card.style.boxShadow = `0 0 20px ${highlightColor}`;
    setTimeout(() => {
      card.style.borderColor = origBorder;
      card.style.boxShadow = '';
    }, 450);
  }

  function updateByteInspector(raw) {
    const inspector = document.getElementById('rs38-byte-inspector');
    if (!inspector) return;
    let hexBytes = [];
    for (let i = 0; i < Math.min(raw.length, 32); i++) {
      const code = raw.charCodeAt(i);
      const hex = '0x' + code.toString(16).toUpperCase().padStart(2, '0');
      let label = hex;
      if (code === 3) label += '(ETX)';
      else if (code === 2) label += '(STX)';
      else if (code === 30) label += '(RS)';
      else if (code === 29) label += '(GS)';
      else if (code === 13) label += '(CR)';
      else if (code === 10) label += '(LF)';
      else if (code >= 32 && code <= 126) label += `('${raw[i]}')`;
      hexBytes.push(label);
    }
    inspector.textContent = hexBytes.join(' ') + (raw.length > 32 ? ' ...' : '');
  }

  // Transmit Scan to Gateway Backend for logging/audit
  async function transmitScan(raw) {
    try {
      const targetDev = (window.devicesCache && window.devicesCache.find(d => d.device_type !== 'RFID_FIXED')?.device_id) || 'HH-001';
      await fetch(`/api/v1/devices/${targetDev}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_scan: raw,
          input_method: 'KEYBOARD_WEDGE'
        })
      });
    } catch (err) {
      console.warn('Wedge scan backend transmit error:', err);
    }
  }

  // Process incoming raw string scan from physical wedge or simulation
  function processIncomingScan(raw) {
    if (!raw || !raw.trim()) return;
    const classification = classifyScan(raw);
    routeScanToField(classification, raw);
    transmitScan(raw);

    const hidden = getHiddenInput();
    if (hidden) {
      hidden.value = '';
    }

    // ALWAYS restore focus to hidden capture input immediately after processing
    setTimeout(ensureScannerFocus, 10);
  }

  // Consume and flush whatever is in the single hidden input buffer
  function flushCurrentBuffer() {
    if (burstTimer) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }

    const hidden = getHiddenInput();
    if (!hidden) return;

    const payload = hidden.value;
    hidden.value = ''; // Atomically clear buffer

    if (payload && payload.trim()) {
      processIncomingScan(payload);
    }
  }

  // Initialize Input & Key Event Listeners
  function initScannerCapture() {
    const hidden = getHiddenInput();

    if (hidden) {
      // 1. Keydown Event: Clean buffer if new scan starts after pause, and flush on Enter/Tab
      hidden.addEventListener('keydown', (e) => {
        const now = Date.now();
        if (now - lastKeyTimestamp > 150) {
          hidden.value = '';
        }
        lastKeyTimestamp = now;

        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          flushCurrentBuffer();
        }
      });

      // 2. Input Event: Fires as characters arrive (from physical keystrokes, Android IME, or paste)
      hidden.addEventListener('input', () => {
        if (burstTimer) clearTimeout(burstTimer);
        lastKeyTimestamp = Date.now();

        const val = hidden.value;
        // If it contains Enter/Newline/Tab terminator -> Process instantly
        if (val.includes('\n') || val.includes('\r') || val.includes('\t')) {
          flushCurrentBuffer();
          return;
        }

        const cleanVal = sanitizeScanPayload(val);

        // Instant completion for 10-character MC (Material Code: 100...)
        if (cleanVal.length === 10 && (cleanVal.startsWith('100') || cleanVal.startsWith('10') || /^1\d{9}$/.test(cleanVal))) {
          flushCurrentBuffer();
          return;
        }

        // Instant completion for 10-character WO (Work Order: 200..., 400..., etc.)
        if (cleanVal.length === 10 && (cleanVal.startsWith('200') || cleanVal.startsWith('400') || cleanVal.startsWith('20') || cleanVal.startsWith('40') || /^[2-9]\d{9}$/.test(cleanVal))) {
          flushCurrentBuffer();
          return;
        }

        // Instant completion for 24-character RFID EPC (Hexadecimal)
        if (cleanVal.length === 24 && /^[0-9A-Fa-f]{24}$/.test(cleanVal)) {
          flushCurrentBuffer();
          return;
        }

        // Set burst timer (250ms silence timeout prevents slow Bluetooth/IME streams from splitting mid-scan)
        burstTimer = setTimeout(flushCurrentBuffer, 250);
      });
    }

    // 3. Global Window Keydown Listener: If user pressed a key and hidden was not focused, reclaim focus
    window.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      // Do not hijack if user is typing into an intentional config input
      if (active && active.tagName === 'INPUT' && MANUAL_FORM_INPUTS.has(active.id)) {
        return;
      }

      const now = Date.now();
      if (hidden && active !== hidden) {
        if (now - lastKeyTimestamp > 150) {
          hidden.value = '';
        }
        hidden.focus({ preventScroll: true });
      }
      lastKeyTimestamp = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (hidden && hidden.value.length > 0) {
          e.preventDefault();
          flushCurrentBuffer();
        }
      }
    });

    // 4. Automatic focus restoration events:
    ensureScannerFocus();

    document.addEventListener('click', () => { setTimeout(ensureScannerFocus, 20); });
    document.addEventListener('touchstart', () => { setTimeout(ensureScannerFocus, 20); });
    document.addEventListener('pointerdown', () => { setTimeout(ensureScannerFocus, 20); });
    document.addEventListener('focusout', () => { setTimeout(ensureScannerFocus, 50); });
    window.addEventListener('focus', () => { setTimeout(ensureScannerFocus, 10); });

    // Periodic heartbeat to keep scanner focus permanently locked
    setInterval(ensureScannerFocus, 1000);
  }

  // Public Interface for app.js and UI
  window.RS38_WEDGE = {
    ensureScannerFocus: ensureScannerFocus,
    injectScan: processIncomingScan,
    classifyScan: classifyScan,
    clearFields: function (which) {
      if (!which || which === 'all') {
        const rfidIn = document.getElementById('cipher-rfid-input');
        const mcIn = document.getElementById('cipher-mc-input');
        const woIn = document.getElementById('cipher-wo-input');
        if (rfidIn) rfidIn.value = '';
        if (mcIn) mcIn.value = '';
        if (woIn) woIn.value = '';
      } else {
        const field = document.getElementById(`cipher-${which}-input`);
        if (field) field.value = '';
      }
      ensureScannerFocus();
    }
  };

  // Aliases for inline HTML onclick handlers
  window.resetPermanentHiddenFocus = ensureScannerFocus;
  window.clearCipherField = function (which) { window.RS38_WEDGE.clearFields(which); };
  window.clearAllCipherFields = function () { window.RS38_WEDGE.clearFields('all'); };
  window.copyCipherField = function (which) {
    const field = document.getElementById(`cipher-${which}-input`);
    if (field && field.value) {
      navigator.clipboard.writeText(field.value).then(() => {
        field.style.backgroundColor = 'rgba(52, 211, 153, 0.25)';
        setTimeout(() => { field.style.backgroundColor = ''; }, 300);
      }).catch(() => {});
    }
    ensureScannerFocus();
  };
  window.focusCipherField = function (which) {
    ensureScannerFocus();
  };
  window.dismissCipherAlert = function () {
    const alertBanner = document.getElementById('cipher-unauthorized-alert');
    if (alertBanner) alertBanner.style.display = 'none';
    ensureScannerFocus();
  };
  window.injectRS38TestScan = function (scenario) {
    if (scenario === 'etx_rfid_valid') {
      processIncomingScan('\x03E2801190A504006FA2BF55AB\r');
    } else if (scenario === 'stx_qr_material_100') {
      processIncomingScan('\x021008899221\r');
    } else if (scenario === 'stx_qr_workorder_200') {
      processIncomingScan('\x022007766554\r');
    } else if (scenario === 'unknown_qr') {
      processIncomingScan('\x023009988776\r');
    }
  };

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScannerCapture);
  } else {
    initScannerCapture();
  }
})();
