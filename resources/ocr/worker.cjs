/**
 * عامل OCR مخصّص لـ tesseract.js داخل Electron.
 * داخل Electron يكتشف tesseract.js بيئة "electron" فيحاول جلب ملفات اللغة عبر الشبكة؛ هنا نستبدل fetch
 * بقارئ ملفات محلي حتى تُقرأ resources/tessdata من القرص بلا اتصال بالإنترنت.
 * يُشار إليه عبر خيار workerPath، ويُحدَّد جذر tesseract.js عبر NOVA_TESS_ROOT.
 */
const path = require('node:path')
const fsp = require('node:fs/promises')
const { parentPort } = require('node:worker_threads')

const root = process.env.NOVA_TESS_ROOT
if (!root) throw new Error('NOVA_TESS_ROOT is not set')

const worker = require(path.join(root, 'src', 'worker-script'))
const getCore = require(path.join(root, 'src', 'worker-script', 'node', 'getCore'))
const gunzip = require(path.join(root, 'src', 'worker-script', 'node', 'gunzip'))
const cache = require(path.join(root, 'src', 'worker-script', 'node', 'cache'))

function toLocalPath(url) {
  let p = String(url)
  if (p.startsWith('file://')) p = decodeURIComponent(p.replace(/^file:\/\/\/?/, ''))
  return p.replace(/\//g, path.sep)
}

async function localFetch(url) {
  const target = String(url)
  if (/^https?:\/\//i.test(target)) {
    return { ok: false, status: 0, arrayBuffer: async () => new ArrayBuffer(0), text: async () => 'offline mode: network fetch disabled' }
  }
  const buf = await fsp.readFile(toLocalPath(target))
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }
}

parentPort.on('message', (packet) => {
  worker.dispatchHandlers(packet, (obj) => parentPort.postMessage(obj))
})

worker.setAdapter({
  getCore,
  gunzip,
  fetch: localFetch,
  ...cache
})
