"""
Wakefit Finished Goods (FG) Auto-ID, Devices, Roles & Master Data
End-to-End API Test Suite
Run from the backend/ folder:
    python test_api.py
"""

import sys
import sqlite3
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def print_header(title: str):
    print(f"\n{'='*70}\n>> {title}\n{'='*70}")

def print_success(msg: str):
    print(f"  [PASS] {msg}")

from utils.database import DB_PATH

def main():
    print_header("1. CHECK SQLITE DATABASE & TABLES IN DUMMY.DB")
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    tables = [t[0] for t in cur.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
    con.close()
    
    expected_tables = [
        "roles", 
        "device_category", 
        "connections", 
        "device_status", 
        "devices", 
        "fg_category", 
        "fg_status", 
        "master_data_items",
        "transactions_data",
        "status_transaction_data"
    ]
    for table in expected_tables:
        assert table in tables, f"Table '{table}' missing in dummy.db!"
        print_success(f"Table '{table}' verified.")

    print_header("2. SEED INITIAL DATA (/api/master_data/seed)")
    res_seed = client.post("/api/master_data/seed")
    assert res_seed.status_code == 200, f"Seed error: {res_seed.text}"
    seed_json = res_seed.json()
    print_success(f"Seed endpoint responded with 200 OK:")
    print(f"         Total Categories: {seed_json.get('totalCategories')}")
    print(f"         Total Statuses:   {seed_json.get('totalStatuses')}")
    print(f"         Total SKU Items:  {seed_json.get('totalMasterDataItems')}")

    print_header("3. TEST GET /api/master_data/get_roles_data")
    res_roles = client.get("/api/master_data/get_roles_data")
    assert res_roles.status_code == 200, f"Error: {res_roles.text}"
    roles = res_roles.json()
    assert len(roles) >= 3, "Expected at least 3 roles"
    print_success(f"Received {len(roles)} roles from backend:")
    for r in roles:
        print(f"         • Role '{r['id']}' ({r['name']}) -> Password: '{r['password']}'")

    print_header("4. TEST PUT /api/master_data/update_roles_password")
    new_pwd = "operator_pass_updated"
    res_pwd = client.put("/api/master_data/update_roles_password", json={
        "roleId": "operator",
        "newPassword": new_pwd
    })
    assert res_pwd.status_code == 200, f"Password update failed: {res_pwd.text}"
    print_success(f"Password updated for role 'operator'.")
    
    # Confirm updated password via GET
    res_roles_verify = client.get("/api/master_data/get_roles_data").json()
    op_role = next(r for r in res_roles_verify if r["id"] == "operator")
    assert op_role["password"] == new_pwd
    print_success(f"Verified live updated password for operator: '{op_role['password']}'")

    print_header("5. TEST GET /api/master_data/get_devices_data")
    res_devs = client.get("/api/master_data/get_devices_data")
    assert res_devs.status_code == 200, f"Devices fetch failed: {res_devs.text}"
    devices = res_devs.json()
    assert len(devices) > 0, "Expected registered devices"
    print_success(f"Received {len(devices)} devices:")
    for d in devices[:3]:
        print(f"         • [{d['category']}] {d['displayName']} (ID: {d['deviceId']}, IP: {d.get('ipAddress', 'N/A')})")

    print_header("6. TEST POST /api/master_data/post_devices_data")
    import time
    test_device_id = f"dev-test-{int(time.time())}"
    new_device_payload = {
        "deviceId": test_device_id,
        "displayName": "Zebra DS3678 Industrial Barcode Reader",
        "assetCode": f"BC-ZBR-{int(time.time()) % 1000}",
        "category": "barcode",
        "connectionType": "USB-HID",
        "stationId": "Line 2 Packaging",
        "status": "online",
        "scanMode": "Manual Scan",
        "brand": "Zebra",
        "model": "DS3678-SR Ultra-Rugged Scanner",
        "serialNumber": "SN-ZBR-99014",
    }
    res_post_dev = client.post("/api/master_data/post_devices_data", json=new_device_payload)
    assert res_post_dev.status_code == 201, f"Device registration failed: {res_post_dev.text}"
    created_dev = res_post_dev.json()
    print_success(f"Registered new device: {created_dev['displayName']} (ID: {created_dev['deviceId']})")

    print_header("7. TEST PUT /api/master_data/update_devices_data")
    update_payload = {
        "deviceId": test_device_id,
        "status": "error",
        "lastError": "Optic laser head recalibration needed",
        "firmwareVersion": "v5.2.1"
    }
    res_update_dev = client.put("/api/master_data/update_devices_data", json=update_payload)
    assert res_update_dev.status_code == 200, f"Device update failed: {res_update_dev.text}"
    updated_dev = res_update_dev.json()
    assert updated_dev["status"] == "error"
    print_success(f"Updated device: Status '{updated_dev['status']}', Error '{updated_dev['lastError']}'")

    print_header("8. TEST GET FG MASTER DATA ITEMS (/api/master_data/)")
    res_items = client.get("/api/master_data/")
    assert res_items.status_code == 200, f"Master data fetch failed: {res_items.text}"
    master_items = res_items.json()
    assert len(master_items) >= 1
    sample = master_items[0]
    print_success(f"Retrieved {len(master_items)} Master SKU items:")
    print(f"         • Sample SKU: {sample['materialCode']} - {sample['productDescription']}")
    print(f"           Dimensions: {sample['dimensions']['lengthMm']}x{sample['dimensions']['widthMm']}x{sample['dimensions']['heightMm']} mm")

    print_header("9. TEST FG MARRIAGE TRANSACTION (LINKING SKU + DEVICE + OPERATOR)")
    txn_payload = {
        "materialCode": sample["materialCode"],
        "workOrderNo": "WO-2026-0910-8812",
        "rfidUniqueId": "E280117020002164A5B89999",
        "deviceId": created_dev["deviceId"],
        "operatorRole": "operator",
        "status": "wip"
    }
    res_txn = client.post("/api/transactions/", json=txn_payload)
    assert res_txn.status_code == 201, f"Marriage transaction failed: {res_txn.text}"
    txn = res_txn.json()
    print_success(f"Committed Marriage Transaction:")
    print(f"         Transaction ID: {txn['transactionId']}")
    print(f"         Material Code:  {txn['materialCode']} ({txn['productName']})")
    print(f"         Scanner Device: {txn['deviceName']}")
    print(f"         Operator Role:  {txn['operatorRole']}")
    print(f"         Status:         {txn['status']}")

    print_header("10. TEST DISPATCH STATUS UPDATE")
    res_dispatch = client.put(f"/api/transactions/{txn['transactionId']}/status", json={"status": "dispatch"})
    assert res_dispatch.status_code == 200
    print_success(f"Transaction status successfully transitioned to: {res_dispatch.json()['status']}")

    print("\n" + "="*70)
    print(">>> ALL TESTS PASSED! ALL 5 REQUESTED ENDPOINTS FULLY VERIFIED! <<<")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()

