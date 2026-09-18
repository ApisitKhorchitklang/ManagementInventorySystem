# Inventory Management API

Base URL สำหรับเครื่อง dev: `http://localhost:3000`

| หัวข้อ | ค่า |
|---|---|
| รูปแบบข้อมูล | JSON (UTF-8) |
| Header ที่ต้องส่ง | `Content-Type: application/json` ทุก request ที่มี body |
| Authentication | ยังไม่เปิดใช้ในเวอร์ชันนี้ ดูหัวข้อ [การต่อยอด](#การต่อยอด) |
| วันเวลา | ISO 8601 พร้อม timezone เช่น `2026-09-18T10:22:31.412Z` |

## รูปแบบ Response

สำเร็จ — ข้อมูลหลักอยู่ใน `data` เสมอ รายการที่แบ่งหน้าจะมี `meta` ต่อท้าย

```json
{
  "data": { "...": "..." },
  "meta": { "page": 1, "limit": 20, "total": 42, "total_pages": 3 }
}
```

ผิดพลาด — อยู่ใน `error` เสมอ `message` เป็นภาษาไทยที่แสดงให้ผู้ใช้อ่านได้ทันที

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "สต็อกไม่พอ: เมาส์ไร้สาย Logitech M331 คงเหลือ 3 ตัว แต่ขอตัด 5 ตัว",
    "details": { "product_id": 2, "sku": "IT-MS-002", "stock_quantity": 3, "requested": -5, "shortfall": 2 }
  }
}
```

### รหัสสถานะและ error code

| HTTP | code | ความหมาย |
|---|---|---|
| 200 | — | สำเร็จ |
| 201 | — | สร้างข้อมูลใหม่สำเร็จ |
| 204 | — | ลบสำเร็จ ไม่มี body |
| 400 | `INVALID_JSON` | body ไม่ใช่ JSON ที่ถูกต้อง |
| 404 | `PRODUCT_NOT_FOUND` | ไม่พบสินค้าตาม id |
| 404 | `NOT_FOUND` | ไม่พบ endpoint หรือข้อมูลที่ระบุ |
| 409 | `SKU_ALREADY_EXISTS` | SKU ซ้ำกับสินค้าที่มีอยู่ |
| 409 | `CATEGORY_ALREADY_EXISTS` | ชื่อกลุ่มสินค้าซ้ำ |
| 409 | `INSUFFICIENT_STOCK` | ปรับแล้วสต็อกจะติดลบ |
| 409 | `PRODUCT_INACTIVE` | สินค้าถูกปิดการใช้งาน ปรับสต็อกไม่ได้ |
| 409 | `PRODUCT_HAS_TRANSACTIONS` | ลบถาวรไม่ได้เพราะมีประวัติแล้ว |
| 409 | `CATEGORY_IN_USE` | ลบกลุ่มไม่ได้เพราะยังมีสินค้าอยู่ |
| 422 | `VALIDATION_ERROR` | ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ `details.field` บอกฟิลด์ที่ผิด |
| 500 | `INTERNAL_ERROR` | ข้อผิดพลาดที่ไม่คาดคิด |
| 503 | `DATABASE_UNAVAILABLE` | เชื่อมต่อฐานข้อมูลไม่ได้ |

---

## 1. สินค้า (Products)

### POST /api/products — เพิ่มสินค้าใหม่

| ฟิลด์ | ชนิด | บังคับ | หมายเหตุ |
|---|---|---|---|
| `sku` | string(50) | ใช่ | ต้องไม่ซ้ำกับสินค้าอื่น |
| `name` | string(255) | ใช่ | |
| `category_id` | integer | ใช่ | ต้องมีอยู่ในตาราง categories |
| `cost_price` | number | ใช่ | ≥ 0 ระบบปัดเป็นทศนิยม 2 ตำแหน่ง |
| `description` | string(500) | ไม่ | |
| `unit` | string(20) | ไม่ | ค่าเริ่มต้น `ชิ้น` |
| `stock_quantity` | integer | ไม่ | ค่าเริ่มต้น 0 ถ้า > 0 จะบันทึกเป็นรายการรับเข้าให้อัตโนมัติ |
| `low_stock_threshold` | integer | ไม่ | ค่าเริ่มต้น 5 |

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "IT-MS-002",
    "name": "เมาส์ไร้สาย Logitech M331",
    "category_id": 1,
    "cost_price": 420,
    "unit": "ตัว",
    "stock_quantity": 10,
    "low_stock_threshold": 5
  }'
```

**201 Created**

```json
{
  "data": {
    "id": 2,
    "sku": "IT-MS-002",
    "name": "เมาส์ไร้สาย Logitech M331",
    "description": null,
    "unit": "ตัว",
    "cost_price": 420,
    "stock_quantity": 10,
    "low_stock_threshold": 5,
    "is_low_stock": false,
    "stock_value": 4200,
    "category": { "id": 1, "name": "IT" },
    "is_active": true,
    "created_at": "2026-09-18T03:10:22.881Z",
    "updated_at": "2026-09-18T03:10:22.881Z"
  }
}
```

**409 Conflict** — SKU ซ้ำ

```json
{ "error": { "code": "SKU_ALREADY_EXISTS", "message": "SKU นี้ถูกใช้กับสินค้าอื่นแล้ว" } }
```

**422 Unprocessable Entity** — ข้อมูลไม่ครบ

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ต้องระบุ cost_price",
    "details": { "field": "cost_price" }
  }
}
```

---

### GET /api/products — รายการสินค้า

| Query | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `search` | — | ค้นจากชื่อหรือ SKU (ไม่สนตัวพิมพ์ใหญ่เล็ก) |
| `category_id` | — | กรองตามกลุ่ม |
| `is_active` | ทั้งหมด | `true` / `false` |
| `low_stock` | `false` | `true` = เฉพาะที่ต่ำกว่าจุดเตือน |
| `sort` | `created_at` | `name`, `sku`, `stock_quantity`, `cost_price`, `created_at` |
| `order` | `desc` | `asc` / `desc` |
| `page` | 1 | |
| `limit` | 20 | สูงสุด 100 |

```bash
curl "http://localhost:3000/api/products?search=เมาส์&sort=stock_quantity&order=asc&limit=20"
```

**200 OK**

```json
{
  "data": [ { "id": 2, "sku": "IT-MS-002", "stock_quantity": 3, "is_low_stock": true, "...": "..." } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
}
```

---

### GET /api/products/low-stock — สินค้าใกล้หมด

ไม่ส่ง `threshold` มา ระบบจะใช้จุดเตือนของสินค้าแต่ละตัว (`low_stock_threshold` ค่าเริ่มต้น 5) ส่ง `threshold` มาเมื่อต้องการใช้เกณฑ์เดียวกับทุกสินค้า นับเฉพาะสินค้าที่ `is_active = true`

| Query | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `threshold` | จุดเตือนรายสินค้า | จำนวนเต็ม ≥ 0 เงื่อนไขคือ **น้อยกว่า** ค่านี้ |

```bash
curl http://localhost:3000/api/products/low-stock
curl "http://localhost:3000/api/products/low-stock?threshold=5"
```

**200 OK**

```json
{
  "threshold": 5,
  "threshold_mode": "fixed",
  "count": 2,
  "data": [
    { "id": 7, "sku": "OS-ST-003", "name": "ลวดเย็บกระดาษ เบอร์ 10", "stock_quantity": 0, "low_stock_threshold": 5, "is_low_stock": true, "unit": "กล่อง", "category": { "id": 2, "name": "Office Supply" }, "...": "..." },
    { "id": 2, "sku": "IT-MS-002", "name": "เมาส์ไร้สาย Logitech M331", "stock_quantity": 3, "low_stock_threshold": 5, "is_low_stock": true, "unit": "ตัว", "category": { "id": 1, "name": "IT" }, "...": "..." }
  ]
}
```

เรียงจากคงเหลือน้อยที่สุดขึ้นก่อน เพื่อให้หยิบไปสั่งซื้อได้ทันที

---

### GET /api/products/:id

**200 OK** คืนสินค้าหนึ่งรายการในรูปแบบเดียวกับตอนสร้าง
**404** `PRODUCT_NOT_FOUND`

---

### PATCH /api/products/:id — แก้ไขข้อมูลสินค้า

ส่งเฉพาะฟิลด์ที่ต้องการแก้ รับ `sku`, `name`, `description`, `unit`, `category_id`, `cost_price`, `low_stock_threshold`, `is_active`

**แก้ `stock_quantity` ที่นี่ไม่ได้** เพราะการเปลี่ยนสต็อกต้องมีประวัติเสมอ ให้ใช้ `PATCH /api/stock/adjust` แทน ถ้าส่งมาจะได้ 422 พร้อมคำอธิบาย

```bash
curl -X PATCH http://localhost:3000/api/products/2 \
  -H "Content-Type: application/json" \
  -d '{ "cost_price": 450, "low_stock_threshold": 8 }'
```

---

### DELETE /api/products/:id — ปิดการใช้งานสินค้า

ค่าเริ่มต้นเป็น soft delete คือตั้ง `is_active = false` เพื่อรักษาประวัติไว้

```bash
curl -X DELETE http://localhost:3000/api/products/2
```

**200 OK**

```json
{ "data": { "id": 2, "is_active": false }, "message": "ปิดการใช้งานสินค้าแล้ว ประวัติการเคลื่อนไหวยังอยู่ครบ" }
```

ใส่ `?force=true` เพื่อลบถาวร ทำได้เฉพาะสินค้าที่ยังไม่เคยมีรายการสต็อก ถ้ามีแล้วจะได้ **409** `PRODUCT_HAS_TRANSACTIONS` สำเร็จจะได้ **204 No Content**

---

### GET /api/products/:id/transactions — ประวัติของสินค้าชิ้นเดียว

รองรับ `page`, `limit` เรียงจากใหม่ไปเก่า

```json
{
  "data": [
    {
      "id": 15, "product_id": 2, "type": "OUT", "quantity": 5, "change": -5,
      "balance_before": 8, "balance_after": 3,
      "reason": "เบิกใช้ภายใน", "created_by": "somchai",
      "transacted_at": "2026-09-18T04:01:55.120Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "total_pages": 1 },
  "product": { "id": 2, "sku": "IT-MS-002", "name": "เมาส์ไร้สาย Logitech M331" }
}
```

---

## 2. สต็อก (Stock)

### PATCH /api/stock/adjust — ปรับเพิ่ม/ลดสต็อก

หัวใจของระบบ ทำงานภายใน database transaction เดียว ล็อกแถวสินค้าด้วย `SELECT ... FOR UPDATE` ตรวจไม่ให้ติดลบ อัปเดตยอด และบันทึกลงตารางประวัติเสมอ

| ฟิลด์ | ชนิด | บังคับ | หมายเหตุ |
|---|---|---|---|
| `product_id` | integer | ใช่ | |
| `quantity` | integer | ใช่ | ค่าบวก = รับเข้า, ค่าลบ = ตัดออก, ห้ามเป็น 0 |
| `reason` | string(255) | ไม่ | เหตุผลสั้น ๆ เช่น "รับของจากซัพพลายเออร์" |
| `created_by` | string(100) | ไม่ | ผู้ทำรายการ |

```bash
# รับเข้า 10 ชิ้น
curl -X PATCH http://localhost:3000/api/stock/adjust \
  -H "Content-Type: application/json" \
  -d '{ "product_id": 2, "quantity": 10, "reason": "รับของจากซัพพลายเออร์", "created_by": "somchai" }'

# ตัดออก 5 ชิ้น
curl -X PATCH http://localhost:3000/api/stock/adjust \
  -H "Content-Type: application/json" \
  -d '{ "product_id": 2, "quantity": -5, "reason": "เบิกใช้ภายใน" }'
```

**200 OK**

```json
{
  "data": {
    "product": {
      "id": 2, "sku": "IT-MS-002", "name": "เมาส์ไร้สาย Logitech M331", "unit": "ตัว",
      "stock_quantity": 8, "low_stock_threshold": 5, "is_low_stock": false
    },
    "adjustment": { "balance_before": 3, "change": 5, "balance_after": 8 },
    "transaction": {
      "id": 16, "product_id": 2, "type": "IN", "quantity": 5, "change": 5,
      "balance_before": 3, "balance_after": 8,
      "reason": "รับของจากซัพพลายเออร์", "created_by": "somchai",
      "transacted_at": "2026-09-18T04:12:03.902Z"
    }
  },
  "message": "รับเข้า 5 ตัว สำเร็จ คงเหลือ 8"
}
```

**409 Conflict** — ตัดเกินจำนวนที่มี ไม่มีการเปลี่ยนแปลงใด ๆ ในฐานข้อมูล

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "สต็อกไม่พอ: เมาส์ไร้สาย Logitech M331 คงเหลือ 3 ตัว แต่ขอตัด 5 ตัว",
    "details": { "product_id": 2, "sku": "IT-MS-002", "stock_quantity": 3, "requested": -5, "shortfall": 2 }
  }
}
```

**422** เมื่อ `quantity` เป็น 0 หรือไม่ใช่จำนวนเต็ม · **404** เมื่อไม่พบสินค้า · **409** `PRODUCT_INACTIVE` เมื่อสินค้าถูกปิดการใช้งาน

---

### PATCH /api/stock/bulk-adjust — ปรับหลายรายการพร้อมกัน

เหมาะกับการตรวจนับประจำเดือนหรือการตัดสต็อกตามใบเบิกที่มีหลายบรรทัด ทุกรายการอยู่ใน transaction เดียว **ถ้ามีรายการใดสต็อกไม่พอ จะยกเลิกทั้งชุด** สูงสุด 100 รายการต่อครั้ง

```bash
curl -X PATCH http://localhost:3000/api/stock/bulk-adjust \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "product_id": 2, "quantity": -2, "reason": "ใบเบิก #1042" },
      { "product_id": 5, "quantity": -1, "reason": "ใบเบิก #1042" }
    ]
  }'
```

**200 OK** — `{ "data": [ ...ผลลัพธ์แบบเดียวกับ adjust ทีละรายการ... ], "count": 2 }`

---

### GET /api/stock/transactions — ประวัติทั้งระบบ

| Query | หมายเหตุ |
|---|---|
| `product_id` | กรองเฉพาะสินค้าที่ระบุ |
| `type` | `IN` หรือ `OUT` |
| `from`, `to` | วันเวลา ISO เช่น `2026-09-01` หรือ `2026-09-01T00:00:00` |
| `page`, `limit` | `limit` สูงสุด 100 |

```bash
curl "http://localhost:3000/api/stock/transactions?type=OUT&from=2026-09-01&limit=50"
```

---

## 3. กลุ่มสินค้า (Categories)

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/api/categories` | รายการทั้งหมดพร้อม `product_count` |
| POST | `/api/categories` | เพิ่มกลุ่ม ต้องส่ง `name` (≤100) ส่ง `description` ได้ |
| PATCH | `/api/categories/:id` | แก้ `name` หรือ `description` |
| DELETE | `/api/categories/:id` | ลบได้เมื่อไม่มีสินค้าอยู่ในกลุ่ม ไม่งั้น **409** `CATEGORY_IN_USE` |

```bash
curl -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" \
  -d '{ "name": "Networking", "description": "อุปกรณ์เครือข่าย" }'
```

---

## 4. ภาพรวมและสถานะระบบ

### GET /api/summary

ตัวเลขสรุปสำหรับหน้าแรกของ UI

```json
{
  "data": {
    "totals": {
      "total_products": 9, "active_products": 9,
      "low_stock_count": 4, "out_of_stock_count": 1,
      "total_units": 95, "total_stock_value": 382145.00
    },
    "by_category": [ { "id": 1, "name": "IT", "product_count": 4, "units": 41 } ],
    "recent_transactions": [ "..." ]
  }
}
```

### GET /health

ตรวจว่า API และฐานข้อมูลพร้อมใช้งาน — **200** เมื่อปกติ, **503** เมื่อต่อฐานข้อมูลไม่ได้

### GET /api

รายชื่อ endpoint ทั้งหมดของเวอร์ชันที่กำลังรันอยู่

---

## การต่อยอด

ระบบยังไม่มี authentication เพราะโจทย์ไม่ได้กำหนด ถ้าจะใช้งานจริงแนะนำให้เพิ่ม

- JWT หรือ API key ผ่าน header `Authorization` แล้วใช้ค่า user จาก token เติมลงคอลัมน์ `created_by` แทนการรับจาก body
- Rate limiting ที่ระดับ reverse proxy
- สิทธิ์แยกบทบาท เช่น พนักงานคลังปรับสต็อกได้ แต่แก้ราคาทุนไม่ได้
