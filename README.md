# Wakefit RFID server

Install the Python dependencies with `python -m pip install -r requirements.txt`,
then run `python build_exe.py` to build `dist/WakefitRFID_App.exe`.
The EXE creates `fg_server_db.db` and `uploads/` beside itself on launch; those
runtime files are excluded from the bundle. Other PCs on the network can open
`http://<server-LAN-IP>:8000` when inbound TCP port 8000 is allowed on the
server PC.

## Bulk FG master data import

In **Master Data**, choose **Bulk Upload XLSX** and select the client template.
The server also accepts `POST /api/master_data/bulk-import` with a multipart
form field named `file`. The first worksheet must have these columns: `S.no`,
`Material Code`, `Part Number`, `Category`, `Model`, `Product Description`,
`Dimensions (LxWxH mm)`, `Color`, `Status`, and `FG Image 1` through
`FG Image 4`. Dimensions use `LxWxH` in millimetres. Image cells contain
HTTP/HTTPS URLs or server relative image paths. Numeric Material Codes are
stored as text identifiers. Use text formatted Excel cells if leading zeroes
must be preserved.

The import creates valid new rows and reports invalid rows and existing Material
Codes or Part Numbers. Existing catalog entries are left unchanged. `OnHold`
from the template is stored as `On hold`. The web catalog refreshes after
upload, and Android scanner lookups read the same server catalog.
