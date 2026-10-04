const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dialog } = require('electron');

const selectedFiles = new Map();
const incomingFiles = new Map();
const CHUNK_LIMIT = 64 * 1024;

function safeName(name) {
  const base = path.basename(String(name || 'file')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  return base && base !== '.' && base !== '..' ? base.slice(0, 180) : 'download';
}

async function hashHandle(handle, size) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(CHUNK_LIMIT);
  for (let offset = 0; offset < size;) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (!bytesRead) throw new Error('The selected file changed or could not be read.');
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return hash.digest('hex');
}

async function selectFiles(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow, { properties: ['openFile', 'multiSelections'] });
  if (result.canceled) return [];
  const selected = [];
  for (const filePath of result.filePaths) {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) { await handle.close(); continue; }
      const id = crypto.randomUUID();
      const sha256 = await hashHandle(handle, stat.size);
      selectedFiles.set(id, { handle, size: stat.size, name: safeName(path.basename(filePath)), lastModified: stat.mtimeMs, sha256 });
      selected.push({ id, name: safeName(path.basename(filePath)), size: stat.size, lastModified: stat.mtimeMs, sha256 });
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  return selected;
}

async function readChunk(id, offset, length) {
  const file = selectedFiles.get(id);
  if (!file) throw new Error('Selected file token is invalid or expired.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size || !Number.isSafeInteger(length) || length < 1 || length > CHUNK_LIMIT) throw new Error('Invalid file chunk range.');
  const buffer = Buffer.alloc(Math.min(length, file.size - offset));
  const { bytesRead } = await file.handle.read(buffer, 0, buffer.length, offset);
  return { bytesRead, data: Uint8Array.from(buffer.subarray(0, bytesRead)).buffer };
}

async function releaseSelectedFile(id) {
  const file = selectedFiles.get(id);
  if (!file) return false;
  selectedFiles.delete(id);
  await file.handle.close();
  return true;
}

async function beginReceive(parentWindow, request) {
  if (!request || !/^[0-9a-f-]{36}$/i.test(request.transferId) || incomingFiles.has(request.transferId)) throw new Error('Invalid file transfer request.');
  if (!Number.isSafeInteger(request.size) || request.size < 0 || request.size > 8 * 1024 ** 4 || !/^[0-9a-f]{64}$/i.test(request.sha256 || '')) throw new Error('File transfer metadata is invalid.');
  const name = safeName(request.name);
  const picked = await dialog.showSaveDialog(parentWindow, { defaultPath: name });
  if (picked.canceled || !picked.filePath) return null;
  const tempPath = `${picked.filePath}.${crypto.randomUUID()}.part`;
  const handle = await fs.promises.open(tempPath, 'wx');
  incomingFiles.set(request.transferId, {
    handle, finalPath: picked.filePath, tempPath, name,
    expectedSize: request.size, expectedHash: request.sha256.toLowerCase(),
    receivedBytes: 0, nextSequence: 0, queue: Promise.resolve(),
  });
  return { transferId: request.transferId, name, chunkLimit: CHUNK_LIMIT };
}

async function writeChunk(request) {
  const receiver = incomingFiles.get(request.transferId);
  if (!receiver || !Number.isSafeInteger(request.sequence) || request.sequence !== receiver.nextSequence) throw new Error('File chunk is out of sequence.');
  const bytes = request.data instanceof Uint8Array ? request.data : request.data instanceof ArrayBuffer ? new Uint8Array(request.data) : null;
  if (!bytes || !bytes.byteLength || bytes.byteLength > CHUNK_LIMIT || receiver.receivedBytes + bytes.byteLength > receiver.expectedSize) throw new Error('File chunk size is invalid.');
  receiver.nextSequence += 1;
  const data = Buffer.from(bytes);
  receiver.queue = receiver.queue.then(async () => {
    let written = 0;
    while (written < data.length) {
      const result = await receiver.handle.write(data, written, data.length - written, receiver.receivedBytes + written);
      if (!result.bytesWritten) throw new Error('The destination file stopped accepting data.');
      written += result.bytesWritten;
    }
    receiver.receivedBytes += data.length;
  });
  await receiver.queue;
  return { receivedBytes: receiver.receivedBytes };
}

async function finishReceive(transferId) {
  const receiver = incomingFiles.get(transferId);
  if (!receiver) throw new Error('File receive operation is no longer active.');
  await receiver.queue;
  await receiver.handle.sync();
  await receiver.handle.close();
  if (receiver.receivedBytes !== receiver.expectedSize) {
    await fs.promises.unlink(receiver.tempPath).catch(() => {});
    incomingFiles.delete(transferId);
    throw new Error('Received file size did not match the advertised size.');
  }
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(receiver.tempPath)) hash.update(chunk);
  if (hash.digest('hex') !== receiver.expectedHash) {
    await fs.promises.unlink(receiver.tempPath).catch(() => {});
    incomingFiles.delete(transferId);
    throw new Error('File integrity verification failed; the partial file was removed.');
  }
  await fs.promises.rename(receiver.tempPath, receiver.finalPath);
  incomingFiles.delete(transferId);
  return { name: receiver.name, size: receiver.receivedBytes };
}

async function cancelReceive(transferId) {
  const receiver = incomingFiles.get(transferId);
  if (!receiver) return false;
  incomingFiles.delete(transferId);
  await receiver.queue.catch(() => {});
  await receiver.handle.close().catch(() => {});
  await fs.promises.unlink(receiver.tempPath).catch(() => {});
  return true;
}

async function dispose() {
  await Promise.all([...selectedFiles.keys()].map(releaseSelectedFile));
  await Promise.all([...incomingFiles.keys()].map(cancelReceive));
}

module.exports = { selectFiles, readChunk, releaseSelectedFile, beginReceive, writeChunk, finishReceive, cancelReceive, dispose };
