# Wakefit Finished Goods (FG) Label Generation & Auto-ID System
## Complete API & Hardware Integration Specification

**Document Version:** 2.4.0  
**Target Environments:** Edge Industrial Gateways, Local SQLite DB, Central Wakefit ERP / MES  
**Authors:** UAIM Systems & Wakefit Automation Engineering  
**Protocol Compliance:** ISO/IEC 18000-6C (EPC Gen2), GS1 EPC Tag Data Standard (TDS 1.13), ZPL II, SICK CoLa-A/B, LLRP  

---

## 1. System Architecture Overview

```
+---------------------------------------------------------------------------------------------------------+
|                                    WAKEFIT CENTRAL ERP / MES SYSTEM                                     |
+---------------------------------------------------------------------------------------------------------+
                                                     ▲
                                                     │ HTTPS REST / MQTT (Sync)
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
|                                EDGE GATEWAY & LOCAL SQLITE STORAGE                                       |
|  • Local SQLite Database: /data/sqlite/wakefit_fg_marriage.db                                            |
|  • High-Speed Offline Buffer & Transaction Audit Store                                                  |
|  • Edge REST API & WebSocket Event Broker                                                               |
+---------------------------------------------------------------------------------------------------------+
       ▲                                      ▲                                            ▲
       │ TCP/IP Port 2112 (CoLa)              │ WebSocket / Android Intent                 │ TCP Port 9100 (ZPL II)
       ▼                                      ▼                                            ▼
+-----------------------+          +-----------------------+                    +-----------------------+
|   SICK RFU630-13100   |          |  CIPHERLAB RS38 GUN   |                    |   ZEBRA ZT411 RFID    |
|   Fixed RFID Portal   |          | Handheld 2D/UHF Reader|                    |  Industrial Encoder   |
| (Continuous Packaging)|          |  (Marriage & Quality) |                    |  (Label Printing)     |
+-----------------------+          +-----------------------+                    +-----------------------+
```

---

## 2. Hardware Devices & Communication Protocols

### 2.1 SICK RFU630-13100 Fixed UHF RFID Reader Portal
- **Role:** Continuous automated scanning of packaged finished goods passing on packaging conveyors.
- **Operating Frequency:** 865.6 – 867.6 MHz (India/ETSI bands, hopping enabled).
- **Communication Protocols:**
  - **CoLa-A / CoLa-B (SICK Command Language):** Raw ASCII / Binary command protocol on TCP port `2111` / `2112`.
  - **HTTP/REST Notification Webhook:** Reader broadcasts asynchronous tag event triggers to Gateway.
- **Operating Modes:**
  - **Autonomous Continuous Scan Mode:** Reader active RF field emits continuous carrier wave listening for tag backscatter.
  - **LED Status Behavior:**
    - **No FG Detected (Standby):** Solid **Steady Green** indicator (`#10B981`), zero blinking.
    - **FG Detected (Scan Event):** Rapid **Orange Blinking** strobe (`#F97316` at 350ms period) during tag acquisition.

### 2.2 CipherLab RS38 Android Mobile Computer
- **Role:** Shop-floor handheld barcode & UHF RFID scanning for QA validation and manual marriage.
- **Hardware Features:** Integrated Zebra SE4770 2D Imager + UHF RFID Reader Gun.
- **Integration Layer:**
  - **Android Broadcast Intent:** Intercepts hardware scan events from `com.cipherlab.barcode.generalservice`.
  - **WebSocket Bridge:** Gateway stream at `ws://<edge-gateway-ip>:8080/ws/handheld`.

### 2.3 Zebra ZT411 Industrial RFID Printers
- **Role:** Printing 4"x6" shipping & warranty labels with synchronized EPC Gen2 RFID inlay encoding.
- **Protocol:** Raw TCP Socket on port `9100` via **ZPL II (Zebra Programming Language)**.
- **Encoding Command:** `^RFW,H,1,12,1^FD{EPC_HEX}^FS` (Write 96-bit hexadecimal EPC into Bank 01).

---

## 3. Data Models & Schemas

### 3.1 Married FG Transaction Record (`MarriedTransaction`)

| Field Name | Type | Description | Example |
|---|---|---|---|
| `id` | `string` | Unique record primary key | `txn-1042` |
| `transactionId` | `string` | Human-readable transaction identifier | `TXN-20260831-0089` |
| `materialCode` | `string` | Wakefit SAP Material Code | `WAK-MAT-787208` |
| `partNumber` | `string` | Engineering FG Part Number | `FG-ORT-KNG-08` |
| `workOrderNo` | `string` | Production Work Order Reference | `WO-2026-0831-99214` |
| `rfidUniqueId` | `string` | Factory Encoded RFID Tag EPC (96-bit Hex) | `E280117020002164A5B801D3` |
| `wipScanTimestamp` | `string` | Timestamp when WIP packaging/marriage scan occurred | `2026-08-31 11:32:04` |
| `dispatchScanTimestamp` | `string?` | Timestamp when outbound dock portal verified shipment | `2026-08-31 15:32:10` (or `null`) |
| `status` | `enum` | Lifecycle State: `'WIP'` \| `'Dispatched'` | `'Dispatched'` |
| `productName` | `string` | Catalog Product Description | `Orthopaedic Memory Foam Mattress (King)` |
| `category` | `string` | Product Category | `Mattress` |
| `mrp` | `number` | Maximum Retail Price in INR | `18999` |
| `productImage` | `string` | URL / relative path to product image | `/products/mattress_1.jpg` |
| `deviceId` | `string` | Reader hardware identifier | `dev-cpr-01` |
| `deviceName` | `string` | Reader name & station location | `CIPHER RS38 UHF Reader #01 (Station Line 1)` |
| `operatorRole` | `string` | Operating User Role | `Quality Inspector` |
| `dbStatus` | `enum` | Persistence State: `'COMMITTED_TO_SQLITE'` \| `'SYNCED_MES'` | `'COMMITTED_TO_SQLITE'` |
| `sqliteDatabasePath`| `string` | Local SQLite file destination | `/data/sqlite/wakefit_fg_marriage.db` |
| `sqliteRecordId` | `number` | Autoincrement SQLite Primary Key | `1042` |

---

## 4. REST API Endpoint Specifications

### 4.1 Master Data Catalog API

#### `GET /api/master-data`
- **Description:** Retrieve all active Wakefit Finished Goods catalog items.
- **Response `200 OK`:**
```json
{
  "success": true,
  "count": 8,
  "data": [
    {
      "id": "md-001",
      "materialCode": "WAK-MAT-787208",
      "partNumber": "FG-ORT-KNG-08",
      "productDescription": "Orthopaedic Memory Foam Mattress (King - 78x72x8 inch)",
      "category": "Mattress",
      "mrp": 18999,
      "dimensions": {
        "lengthMm": 1981,
        "widthMm": 1828,
        "heightMm": 203
      },
      "netWeight": 28.5,
      "warrantyYears": 10,
      "fgImage": "/products/mattress_1.jpg"
    }
  ]
}
```

#### `POST /api/master-data`
- **Description:** Register or import new SKU master records.
- **Request Body:**
```json
{
  "materialCode": "WAK-MAT-787210",
  "partNumber": "FG-ORT-KNG-10",
  "productDescription": "Orthopaedic Memory Foam Mattress (King - 78x72x10 inch)",
  "category": "Mattress",
  "mrp": 21999,
  "dimensions": { "lengthMm": 1981, "widthMm": 1828, "heightMm": 254 },
  "netWeight": 32.0,
  "warrantyYears": 10
}
```

---

### 4.2 RFID Marriage & Validation API

#### `POST /api/marriage/validate`
- **Description:** Validate raw barcode and RFID scanner payloads against master catalog rules.
- **Request Body:**
```json
{
  "qr1MaterialCode": "WAK-MAT-787208",
  "qr2WorkOrderNo": "WO-2026-0831-99214",
  "rfidUniqueId": "E280117020002164A5B801D3",
  "deviceId": "dev-cpr-01",
  "operatorRole": "Quality Inspector"
}
```
- **Response `200 OK` (Pass):**
```json
{
  "success": true,
  "result": "PASS",
  "matchedSku": {
    "materialCode": "WAK-MAT-787208",
    "partNumber": "FG-ORT-KNG-08",
    "productName": "Orthopaedic Memory Foam Mattress (King - 78x72x8 inch)"
  },
  "inspections": {
    "materialCodeMatch": true,
    "partNumberMatch": true,
    "rfidEpcMatch": true,
    "barcodeGradeCheck": true
  }
}
```

#### `POST /api/marriage/commit`
- **Description:** Atomically commit validated scan marriage to local SQLite database and queue for MES sync.
- **Request Body:**
```json
{
  "transactionId": "TXN-20260831-0089",
  "materialCode": "WAK-MAT-787208",
  "partNumber": "FG-ORT-KNG-08",
  "workOrderNo": "WO-2026-0831-99214",
  "rfidUniqueId": "E280117020002164A5B801D3",
  "deviceId": "dev-cpr-01",
  "operatorRole": "Quality Inspector"
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "transactionId": "TXN-20260831-0089",
  "sqliteRecordId": 1042,
  "status": "WIP",
  "wipScanTimestamp": "2026-08-31 15:32:10",
  "dispatchScanTimestamp": null,
  "sqliteDatabasePath": "/data/sqlite/wakefit_fg_marriage.db",
  "dbStatus": "COMMITTED_TO_SQLITE"
}
```

---

### 4.3 SICK Reader Continuous Scan Event Webhook

#### `POST /api/readers/sick/scan-event`
- **Description:** Real-time event triggered when an FG item passes under SICK RFU630 portal.
- **Payload:**
```json
{
  "readerId": "SICK-RFU630-13100-01",
  "antennaPort": 1,
  "readTimestamp": "2026-09-01T17:55:12.430Z",
  "tagData": {
    "epcHex": "E280117020002164A5B801D3",
    "rssi": -46,
    "readCount": 14
  },
  "status": "FG_DETECTED",
  "lightIndication": "ORANGE_BLINKING"
}
```

---

### 4.4 Transaction History & Dispatch Tracking API

#### `GET /api/transactions`
- **Description:** Query married transactions with date range, status, device, and SKU filters.
- **Query Parameters:**
  - `startDate` (ISO 8601 or YYYY-MM-DD HH:mm:ss)
  - `endDate` (ISO 8601 or YYYY-MM-DD HH:mm:ss)
  - `status` (`WIP` | `Dispatched` | `all`)
  - `deviceId` (reader hardware id)
  - `search` (text search across Material Code, Part Number, WO, RFID)
- **Response `200 OK`:**
```json
{
  "success": true,
  "total": 7,
  "wipCount": 3,
  "dispatchedCount": 4,
  "data": [
    {
      "id": "txn-001",
      "transactionId": "TXN-20260831-0089",
      "productImage": "/products/mattress_1.jpg",
      "materialCode": "WAK-MAT-787208",
      "partNumber": "FG-ORT-KNG-08",
      "workOrderNo": "WO-2026-0831-99214",
      "rfidUniqueId": "E280117020002164A5B801D3",
      "wipScanTimestamp": "2026-08-31 11:32:04",
      "dispatchScanTimestamp": null,
      "status": "WIP",
      "deviceName": "CIPHER RS38 UHF Reader #01 (Station Line 1)"
    },
    {
      "id": "txn-002",
      "transactionId": "TXN-20260831-0088",
      "productImage": "/products/sofa_1.jpg",
      "materialCode": "WAK-SOF-NAP-3ST",
      "partNumber": "FG-SOF-NAP-NAVY",
      "workOrderNo": "WO-2026-0831-99212",
      "rfidUniqueId": "E280117020002164A5B801D2",
      "wipScanTimestamp": "2026-08-31 11:20:30",
      "dispatchScanTimestamp": "2026-08-31 15:28:44",
      "status": "Dispatched",
      "deviceName": "CIPHER RS38 UHF Reader #02 (Station Line 2)"
    }
  ]
}
```

#### `GET /api/transactions/export`
- **Description:** Generates formatted CSV containing the exact operational columns:
  1. `Transaction ID`
  2. `Material Code`
  3. `Part Number`
  4. `Work Order No`
  5. `RFID ID`
  6. `WIP Scan Timestamp`
  7. `Dispatch Scan Timestamp`
  8. `Product Description`
  9. `Category`
  10. `MRP (INR)`
  11. `Scanner Device`
  12. `Operator Role`
  13. `State`

---

## 5. Local SQLite Database Schema

```sql
-- SQLite Table: wakefit_fg_marriage
CREATE TABLE IF NOT EXISTS married_transactions (
    sqlite_record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    material_code TEXT NOT NULL,
    part_number TEXT NOT NULL,
    work_order_no TEXT NOT NULL,
    rfid_unique_id TEXT NOT NULL,
    wip_scan_timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
    dispatch_scan_timestamp DATETIME,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    mrp REAL NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    operator_role TEXT NOT NULL,
    status TEXT CHECK(status IN ('WIP', 'Dispatched')) DEFAULT 'WIP',
    db_status TEXT CHECK(db_status IN ('COMMITTED_TO_SQLITE', 'QUEUED', 'SYNCED_MES')) DEFAULT 'COMMITTED_TO_SQLITE',
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_txn_id ON married_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_rfid ON married_transactions(rfid_unique_id);
CREATE INDEX IF NOT EXISTS idx_wo ON married_transactions(work_order_no);
CREATE INDEX IF NOT EXISTS idx_mat_code ON married_transactions(material_code);
CREATE INDEX IF NOT EXISTS idx_status ON married_transactions(status);
```

---

## 6. SICK & Zebra Hardware LED Indication Matrix

| Operating Event | SICK RFU630 Portal LED | RF Field Beam | Portal State Text | Handheld Gun / UI Indication |
|---|---|---|---|---|
| **Continuous Standby (No FG)** | Solid **Steady Green** (`#10B981`) | Steady Green Gradient | `GREEN STEADY (NO FG DETECTED)` | Ready / Standby Banner |
| **Scan Event (FG Inlay Detected)** | Rapid **Orange Blinking** (`#F97316` @ 350ms) | Pulsing Orange RF Waves | `ORANGE BLINKING (FG DETECTED)` | Audio Chime + Green Validation Tag |
| **Zebra RFID Label Encode Success** | Solid Green Indicator on Front Panel | - | `ENCODE & PRINT OK` | Instant Marriage Coupling |
| **Validation Mismatch / Fault** | Flashing Red Alarm Beacon | Red Alert Overlay | `VALIDATION FAIL / MISMATCH` | Error Buzzer + Modal Halt |

---

## 7. Security & Role-Based Access Control (RBAC)

| User Role | Operations Dashboard | Barcode & RFID Validation | Label Lookup & Print | History Table & SQLite Export | Master Data Catalog Config | Device Management Config | Role Security Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **System Administrator** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Production Supervisor** | Yes | Yes | Yes | Yes | Hidden | Hidden | Hidden |
| **Line Operator** | Hidden | Yes | Hidden | Hidden | Hidden | Hidden | Hidden |

---
*End of API Integration Specification — Wakefit Auto-ID Engineering*
