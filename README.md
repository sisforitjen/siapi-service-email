# Dokumentasi API — `service-email`

**Versi:** 1.1.0  
**Base URL:** `http://localhost:5950`  
**Deskripsi:** Service terpusat untuk pengiriman email di sistem SIAPI. Mendukung dua mode pengiriman: `queue` (async, default) dan `direct` (sync, tunggu hasil SMTP). Setiap pengiriman dicatat lengkap di database beserta nama aplikasi pengirim.

---

## Daftar Isi

1. [Autentikasi](#1-autentikasi)
2. [Endpoint: Kirim Email](#2-endpoint-kirim-email)
3. [Endpoint: Daftar Log Email](#3-endpoint-daftar-log-email)
4. [Endpoint: Detail Log Email](#4-endpoint-detail-log-email)
5. [Template yang Tersedia](#5-template-yang-tersedia)
6. [Cara Memanggil dari Service Lain](#6-cara-memanggil-dari-service-lain)
7. [Status Pengiriman](#7-status-pengiriman)
8. [Error Responses](#8-error-responses)
9. [Contoh Kode Integrasi](#9-contoh-kode-integrasi)
10. [Menambah Template Baru](#10-menambah-template-baru)
11. [Environment Variables](#11-environment-variables)

---

## 1. Autentikasi

Semua endpoint menggunakan autentikasi berbasis **API Key** melalui HTTP header.

```
X-Service-Key: <service_key>
```

- Nilai key diambil dari variabel `SERVICE_KEY` di `.env` milik `service-email`.
- Setiap service yang ingin menggunakan wajib menyertakan header ini di setiap request.
- Tambahkan juga header opsional `X-Service-Origin` berisi nama service kamu (untuk keperluan log/audit).

**Contoh:**
```http
POST /api/email/send HTTP/1.1
Host: localhost:5950
Content-Type: application/json
X-Service-Key: <isi_dengan_service_key>
X-Service-Origin: nama-service-kamu
```

> Jika header `X-Service-Key` tidak ada atau salah, semua endpoint akan mengembalikan **401 Unauthorized**.

---

## 2. Endpoint: Kirim Email

### `POST /api/email/send`

Mengirim satu email. Mendukung dua mode: **queue** (async, default) dan **direct** (sync, tunggu hasil SMTP).

**Headers:**

| Header | Wajib | Keterangan |
|---|---|---|
| `Content-Type` | Ya | `application/json` |
| `X-Service-Key` | Ya | API key service-email |
| `X-Service-Origin` | Tidak | Nama service pemanggil (untuk log). Default: `unknown` |
| `X-App-Name` | Tidak | Nama aplikasi/web pengirim (SIAPI, DUMAS, e-Audit, dsb). Prioritas lebih tinggi dari field `app_name` di body |

**Request Body:**

```json
{
  "to": "penerima@kemenag.go.id",
  "subject": "Judul Email",
  "template": "otp-verification",
  "mode": "queue",
  "app_name": "SIAPI",
  "data": {
    "user": { "fullname": "Nama Penerima" },
    "kode_verif": "123456",
    "logo_url": "https://siapi.kemenag.go.id/media/logokma.png"
  }
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `to` | string | Ya | Alamat email penerima yang valid |
| `subject` | string | Ya | Subject email |
| `template` | string | Ya | Nama template (lihat [Template yang Tersedia](#5-template-yang-tersedia)) |
| `mode` | string | Tidak | Mode pengiriman: `queue` (default) atau `direct` (lihat [Mode Pengiriman](#mode-pengiriman)) |
| `app_name` | string | Tidak | Nama aplikasi pengirim. Bisa juga dikirim via header `X-App-Name` (header diprioritaskan) |
| `data` | object | Tidak | Data yang akan di-inject ke template |

---

### Mode Pengiriman

#### `mode: "queue"` (default)

Email dimasukkan ke antrian Redis dan diproses secara asynchronous oleh worker. Response dikembalikan **langsung** tanpa menunggu email benar-benar terkirim. Cocok untuk hampir semua use case.

**Response Sukses (200):**

```json
{
  "status": true,
  "mode": "queue",
  "job_id": 42,
  "message": "Email queued successfully"
}
```

| Field | Keterangan |
|---|---|
| `job_id` | ID integer untuk melacak status pengiriman via endpoint logs |

#### `mode: "direct"`

Email dikirim **langsung ke SMTP** tanpa melalui queue. Response dikembalikan setelah SMTP selesai memproses (berhasil atau gagal). Cocok bila caller butuh konfirmasi langsung bahwa email terkirim (misalnya: endpoint verifikasi yang harus retry jika email gagal).

> **Perhatian:** Mode `direct` memblokir request hingga SMTP merespons. Gunakan hanya jika memang butuh konfirmasi sinkron.

**Response Sukses (200):**

```json
{
  "status": true,
  "mode": "direct",
  "message_id": "<abc123@smtp.kemenag.go.id>",
  "log_id": 42,
  "message": "Email berhasil dikirim"
}
```

| Field | Keterangan |
|---|---|
| `message_id` | ID unik dari SMTP server, konfirmasi email diterima server |
| `log_id` | ID integer log di database untuk referensi |

**Response Gagal SMTP (500):**

```json
{
  "status": false,
  "mode": "direct",
  "log_id": 42,
  "error_message": "SMTP connection refused",
  "message": "Email gagal dikirim"
}
```

---

**Response Gagal (400 — validasi):**

```json
{
  "status": false,
  "errors": ["to harus berupa email yang valid", "template wajib diisi"]
}
```

**Response Gagal (400 — template tidak dikenali):**

```json
{
  "status": false,
  "errors": ["Template 'nama-template' tidak dikenali. Template tersedia: otp-verification, password-changed, raw"]
}
```

**Response Gagal (400 — mode tidak valid):**

```json
{
  "status": false,
  "errors": ["mode harus 'queue' atau 'direct'"]
}
```

---

## 3. Endpoint: Daftar Log Email

### `GET /api/email/logs`

Mengambil daftar log pengiriman email dengan filter dan pagination.

**Headers:**

| Header | Wajib | Keterangan |
|---|---|---|
| `X-Service-Key` | Ya | API key service-email |

**Query Parameters (semua opsional):**

| Parameter | Tipe | Keterangan |
|---|---|---|
| `status` | string | Filter berdasarkan status: `queued`, `sent`, atau `failed` |
| `service_origin` | string | Filter berdasarkan nama service pengirim |
| `app_name` | string | Filter berdasarkan nama aplikasi pengirim (SIAPI, DUMAS, e-Audit, dsb) |
| `date_from` | string | Filter tanggal mulai format `YYYY-MM-DD` |
| `date_to` | string | Filter tanggal akhir format `YYYY-MM-DD` |
| `page` | integer | Halaman ke-berapa. Default: `1` |
| `limit` | integer | Jumlah data per halaman. Default: `20` |

**Contoh Request:**

```
GET /api/email/logs?status=failed&service_origin=account&page=1&limit=10
GET /api/email/logs?app_name=DUMAS&date_from=2026-05-01&date_to=2026-05-17
```

**Response Sukses (200):**

```json
{
  "status": true,
  "data": [
    {
      "id": 1,
      "service_origin": "account",
      "app_name": "SIAPI",
      "to": "user@kemenag.go.id",
      "subject": "Kode Verifikasi Lupa Password - SIAPI",
      "template": "otp-verification",
      "status": "sent",
      "job_id": "1",
      "message_id": "<abc123@smtp.kemenag.go.id>",
      "error_message": null,
      "retry_count": 0,
      "queued_at": "2026-05-16T08:30:00.000Z",
      "sent_at": "2026-05-16T08:30:02.000Z",
      "createdAt": "2026-05-16T08:30:00.000Z",
      "updatedAt": "2026-05-16T08:30:02.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

---

## 4. Endpoint: Detail Log Email

### `GET /api/email/logs/:id`

Mengambil detail satu log email berdasarkan `job_id` yang dikembalikan saat kirim.

**Headers:**

| Header | Wajib |
|---|---|
| `X-Service-Key` | Ya |

**URL Parameter:**

| Parameter | Keterangan |
|---|---|
| `id` | ID integer dari `job_id` yang diperoleh saat POST `/api/email/send` |

**Contoh Request:**

```
GET /api/email/logs/1
```

**Response Sukses (200):**

```json
{
  "status": true,
  "data": {
    "id": 1,
    "service_origin": "account",
    "app_name": "SIAPI",
    "to": "user@kemenag.go.id",
    "subject": "Kode Verifikasi Lupa Password - SIAPI",
    "template": "otp-verification",
    "template_data": {
      "user": { "fullname": "Budi Santoso" },
      "kode_verif": "123456"
    },
    "status": "sent",
    "job_id": "1",
    "message_id": "<abc123@smtp.kemenag.go.id>",
    "error_message": null,
    "retry_count": 0,
    "queued_at": "2026-05-16T08:30:00.000Z",
    "sent_at": "2026-05-16T08:30:02.000Z"
  }
}
```

**Response Gagal (404):**

```json
{
  "status": false,
  "errors": ["Log tidak ditemukan"]
}
```

---

## 5. Template yang Tersedia

Berikut template email yang tersedia beserta variabel data yang dibutuhkan:

### `otp-verification`

Digunakan untuk mengirim kode OTP lupa password.

**Data yang dibutuhkan:**

```json
{
  "user": {
    "fullname": "Nama Lengkap Penerima"
  },
  "kode_verif": "123456",
  "logo_url": "https://siapi.kemenag.go.id/media/logokma.png"
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `user.fullname` | Ya | Nama penerima yang tampil di email |
| `kode_verif` | Ya | Kode OTP 6 digit |
| `logo_url` | Tidak | URL logo header email. Jika kosong, teks "SIAPI" ditampilkan |

---

### `raw`

Digunakan ketika caller ingin mengirim konten HTML bebas tanpa terikat template bawaan.

**Data yang dibutuhkan:**

```json
{
  "html": "<h1>Judul Email</h1><p>Konten bebas dalam format HTML.</p>"
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `html` | Ya | String HTML lengkap yang akan menjadi body email |

**Contoh request:**

```json
{
  "to": "penerima@kemenag.go.id",
  "subject": "Notifikasi Khusus dari Service X",
  "template": "raw",
  "data": {
    "html": "<h2>Halo!</h2><p>Ini notifikasi dari sistem kami.</p>"
  }
}
```

> **Catatan:** Template `raw` cocok untuk email satu-kali atau notifikasi yang desainnya berbeda-beda tiap kali kirim. Untuk email yang dikirim berulang dengan format sama, lebih baik buat template `.hbs` baru agar konsisten.

---

### `password-changed`

Digunakan untuk mengirim notifikasi bahwa password berhasil diubah.

**Data yang dibutuhkan:**

```json
{
  "user": {
    "fullname": "Nama Lengkap Penerima"
  },
  "logo_url": "https://siapi.kemenag.go.id/media/logokma.png"
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `user.fullname` | Ya | Nama penerima yang tampil di email |
| `logo_url` | Tidak | URL logo header email |

---

## 6. Cara Memanggil dari Service Lain

### Setup di `.env` service kamu

Tambahkan dua variabel berikut ke file `.env` service kamu:

```env
EMAIL_SERVICE_URL=http://localhost:5950
EMAIL_SERVICE_KEY=<minta_ke_tim_backend>
```

> Di production, ganti `localhost` dengan hostname/IP server tempat `service-email` berjalan.

### Buat helper function

Buat file `helpers/emailService.js` di service kamu:

```javascript
const axios = require('axios');
require('dotenv').config();

async function sendEmail({ to, subject, template, data, mode, appName }) {
  const url = `${process.env.EMAIL_SERVICE_URL}/api/email/send`;
  const response = await axios.post(url, { to, subject, template, data, mode }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': process.env.EMAIL_SERVICE_KEY,
      'X-Service-Origin': 'nama-service-kamu',  // ganti dengan nama service kamu
      'X-App-Name': appName || process.env.APP_NAME || 'SIAPI',
    },
    timeout: 5000,
  });
  return response.data;
}

module.exports = { sendEmail };
```

### Gunakan di controller

```javascript
const { sendEmail } = require('../helpers/emailService');

// Contoh: kirim OTP
try {
  await sendEmail({
    to: user.email,
    subject: 'Kode Verifikasi - SIAPI',
    template: 'otp-verification',
    data: {
      user: { fullname: user.fullname },
      kode_verif: '123456',
      logo_url: process.env.LOGO_URL,
    },
  });
} catch (err) {
  // Email gagal tidak menghentikan flow utama
  console.error('Email error:', err.message);
}
```

> **Penting:** Selalu bungkus pemanggilan `sendEmail` dalam `try/catch`. Kegagalan pengiriman email tidak boleh menghentikan proses bisnis utama (misalnya login atau submit form).

---

## 7. Status Pengiriman

Setiap email yang dikirim akan memiliki salah satu status berikut:

| Status | Keterangan |
|---|---|
| `queued` | Email masuk queue, menunggu diproses worker |
| `sent` | Email berhasil dikirim via SMTP, ada `message_id` dari server |
| `failed` | Email gagal setelah 3 kali percobaan, lihat `error_message` untuk detail |

**Flow status:**

```
queued → sent       (berhasil pada percobaan ke-1, 2, atau 3)
queued → failed     (gagal setelah 3 kali percobaan dengan backoff 5 menit)
```

**Retry policy:**

| Percobaan | Waktu tunggu sebelum retry |
|---|---|
| Ke-1 | Langsung setelah masuk queue |
| Ke-2 | 5 menit setelah gagal |
| Ke-3 | 10 menit setelah gagal |
| Setelah ke-3 | Status berubah jadi `failed`, tidak ada retry lagi |

---

## 8. Error Responses

| HTTP Code | Kondisi |
|---|---|
| `400 Bad Request` | Validasi gagal (field kurang, email tidak valid, template tidak dikenali) |
| `401 Unauthorized` | `X-Service-Key` tidak ada atau salah |
| `404 Not Found` | Log dengan ID yang diminta tidak ditemukan |
| `500 Internal Server Error` | Error tidak terduga di server |

Format semua error response:

```json
{
  "status": false,
  "errors": ["Pesan error di sini"]
}
```

---

## 9. Contoh Kode Integrasi

### JavaScript / Node.js (axios)

```javascript
const axios = require('axios');

// Mode queue (default) — fire and forget, response langsung
async function kirimOTP(emailTujuan, namaUser, kodeOtp) {
  try {
    const response = await axios.post(
      'http://localhost:5950/api/email/send',
      {
        to: emailTujuan,
        subject: 'Kode Verifikasi Lupa Password - SIAPI',
        template: 'otp-verification',
        data: {
          user: { fullname: namaUser },
          kode_verif: kodeOtp,
          logo_url: 'https://siapi.kemenag.go.id/media/logokma.png',
        },
      },
      {
        headers: {
          'X-Service-Key': process.env.EMAIL_SERVICE_KEY,
          'X-Service-Origin': 'nama-service-saya',
          'X-App-Name': 'SIAPI',
        },
        timeout: 5000,
      }
    );

    console.log('Email queued, job_id:', response.data.job_id);
    return response.data.job_id;
  } catch (err) {
    console.error('Gagal queue email:', err.message);
    // Jangan lempar error — email gagal tidak boleh blokir proses lain
  }
}

// Mode direct — tunggu konfirmasi SMTP
async function kirimEmailLangsung(emailTujuan, subject, htmlContent) {
  const response = await axios.post(
    'http://localhost:5950/api/email/send',
    {
      to: emailTujuan,
      subject,
      template: 'raw',
      mode: 'direct',
      data: { html: htmlContent },
    },
    {
      headers: {
        'X-Service-Key': process.env.EMAIL_SERVICE_KEY,
        'X-Service-Origin': 'nama-service-saya',
        'X-App-Name': 'DUMAS',
      },
      timeout: 15000,  // timeout lebih besar karena menunggu SMTP
    }
  );

  if (!response.data.status) {
    throw new Error(response.data.error_message);
  }
  return response.data.message_id;
}
```

### Cek status email terkirim

```javascript
async function cekStatusEmail(jobId) {
  // jobId adalah integer yang dikembalikan dari POST /api/email/send
  const response = await axios.get(
    `http://localhost:5950/api/email/logs/${jobId}`,
    {
      headers: { 'X-Service-Key': process.env.EMAIL_SERVICE_KEY },
    }
  );
  return response.data.data.status; // 'queued' | 'sent' | 'failed'
}
```

### cURL (untuk testing)

**Kirim email (mode queue — default):**
```bash
curl -X POST http://localhost:5950/api/email/send \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: YOUR_SERVICE_KEY" \
  -H "X-Service-Origin: nama-service-saya" \
  -H "X-App-Name: SIAPI" \
  -d '{
    "to": "penerima@kemenag.go.id",
    "subject": "Test Email",
    "template": "otp-verification",
    "data": {
      "user": {"fullname": "Budi Santoso"},
      "kode_verif": "654321",
      "logo_url": "https://siapi.kemenag.go.id/media/logokma.png"
    }
  }'
```

**Kirim email (mode direct — tunggu konfirmasi):**
```bash
curl -X POST http://localhost:5950/api/email/send \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: YOUR_SERVICE_KEY" \
  -H "X-Service-Origin: nama-service-saya" \
  -H "X-App-Name: DUMAS" \
  -d '{
    "to": "penerima@kemenag.go.id",
    "subject": "Notifikasi Langsung",
    "template": "raw",
    "mode": "direct",
    "data": {
      "html": "<h1>Halo!</h1><p>Email ini dikirim langsung tanpa queue.</p>"
    }
  }'
```

**Lihat semua log email gagal:**
```bash
curl -H "X-Service-Key: YOUR_SERVICE_KEY" \
  "http://localhost:5950/api/email/logs?status=failed&limit=10"
```

**Filter log berdasarkan aplikasi:**
```bash
curl -H "X-Service-Key: YOUR_SERVICE_KEY" \
  "http://localhost:5950/api/email/logs?app_name=DUMAS&date_from=2026-05-01"
```

---

## 10. Menambah Template Baru

Jika kamu perlu template email baru untuk use case lain:

1. **Buat file `.hbs` baru** di `service-email/views/`:
   ```
   service-email/views/nama-template-baru.hbs
   ```

2. **Daftarkan nama template** di `service-email/helpers/mailer.js`, bagian `TEMPLATES`:
   ```javascript
   const TEMPLATES = {
     'otp-verification': fs.readFileSync(...),
     'password-changed': fs.readFileSync(...),
     'nama-template-baru': fs.readFileSync(          // tambahkan di sini
       path.join(__dirname, '../views/nama-template-baru.hbs'),
       'utf8'
     ),
   };
   ```

3. **Daftarkan di** `ALLOWED_TEMPLATES` di `service-email/controllers/EmailController.js`:
   ```javascript
   const ALLOWED_TEMPLATES = ['otp-verification', 'password-changed', 'nama-template-baru'];
   ```

4. Restart service-email.

5. Dokumentasikan variabel `data` yang dibutuhkan template baru di README atau di dokumen ini.

> Template menggunakan sintaks **Handlebars**. Gunakan `{{ variable }}` untuk inject data dan `{{#if variable}}...{{/if}}` untuk kondisional.

---

## 11. Environment Variables

Berikut environment variables yang dibutuhkan oleh `service-email`:

| Variable | Keterangan | Contoh |
|---|---|---|
| `PORT` | Port service berjalan | `5950` |
| `DB_HOST` | Host PostgreSQL | `localhost` |
| `DB_PORT` | Port PostgreSQL | `5432` |
| `DB_NAME` | Nama database | `kemenag_email` |
| `DB_USERNAME` | Username PostgreSQL | `sisforitjen` |
| `DB_PASSWORD` | Password PostgreSQL | _(kosong di lokal)_ |
| `DB_DIALECT` | Dialect Sequelize | `postgres` |
| `REDIS_HOST` | Host Redis | `localhost` |
| `REDIS_PORT` | Port Redis | `6379` |
| `REDIS_PASSWORD` | Password Redis (opsional) | _(kosong jika tidak ada auth)_ |
| `SMTP_HOST` | Host SMTP server | `smtp2.kemenag.go.id` |
| `SMTP_PORT` | Port SMTP | `587` |
| `SMTP_USER` | Username SMTP (email pengirim) | `helpdesk.itjen@kemenag.go.id` |
| `SMTP_PASSWORD` | Password SMTP | _(tanya admin)_ |
| `SENDER_EMAIL` | Email yang tampil sebagai pengirim | `helpdesk.itjen@kemenag.go.id` |
| `SENDER_NAME` | Nama yang tampil sebagai pengirim | `SIAPI Kemenag` |
| `LOGO_URL` | URL logo untuk header template email | `https://siapi.kemenag.go.id/media/logokma.png` |
| `SERVICE_KEY` | Secret key untuk autentikasi service-to-service | _(generate dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)_ |

---

## Catatan Penting

- **Jangan expose** endpoint service-email ke publik/gateway. Service ini hanya untuk komunikasi internal antar service.
- **Jangan simpan** `SERVICE_KEY` di kode sumber — selalu gunakan `.env`.
- Email yang gagal terkirim (mode `queue`) bisa dilihat di log dengan `status=failed` dan akan otomatis di-retry maksimal 3 kali. Tidak perlu implementasi retry di sisi service pemanggil.
- Mode `queue` bersifat **fire-and-forget** — simpan `job_id` jika perlu tracking status.
- Mode `direct` menunggu respons SMTP. Gunakan hanya bila konfirmasi pengiriman langsung benar-benar dibutuhkan, dan set `timeout` yang cukup besar (minimal 10–15 detik).
- Sertakan `X-App-Name` di setiap request agar log bisa difilter per aplikasi (SIAPI, DUMAS, e-Audit, dsb).
