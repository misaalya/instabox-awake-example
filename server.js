// wake-box — tombol "bangunkan sandbox" dari browser.
//
// Jalankan DI LUAR sandbox (laptop atau VPS), karena app ini butuh CLI
// `instabox` dan harus hidup walaupun sandbox-nya mati.
//
//   PORT=4000 \
//   MACHINE_ID=<machine-id> \
//   TARGET_URL=https://3000-<machine-id>.instabox.tech \
//   WAKE_CMD="instabox wake <machine-id>" \
//   node server.js
//
// Lalu buka http://127.0.0.1:4000

import http from 'node:http'
import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 4000)
const HOST = process.env.HOST ?? '127.0.0.1'
const MACHINE_ID = process.env.MACHINE_ID ?? ''
// Perintah untuk membangunkan sandbox. `wake` menangani sandbox yang
// pause sendiri karena idle (menunggu sampai jalan, maks 45s); `resume`
// menangani yang di-pause/stop manual.
const WAKE_CMD =
  process.env.WAKE_CMD ??
  (MACHINE_ID ? `instabox wake ${MACHINE_ID} || instabox resume ${MACHINE_ID}` : '')
// URL yang dipakai untuk mengecek "apakah server sudah hidup".
const TARGET_URL = process.env.TARGET_URL ?? ''
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 120_000)
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 2_000)

const startedAt = Date.now()

/** Jalankan satu perintah shell, kembalikan stdout/stderr/exit code. */
function run(cmd) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    exec(cmd, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        command: cmd,
        exitCode: err?.code ?? 0,
        stdout: String(stdout).trim(),
        stderr: String(stderr).trim() || (err && err.killed ? 'timeout' : ''),
        tookMs: Date.now() - t0,
      })
    })
  })
}

/** Satu kali cek: apakah TARGET_URL menjawab 200? */
async function probe() {
  const t0 = Date.now()
  try {
    const res = await fetch(TARGET_URL, { signal: AbortSignal.timeout(10_000) })
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 }
  } catch (err) {
    return { ok: false, status: 0, error: String(err.cause?.code ?? err.message), ms: Date.now() - t0 }
  }
}

/** Cek berulang sampai hidup atau timeout. */
async function waitUntilUp() {
  const deadline = Date.now() + TIMEOUT_MS
  const checks = []
  while (Date.now() < deadline) {
    const r = await probe()
    checks.push(r)
    if (r.ok) return { woke: true, checks }
    await new Promise((res) => setTimeout(res, INTERVAL_MS))
  }
  return { woke: false, checks }
}

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body, null, 2))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = await readFile(path.join(__dirname, 'index.html'), 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(html)
  }

  if (url.pathname === '/config') {
    return json(res, 200, {
      machineId: MACHINE_ID || null,
      wakeCommand: WAKE_CMD || null,
      targetUrl: TARGET_URL || null,
      timeoutMs: TIMEOUT_MS,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    })
  }

  if (url.pathname === '/status') {
    return json(res, 200, await probe())
  }

  if (req.method === 'POST' && url.pathname === '/wake') {
    if (!WAKE_CMD) return json(res, 500, { error: 'WAKE_CMD belum diset' })
    if (!TARGET_URL) return json(res, 500, { error: 'TARGET_URL belum diset' })

    const before = await probe()
    if (before.ok) {
      return json(res, 200, { alreadyUp: true, probe: before })
    }

    const cmd = await run(WAKE_CMD)
    const waited = await waitUntilUp()
    return json(res, waited.woke ? 200 : 504, {
      alreadyUp: false,
      command: cmd,
      wake: waited,
      elapsedMs: cmd.tookMs + waited.checks.reduce((a, c) => a + c.ms, 0),
    })
  }

  json(res, 404, { error: 'not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`wake-box di http://${HOST}:${PORT}`)
  console.log(`  machine : ${MACHINE_ID || '(belum diset)'}`)
  console.log(`  target  : ${TARGET_URL || '(belum diset)'}`)
  console.log(`  wake cmd: ${WAKE_CMD || '(belum diset)'}`)
})
