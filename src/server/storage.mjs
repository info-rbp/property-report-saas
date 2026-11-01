import { HttpError, sha256, safeId } from './security.mjs';
export function objectPrefix(workspaceId, reportId) { return `workspaces/${safeId(workspaceId)}/reports/${safeId(reportId)}/`; }
export function assertObjectScope(key, workspaceId, reportId) {
    if (typeof key !== 'string' || !key.startsWith(objectPrefix(workspaceId, reportId)) || key.includes('..') || key.includes('\\'))
        throw new HttpError(403, 'Object scope is invalid.');
}
export function jpegDimensions(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
        throw new HttpError(415, 'Upload a complete JPEG image.');
    let offset = 2;
    while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 255)
            throw new HttpError(415, 'Invalid JPEG structure.');
        while (bytes[offset] === 255)
            offset++;
        const marker = bytes[offset++];
        if (marker === 0xda || marker === 0xd9)
            break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
            continue;
        const length = (bytes[offset] << 8) | bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length)
            throw new HttpError(415, 'Invalid JPEG segment.');
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
            if (length < 8)
                throw new HttpError(415, 'Invalid JPEG dimensions.');
            const height = (bytes[offset + 3] << 8) | bytes[offset + 4], width = (bytes[offset + 5] << 8) | bytes[offset + 6], channels = bytes[offset + 7];
            if (width < 1 || height < 1 || width > 8000 || height > 8000 || width * height > 25000000 || ![1, 3].includes(channels))
                throw new HttpError(415, 'Image dimensions or colour space are not supported.');
            return { width, height, channels };
        }
        offset += length;
    }
    throw new HttpError(415, 'JPEG image dimensions were not found.');
}
export async function storeMirrored(env, workspaceId, reportId, kind, bytes, mime) {
    if (!env.FILES || !env.BACKUPS)
        throw new HttpError(503, 'Primary and backup storage must be configured.');
    const id = crypto.randomUUID(), prefix = objectPrefix(workspaceId, reportId), hash = await sha256(bytes);
    const objectKey = `${prefix}${kind}/${id}`, backupKey = `${prefix}recovery/${id}-${hash}`;
    const options = { httpMetadata: { contentType: mime }, customMetadata: { sha256: hash, workspaceId, reportId } };
    try {
        const writes = await Promise.allSettled([env.FILES.put(objectKey, bytes, options), env.BACKUPS.put(backupKey, bytes, options)]);
        if (writes.some(result => result.status === 'rejected'))
            throw new Error('storage write failed');
        const [primary, backup] = await Promise.all([env.FILES.head(objectKey), env.BACKUPS.head(backupKey)]);
        if (!primary || !backup || primary.size !== bytes.byteLength || backup.size !== bytes.byteLength || primary.customMetadata?.sha256 !== hash || backup.customMetadata?.sha256 !== hash)
            throw new Error('storage verification failed');
        return { id, objectKey, backupKey, sha256: hash, bytes: bytes.byteLength, mime };
    }
    catch {
        await Promise.allSettled([env.FILES.delete(objectKey), env.BACKUPS.delete(backupKey)]);
        throw new HttpError(503, 'The upload could not be safely stored in both storage locations.');
    }
}
export async function discardUncommitted(env, object) { await Promise.allSettled([env.FILES.delete(object.objectKey), env.BACKUPS.delete(object.backupKey)]); }
export async function readVerified(env, row) {
    assertObjectScope(row.object_key, row.workspace_id, row.report_id);
    const object = await env.FILES.get(row.object_key);
    if (!object)
        throw new HttpError(503, 'The primary file is unavailable. Use the controlled recovery process.');
    if (object.size !== row.bytes || object.size > 16 * 1024 * 1024)
        throw new HttpError(503, 'Stored file size is invalid or exceeds this development build limit.');
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== row.bytes || await sha256(bytes) !== row.sha256)
        throw new HttpError(503, 'Stored file integrity verification failed.');
    return new Response(bytes, { headers: { 'Content-Type': row.mime_type, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' } });
}
export async function restoreVerified(env, row) {
    assertObjectScope(row.object_key, row.workspace_id, row.report_id);
    assertObjectScope(row.backup_key, row.workspace_id, row.report_id);
    const backup = await env.BACKUPS.get(row.backup_key);
    if (!backup || backup.size !== row.bytes || backup.size > 16 * 1024 * 1024)
        throw new HttpError(503, 'A valid recovery copy is not available.');
    const bytes = new Uint8Array(await backup.arrayBuffer());
    if (bytes.length !== row.bytes || await sha256(bytes) !== row.sha256)
        throw new HttpError(503, 'Recovery copy integrity verification failed.');
    // Restores exactly the manifest bytes; it does not alter signed/completed report data.
    await env.FILES.put(row.object_key, bytes, { httpMetadata: { contentType: row.mime_type }, customMetadata: { sha256: row.sha256, workspaceId: row.workspace_id, reportId: row.report_id } });
    const restored = await env.FILES.get(row.object_key);
    if (!restored || restored.size !== row.bytes || await sha256(await restored.arrayBuffer()) !== row.sha256)
        throw new HttpError(503, 'Restored object could not be verified.');
}
