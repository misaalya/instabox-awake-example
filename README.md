# instabox-awake-example

Tombol "bangunkan sandbox" lewat browser. Node murni, **tanpa dependency**.

## Kenapa harus di luar sandbox

Kalau app ini jalan di dalam sandbox, dia mati bersamaan dengan sandbox yang
mau dibangunkan. Jadi jalankan di laptop, VPS kecil, atau Raspberry Pi —
selama mesin itu hidup dan punya CLI `instabox` yang sudah login.

```
[ browser ] → [ wake-box di laptop/VPS ] → `instabox start <id>` → sandbox nyala
                        ↓
                  polling URL sampai 200
```

## Pakai

```bash
cd wake-box

MACHINE_ID=<machine-id> \
TARGET_URL=https://3000-<machine-id>.instabox.tech \
WAKE_CMD="instabox start <machine-id>" \
node server.js
```

Buka <http://127.0.0.1:4000> lalu klik **Bangunkan sandbox**.

### Cek dulu perintah wake-nya

`WAKE_CMD` sengaja dibuat bebas, karena nama subcommand-nya belum tentu
`start`. Cek dulu di mesinmu:

```bash
instabox --help
```

Kalau ternyata tidak ada `start`, kemungkinan opsi lain:

- `instabox resume <id>`
- `instabox up <id>`
- `instabox ssh <id>` (sering otomatis membangunkan, tapi ini interaktif/blokir)

Karena `WAKE_CMD` dijalankan lewat shell, kamu bisa merangkai apa saja,
misalnya `WAKE_CMD="instabox start m_xxx && echo woke"`.

## Environment variable

| Nama | Default | Arti |
| --- | --- | --- |
| `PORT` | `4000` | port HTTP |
| `HOST` | `127.0.0.1` | bind address; pakai `0.0.0.0` kalau di VPS |
| `MACHINE_ID` | — | dipakai kalau `WAKE_CMD` tidak diset |
| `WAKE_CMD` | `instabox start <MACHINE_ID>` | perintah untuk bangunkan |
| `TARGET_URL` | — | URL yang di-poll sampai menjawab 200 |
| `TIMEOUT_MS` | `120000` | batas tunggu total |
| `INTERVAL_MS` | `2000` | jeda antar-poll |

## Endpoint

- `GET /` — halaman tombol
- `GET /status` — satu kali probe ke `TARGET_URL`
- `GET /config` — config aktif (tanpa secret)
- `POST /wake` — jalankan `WAKE_CMD`, lalu poll sampai hidup
  - `200` `{ alreadyUp: true }` kalau sudah hidup
  - `200` `{ wake: { woke: true, checks: [...] } }` kalau berhasil dibangunkan
  - `504` `{ wake: { woke: false } }` kalau timeout

## Keamanan

Default `HOST=127.0.0.1` supaya tidak sengaja terbuka ke jaringan. Kalau
dipasang di VPS dan diakses dari internet, **wajib** tambahkan autentikasi
(reverse proxy dengan basic auth, Cloudflare Access, atau token di header).
Tanpa itu, siapa pun bisa menyalakan sandbox kamu — dan itu biaya.

## Setelah sandbox hidup

App ini tidak perlu menyalakan server-nya. Di dalam sandbox, Vite sudah
dikelola systemd:

```bash
systemctl status vite-demo
```

Jadi begitu sandbox boot, Vite nyala sendiri dan `TARGET_URL` langsung 200.
