import { HttpError, json, jsonBody, text, safeId, nowSeconds, limitedBytes, sha256, rateLimit } from './security.mjs';
import { membership, auditStatement, monthStart } from './db.mjs';
import { requireRole, requireWritePlan, readiness } from './plans.mjs';
import { REPORT_TYPES, DEFAULT_AREAS } from '../shared/catalogue.mjs';
import { seedForm1, form1Issues } from '../shared/form1.mjs';
import { cleanupStatements, drainCleanup } from './recovery.mjs';
import { renderIssuedPdf } from './renderer.mjs';
import { queueArchiveStatement } from './archive.mjs';
import catalogueData from '../../generated/catalogue.json' with { type: 'json' };
import { storeMirrored, discardUncommitted, readVerified, jpegDimensions } from './storage.mjs';
export function perthDate() {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = kind => parts.find(p => p.type === kind).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}
function dateValid(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
const DETAIL_FIELDS = ['formName', 'formNumber', 'actNotice', 'waFormVersion', 'inspectingAgent', 'inspectionDate', 'tenancyStartDate', 'leaseExpiryDate', 'rentReviewDate', 'currentRentalAmount', 'tenants', 'tenantReceivedDate', 'reportReturnDate', 'paintingPremisesExternalDate', 'paintingPremisesInternalDate', 'floorcoveringsLaidDate', 'floorcoveringsCleanedDate', 'additionalComments', 'maintenanceComments', 'clientName', 'siteContact', 'referenceNumber', 'inspectionPurpose', 'issueSummary', 'observedCondition', 'urgency', 'recommendedAction', 'actionRequired', 'contractorName', 'workOrderReference', 'workDescription', 'completionDate', 'verificationOutcome', 'incidentDate', 'incidentTime', 'incidentCategory', 'incidentDescription', 'immediateActions', 'accessDetails', 'meterReadings', 'keysAccessDevices', 'outstandingItems', 'buildingSummary', 'buildingName', 'strataPlan', 'reportingPeriod', 'contractorAttendance', 'residentMatters', 'worksCompleted', 'mattersForApproval', 'nextReviewDate', 'annualSummaryPeriod', 'agentSignName', 'agentSignDate', 'tenant1SignName', 'tenant2SignName', 'tenant3SignName', 'disclaimerText', 'keySafeLocation', 'keySafeModel', 'installationMethod', 'installationOutcome', 'codeHandlingNote', 'keyReceiptTime'];
export function sanitizeReport(input, type, property, brand) {
    if (!input || typeof input !== 'object' || !input.details || !Array.isArray(input.areas))
        throw new HttpError(400, 'Report details and areas are required.');
    const details = { reportType: type, propertyAddress: property.address, ...brand };
    for (const field of DETAIL_FIELDS)
        if (input.details[field] !== undefined)
            details[field] = text(input.details[field], 10000);
    for(const field of ['inspectionDate','tenancyStartDate','leaseExpiryDate','rentReviewDate','tenantReceivedDate','reportReturnDate','completionDate','incidentDate','nextReviewDate','agentSignDate']){if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(details[field]||'')){const [day,month,year]=details[field].split('/');details[field]=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;}if(details[field]&&!dateValid(details[field]))throw new HttpError(400,`Enter a valid date for ${field}.`);}
    if (details.inspectionDate && !dateValid(details.inspectionDate))
        throw new HttpError(400, 'Inspection date must be a valid YYYY-MM-DD date.');
    if (input.areas.length > 100)
        throw new HttpError(400, 'Too many report areas.');
    const areaIds = new Set(), itemIds = new Set();
    let itemCount = 0;
    const areas = input.areas.map(area => {
        const id = safeId(area.id), name = text(area.name, 200, true);
        if (areaIds.has(id))
            throw new HttpError(400, 'Duplicate area identifier.');
        areaIds.add(id);
        if (!Array.isArray(area.items) || area.items.length > 500)
            throw new HttpError(400, 'Invalid report items.');
        itemCount += area.items.length;
        if (itemCount > 5000)
            throw new HttpError(400, 'Too many report items.');
        const out = { id, name, items: area.items.map(item => {
                const id = safeId(item.id);
                if (itemIds.has(id))
                    throw new HttpError(400, 'Duplicate item identifier.');
                itemIds.add(id);
                const out = { id, name: text(item.name, 200, true), agentComments: text(item.agentComments, 10000), tenantComments: text(item.tenantComments, 10000) };
                for (const flag of ['clean', 'undamaged', 'working', 'tenantAgrees', 'maintenanceRequired'])
                    if (item[flag] !== undefined) {
                        if (![true, false, null].includes(item[flag]))
                            throw new HttpError(400, 'Invalid condition rating.');
                        out[flag] = item[flag];
                    }
                for (const field of ['statutoryKey', 'activityDate', 'activityTime', 'activityParty', 'actionComments', 'status', 'dueDate', 'maintenanceCommentary', 'quantity', 'identifier'])
                    if (item[field] !== undefined)
                        out[field] = text(item[field], 10000);
                return out;
            }) };
        if (area.statutorySection !== undefined) {
            if (!Number.isInteger(area.statutorySection))
                throw new HttpError(400, 'Invalid statutory section.');
            out.statutorySection = area.statutorySection;
        }
        return out;
    });
    const result = { schemaVersion: 5, details, areas, photos: [] };
    const issues = form1Issues(result);
    if (issues.length)
        throw new HttpError(400, issues.slice(0, 3).join(' '), 'form1_content_protected');
    return result;
}
export function expectedRevision(request, body = {}) {
    const header = request.headers.get('if-match');
    const value = body.expectedRevision ?? (header ? Number(header.replaceAll('"', '')) : undefined);
    if (!Number.isSafeInteger(value) || value < 1)
        throw new HttpError(428, 'A current report revision is required.', 'revision_required');
    return value;
}
async function getProperty(db, workspaceId, id) {
    const property = await db.prepare('SELECT * FROM properties WHERE workspace_id=? AND id=?').bind(workspaceId, id).first();
    if (!property)
        throw new HttpError(404, 'Property not found.');
    return property;
}
export async function getReport(db, workspaceId, id) {
    const row = await db.prepare('SELECT * FROM reports WHERE workspace_id=? AND id=?').bind(workspaceId, id).first();
    if (!row)
        throw new HttpError(404, 'Report not found.');
    return row;
}
export async function hydrate(db, row) {
    const data = JSON.parse(row.report_data), objects = (await db.prepare('SELECT * FROM objects WHERE workspace_id=? AND report_id=? ORDER BY created_at,id').bind(row.workspace_id, row.id).all()).results;
    const base = `/api/reports/${encodeURIComponent(row.id)}`;
    return { ...data, id: row.id, propertyId: row.property_id, status: row.status, revision: row.revision, createdAt: new Date(row.created_at * 1000).toISOString(), updatedAt: new Date(row.updated_at * 1000).toISOString(),
        parentReportId: row.parent_report_id, correctionReason: row.correction_reason,
        details: { ...data.details, companyLogoUrl:data.details.companyLogoAssetId?`/api/workspaces/${row.workspace_id}/assets/${data.details.companyLogoAssetId}`:undefined, coverPhotoUrl: objects.some(o => o.kind === 'cover') ? `${base}/cover?workspace=${row.workspace_id}` : undefined },
        photos: objects.filter(o => o.kind === 'photo').map((o,index) => { const meta=JSON.parse(o.metadata_json),area=data.areas.find(a=>a.id===meta.areaId),item=area?.items.find(i=>i.id===meta.itemId);return { id:o.id,...meta,areaName:area?.name||meta.areaName,itemName:item?.name||meta.itemName,photoIndex:index+1,url:`${base}/photos/${o.id}?workspace=${row.workspace_id}` }; }) };
}
function assertDraft(row) { if (row.status !== 'draft')
    throw new HttpError(409, 'Completed reports are immutable. Create a correction instead.', 'report_immutable'); }
export async function reportRoutes(request, env, user) {
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), method = request.method;
    if (parts[0] !== 'api' || !['properties', 'reports', 'templates', 'catalogue'].includes(parts[1]))
        return null;
    const header = request.headers.get('x-workspace-id'), query = url.searchParams.get('workspace');
    if (header && query && header !== query)
        throw new HttpError(400, 'Conflicting workspace context.');
    const workspaceId = header || query, workspace = await membership(env.DB, user.id, workspaceId), brand = JSON.parse(workspace.branding_json || '{}');
    if (method !== 'GET')
        requireRole(workspace.role, 'write');
    if (parts[1] === 'catalogue' && method === 'GET')
        return json(REPORT_TYPES);
    if (parts[1] === 'properties' && parts.length === 2 && method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM properties WHERE workspace_id=? AND id>? AND archived_at IS NULL ORDER BY id LIMIT 200').bind(workspaceId, url.searchParams.get('after') || '').all();
        return json({ properties: rows.results, next: rows.results.length === 200 ? rows.results.at(-1).id : null });
    }
    if (parts[1] === 'properties' && parts.length === 2 && method === 'POST') {
        const access = await requireWritePlan(env.DB, workspaceId), body = await jsonBody(request, 16384), id = crypto.randomUUID(), now = nowSeconds(), address = text(body.address, 500, true);
        const normalized = address.toLocaleLowerCase('en-AU').replace(/\s+/g, ' ');
        const result = await env.DB.prepare(`INSERT INTO properties(workspace_id,id,address,normalized_address,reference,notes,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM properties WHERE workspace_id=? AND archived_at IS NULL)<?`).bind(workspaceId, id, address, normalized, text(body.reference, 200), text(body.notes, 5000), now, now, workspaceId, access.limits.properties).run();
        if (!result.meta.changes)
            throw new HttpError(409, 'The property limit for this plan has been reached.', 'property_limit');
        await auditStatement(env.DB, workspaceId, user.id, 'property.created', id).run();
        return json(await getProperty(env.DB, workspaceId, id), 201);
    }
    if (parts[1] === 'properties' && parts[2]) {
        const id = safeId(parts[2]), property = await getProperty(env.DB, workspaceId, id);
        if (parts.length === 3 && method === 'GET') {
            const rows = await env.DB.prepare('SELECT id,report_type,status,revision,created_at,updated_at,parent_report_id FROM reports WHERE workspace_id=? AND property_id=? ORDER BY updated_at DESC LIMIT 200').bind(workspaceId, id).all();
            return json({ property, reports: rows.results });
        }
        if (parts.length === 3 && method === 'PUT') {
            await requireWritePlan(env.DB, workspaceId);
            const body = await jsonBody(request, 16384), address = text(body.address, 500, true);
            await env.DB.batch([env.DB.prepare('UPDATE properties SET address=?,normalized_address=?,reference=?,notes=?,updated_at=? WHERE workspace_id=? AND id=?').bind(address, address.toLocaleLowerCase('en-AU').replace(/\s+/g, ' '), text(body.reference, 200), text(body.notes, 5000), nowSeconds(), workspaceId, id), auditStatement(env.DB, workspaceId, user.id, 'property.updated', id)]);
            return json(await getProperty(env.DB, workspaceId, id));
        }
        if (parts[3] === 'archive' && method === 'POST') {
            requireRole(workspace.role, 'admin');
            await env.DB.batch([env.DB.prepare('UPDATE properties SET archived_at=? WHERE workspace_id=? AND id=?').bind(nowSeconds(), workspaceId, id), auditStatement(env.DB, workspaceId, user.id, 'property.archived', id)]);
            return json({ success: true });
        }
        if (parts[3] === 'reports' && parts.length === 4 && method === 'POST') {
            if (property.archived_at)
                throw new HttpError(409, 'Restore the property before adding reports.');
            const access = await requireWritePlan(env.DB, workspaceId), body = await jsonBody(request), type = body.reportType;
            if (!Object.hasOwn(REPORT_TYPES, type))
                throw new HttpError(400, 'Unknown report type.');
            const reportId = crypto.randomUUID(), now = nowSeconds();
            let data = { details: { reportType:type, formName:REPORT_TYPES[type], inspectionDate:perthDate(), inspectingAgent:user.email,tenancyStartDate:'',tenants:'',reportReturnDate:'',additionalComments:'',agentSignName:'',agentSignDate:perthDate(),disclaimerText:catalogueData[type]?.disclaimer||'This report records visible conditions observed at the time of inspection and should be read together with the photographs and commentary. It is not a structural, engineering or specialist compliance certification.' }, areas:(catalogueData[type]?.areas?.length?catalogueData[type].areas:DEFAULT_AREAS[type]||['Findings']).map(name=>({id:crypto.randomUUID(),name,items:[]})),photos:[] };
            if(body.templateId){const template=await env.DB.prepare('SELECT * FROM templates WHERE workspace_id=? AND id=?').bind(workspaceId,safeId(body.templateId)).first();if(!template||template.report_type!==type||(template.property_id&&template.property_id!==property.id))throw new HttpError(404,'Matching saved template not found.');data=JSON.parse(template.template_data);for(const area of data.areas){area.id=crypto.randomUUID();for(const item of area.items)item.id=crypto.randomUUID();}data.details.inspectionDate=perthDate();data.details.inspectingAgent=user.email;}
            if (type === 'Entry' && !body.templateId)
                data = seedForm1({ details: data.details, areas: [], photos: [] });
            if (body.report)
                data = body.report;
            data = sanitizeReport(data, type, property, brand);
            const inserted = await env.DB.prepare(`INSERT INTO reports(workspace_id,id,property_id,report_type,report_data,created_at,updated_at,created_by)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM reports WHERE workspace_id=? AND created_at>=?)<?`).bind(workspaceId, reportId, id, type, JSON.stringify(data), now, now, user.id, workspaceId, monthStart(), access.limits.reportsPerMonth).run();
            if (!inserted.meta.changes)
                throw new HttpError(409, 'The monthly report limit has been reached.', 'report_limit');
            await auditStatement(env.DB, workspaceId, user.id, 'report.created', reportId, { type }).run();
            return json(await hydrate(env.DB, await getReport(env.DB, workspaceId, reportId)), 201);
        }
    }
    if (parts[1] === 'reports' && parts[2]) {
        const id = safeId(parts[2]), row = await getReport(env.DB, workspaceId, id);
        if (parts.length === 3 && method === 'GET')
            return json(await hydrate(env.DB, row), 200, { ETag: `"${row.revision}"` });
        if (parts.length === 3 && method === 'PUT') {
            assertDraft(row);
            await requireWritePlan(env.DB, workspaceId);
            const body = await jsonBody(request), expected = expectedRevision(request, body), property = await getProperty(env.DB, workspaceId, row.property_id);
            const data = sanitizeReport(body.report, row.report_type, property, brand);
            // Existing photographs must remain attached to a valid item/area after every edit.
            const photos = (await env.DB.prepare("SELECT metadata_json FROM objects WHERE workspace_id=? AND report_id=? AND kind='photo'").bind(workspaceId, id).all()).results;
            for (const photo of photos) {
                const meta = JSON.parse(photo.metadata_json), area = data.areas.find(a => a.id === meta.areaId);
                if (!area || (meta.itemId && !area.items.some(i => i.id === meta.itemId)))
                    throw new HttpError(409, 'Move or remove linked photos before deleting their area or item.');
            }
            const result = await env.DB.prepare("UPDATE reports SET report_data=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND status='draft' AND revision=?").bind(JSON.stringify(data), nowSeconds(), workspaceId, id, expected).run();
            if (!result.meta.changes)
                throw new HttpError(409, 'This report changed. Reload it; your submitted changes were not applied.', 'revision_conflict');
            await auditStatement(env.DB, workspaceId, user.id, 'report.updated', id, { fromRevision: expected }).run();
            return json(await hydrate(env.DB, await getReport(env.DB, workspaceId, id)));
        }
        if (parts.length === 3 && method === 'DELETE') {
            assertDraft(row);
            if (workspace.legal_hold)
                throw new HttpError(409, 'Deletion is blocked by a retention hold.');
            const expected = expectedRevision(request), token = crypto.randomUUID();
            const changes = await env.DB.batch([
                env.DB.prepare("UPDATE reports SET write_token=? WHERE workspace_id=? AND id=? AND status='draft' AND revision=?").bind(token, workspaceId, id, expected),
                ...cleanupStatements(env.DB, workspaceId, id, user.id, token),
                env.DB.prepare('DELETE FROM objects WHERE workspace_id=? AND report_id=? AND EXISTS(SELECT 1 FROM reports WHERE workspace_id=? AND id=? AND write_token=?)').bind(workspaceId, id, workspaceId, id, token),
                env.DB.prepare('DELETE FROM reports WHERE workspace_id=? AND id=? AND write_token=?').bind(workspaceId, id, token)
            ]);
            if (!changes[0].meta.changes)
                throw new HttpError(409, 'Report revision conflict.', 'revision_conflict');
            // No bucket-wide deletion. Recovery copies are governed by the approved backup-retention schedule.
            await auditStatement(env.DB, workspaceId, user.id, 'report.draft_deleted', id).run();
            await drainCleanup(env, workspaceId);
            return json({ success: true, storageCleanupQueued: true });
        }
        if (parts[3] === 'corrections' && method === 'POST') {
            if (row.status !== 'completed')
                throw new HttpError(409, 'Only issued reports have a correction workflow.');
            const access = await requireWritePlan(env.DB, workspaceId), body = await jsonBody(request, 16384), reason = text(body.reason, 2000, true), newId = crypto.randomUUID(), now = nowSeconds();
            const property = await getProperty(env.DB, workspaceId, row.property_id), data = JSON.parse(row.report_data);
            data.details.inspectionDate = perthDate();
            data.details.agentSignName = '';
            data.details.agentSignDate = '';
            delete data.execution;
            const sanitized = sanitizeReport(data, row.report_type, property, brand);
            const result = await env.DB.prepare(`INSERT INTO reports(workspace_id,id,property_id,report_type,report_data,parent_report_id,correction_reason,created_at,updated_at,created_by)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM reports WHERE workspace_id=? AND created_at>=?)<?`).bind(workspaceId, newId, row.property_id, row.report_type, JSON.stringify(sanitized), id, reason, now, now, user.id, workspaceId, monthStart(), access.limits.reportsPerMonth).run();
            if (!result.meta.changes)
                throw new HttpError(409, 'The monthly report limit has been reached.');
            await auditStatement(env.DB, workspaceId, user.id, 'report.correction_created', newId, { original: id, reason }).run();
            return json({ report: await hydrate(env.DB, await getReport(env.DB, workspaceId, newId)), notice: 'The original report remains unchanged. Reattach evidence deliberately; photos and signatures are not silently copied.' }, 201);
        }
        if (['photos', 'cover'].includes(parts[3]) && method === 'POST') {
            assertDraft(row);
            const access = await requireWritePlan(env.DB, workspaceId), expected = expectedRevision(request), isCover = parts[3] === 'cover';
            const bytes = await limitedBytes(request, 5 * 1024 * 1024), dimensions = jpegDimensions(bytes);
            const data = JSON.parse(row.report_data), areaId = url.searchParams.get('areaId'), itemId = url.searchParams.get('itemId'), area = data.areas.find(a => a.id === areaId);
            if (!isCover && (!area || (itemId && !area.items.some(i => i.id === itemId))))
                throw new HttpError(400, 'Choose an existing report area and item.');
            if (!isCover && ['BuildingManagementDaily', 'BuildingManagementMonthly', 'UpdatedBusinessManagement', 'KeyReceipt'].includes(row.report_type) && !itemId)
                throw new HttpError(400, 'This report requires photographs to be linked to individual items.');
            const clientKey=request.headers.get('idempotency-key')?safeId(request.headers.get('idempotency-key')):null;
            if(clientKey){const prior=await env.DB.prepare('SELECT sha256,metadata_json FROM objects WHERE workspace_id=? AND report_id=? AND client_key=?').bind(workspaceId,id,clientKey).first();if(prior){const meta=JSON.parse(prior.metadata_json);if(prior.sha256!==await sha256(bytes)||meta.areaId!==(area?.id||null)||meta.itemId!==(itemId||null))throw new HttpError(409,'Upload key already used for different content.');return json(await hydrate(env.DB,row));}}
            if (isCover && await env.DB.prepare("SELECT id FROM objects WHERE workspace_id=? AND report_id=? AND kind='cover'").bind(workspaceId, id).first())
                throw new HttpError(409, 'Remove the current cover before replacing it.');
            const object = await storeMirrored(env, workspaceId, id, isCover ? 'cover' : 'photo', bytes, 'image/jpeg'), writeToken = crypto.randomUUID(), now = nowSeconds();
            const metadata = { ...dimensions, areaId: area?.id || null, areaName: area?.name || '', itemId: itemId || null, itemName: area?.items.find(i => i.id === itemId)?.name || '', name: text(url.searchParams.get('name') || 'Inspection photograph', 200) };
            try {
                const results = await env.DB.batch([
                    env.DB.prepare("UPDATE reports SET revision=revision+1,write_token=?,updated_at=? WHERE workspace_id=? AND id=? AND status='draft' AND revision=? AND (SELECT COALESCE(SUM(bytes),0) FROM workspace_storage WHERE workspace_id=?)+?<=?").bind(writeToken, now, workspaceId, id, expected, workspaceId, bytes.length, access.limits.bytes),
                    env.DB.prepare(`INSERT INTO objects(workspace_id,id,report_id,kind,object_key,backup_key,sha256,bytes,mime_type,metadata_json,created_at,client_key)
            SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reports WHERE workspace_id=? AND id=? AND write_token=?)`).bind(workspaceId, object.id, id, isCover ? 'cover' : 'photo', object.objectKey, object.backupKey, object.sha256, object.bytes, object.mime, JSON.stringify(metadata), now, clientKey, workspaceId, id, writeToken),
                    queueArchiveStatement(env.DB,workspaceId,id,object)
                ]);
                if (!results[0].meta.changes)
                    throw new HttpError(409, 'The report changed or the storage limit was reached.', 'revision_or_quota_conflict');
            }
            catch (e) {
                await discardUncommitted(env, object);
                throw e;
            }
            await auditStatement(env.DB, workspaceId, user.id, 'report.photo_added', object.id, { reportId: id }).run();
            return json(await hydrate(env.DB, await getReport(env.DB, workspaceId, id)), 201);
        }
        if(parts[3]==='photos' && parts[4] && method==='PATCH'){
            assertDraft(row);await requireWritePlan(env.DB,workspaceId);
            const body=await jsonBody(request,8192),expected=expectedRevision(request,body),photoId=safeId(parts[4]);
            const photo=await env.DB.prepare("SELECT * FROM objects WHERE workspace_id=? AND report_id=? AND id=? AND kind='photo'").bind(workspaceId,id,photoId).first();
            if(!photo)throw new HttpError(404,'Photo not found.');
            const data=JSON.parse(row.report_data),area=data.areas.find(a=>a.id===body.areaId),item=area?.items.find(i=>i.id===body.itemId);
            if(!area||(body.itemId&&!item))throw new HttpError(400,'Select a current area and item.');
            if(['BuildingManagementDaily','BuildingManagementMonthly','UpdatedBusinessManagement','KeyReceipt','Custom'].includes(row.report_type)&&!item)throw new HttpError(400,'This report requires item-linked evidence.');
            const token=crypto.randomUUID(),meta={...JSON.parse(photo.metadata_json),areaId:area.id,areaName:area.name,itemId:item?.id||null,itemName:item?.name||'',name:text(body.name||JSON.parse(photo.metadata_json).name,200,true)};
            const changed=await env.DB.batch([
                env.DB.prepare("UPDATE reports SET revision=revision+1,write_token=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND status='draft'").bind(token,nowSeconds(),workspaceId,id,expected),
                env.DB.prepare('UPDATE objects SET metadata_json=? WHERE workspace_id=? AND id=? AND EXISTS(SELECT 1 FROM reports WHERE workspace_id=? AND id=? AND write_token=?)').bind(JSON.stringify(meta),workspaceId,photoId,workspaceId,id,token)
            ]);
            if(!changed[0].meta.changes)throw new HttpError(409,'Report revision conflict.','revision_conflict');
            await auditStatement(env.DB,workspaceId,user.id,'report.photo_moved',photoId).run();
            return json(await hydrate(env.DB,await getReport(env.DB,workspaceId,id)));
        }
        if (['photos', 'cover', 'pdf'].includes(parts[3]) && method === 'GET') {
            const object = parts[3] === 'photos'
                ? await env.DB.prepare("SELECT * FROM objects WHERE workspace_id=? AND report_id=? AND id=? AND kind='photo'").bind(workspaceId, id, safeId(parts[4])).first()
                : await env.DB.prepare('SELECT * FROM objects WHERE workspace_id=? AND report_id=? AND kind=? ORDER BY created_at DESC LIMIT 1').bind(workspaceId, id, parts[3]).first();
            if (!object)
                throw new HttpError(404, 'File not found.');
            return readVerified(env, object);
        }
        if ((parts[3] === 'photos' && parts[4] || parts[3] === 'cover') && method === 'DELETE') {
            assertDraft(row);
            if (workspace.legal_hold)
                throw new HttpError(409, 'Deletion is blocked by a retention hold.');
            const expected = expectedRevision(request), objectId = parts[3]==='cover'?(await env.DB.prepare("SELECT id FROM objects WHERE workspace_id=? AND report_id=? AND kind='cover'").bind(workspaceId,id).first())?.id:safeId(parts[4]), token = crypto.randomUUID();
            if(!objectId)throw new HttpError(404,'Photo not found.');
            const object = await env.DB.prepare("SELECT * FROM objects WHERE workspace_id=? AND report_id=? AND id=? AND kind<>'pdf'").bind(workspaceId, id, objectId).first();
            if (!object)
                throw new HttpError(404, 'Photo not found.');
            const changes = await env.DB.batch([
                env.DB.prepare("UPDATE reports SET revision=revision+1,write_token=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND status='draft'").bind(token, nowSeconds(), workspaceId, id, expected),
                ...cleanupStatements(env.DB, workspaceId, id, user.id, token, objectId),
                env.DB.prepare('DELETE FROM objects WHERE workspace_id=? AND id=? AND report_id=? AND EXISTS(SELECT 1 FROM reports WHERE workspace_id=? AND id=? AND write_token=?)').bind(workspaceId, objectId, id, workspaceId, id, token)
            ]);
            if (!changes[0].meta.changes)
                throw new HttpError(409, 'Report revision conflict.', 'revision_conflict');
            await drainCleanup(env, workspaceId);
            await auditStatement(env.DB, workspaceId, user.id, 'report.photo_removed', objectId).run();
            return json(await hydrate(env.DB, await getReport(env.DB, workspaceId, id)));
        }
        if(parts[3]==='preview' && method==='GET'){
            await rateLimit(env.DB,`render:${user.id}:${workspaceId}`,20,300);
            const bytes=await renderIssuedPdf(env,row,{testOnly:true});
            return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="draft-report.pdf"'}});
        }
        if (parts[3] === 'complete' && method === 'POST') {
            assertDraft(row);
            const access=await requireWritePlan(env.DB,workspaceId),body=await jsonBody(request,8192),expected=expectedRevision(request,body);
            if(expected!==row.revision)throw new HttpError(409,'Report revision conflict.','revision_conflict');
            if(body.confirm!==true)throw new HttpError(400,'Explicit finalisation confirmation is required.');
            const production=env.ENVIRONMENT==='production';
            if(production ? !(await readiness(env)).ready : env.ENABLE_STAGING_ISSUE!=='true')throw new HttpError(503,'Report issuing requires release acceptance or explicit staging test mode.','renderer_acceptance_required');
            await rateLimit(env.DB,`render:${user.id}:${workspaceId}`,20,300);
            const bytes=await renderIssuedPdf(env,row,{testOnly:!production});
            const object=await storeMirrored(env,workspaceId,id,'pdf',bytes,'application/pdf'),token=crypto.randomUUID(),now=nowSeconds();
            try{
                const result=await env.DB.batch([
                    env.DB.prepare("UPDATE reports SET status='completed',revision=revision+1,pdf_key=?,pdf_sha256=?,issued_at=?,content_sha256=?,write_token=?,updated_at=? WHERE workspace_id=? AND id=? AND status='draft' AND revision=? AND (SELECT COALESCE(SUM(bytes),0) FROM workspace_storage WHERE workspace_id=?)+?<=?").bind(object.objectKey,object.sha256,now,await sha256(row.report_data),token,now,workspaceId,id,expected,workspaceId,object.bytes,access.limits.bytes),
                    env.DB.prepare("INSERT INTO objects(workspace_id,id,report_id,kind,object_key,backup_key,sha256,bytes,mime_type,metadata_json,created_at) SELECT ?,?,?,'pdf',?,?,?,?,?,'{}',? WHERE EXISTS(SELECT 1 FROM reports WHERE workspace_id=? AND id=? AND write_token=?)").bind(workspaceId,object.id,id,object.objectKey,object.backupKey,object.sha256,object.bytes,object.mime,now,workspaceId,id,token),
                    queueArchiveStatement(env.DB,workspaceId,id,object)
                ]);
                if(!result[0].meta.changes)throw new HttpError(409,'The report changed during rendering or the storage limit was reached.','revision_or_quota_conflict');
            }catch(error){await discardUncommitted(env,object);throw error;}
            await auditStatement(env.DB,workspaceId,user.id,'report.issued',id,{revision:expected,pdfSha256:object.sha256,testOnly:!production}).run();
            return json(await hydrate(env.DB,await getReport(env.DB,workspaceId,id)));
        }
        if(parts[3]==='publish')throw new HttpError(410,'Legacy ProInspect publication is not part of this independent SaaS.');
    }
    if (parts[1] === 'templates') {
        if (method === 'GET' && parts.length === 2) {
            const propertyId=url.searchParams.get('propertyId');
            const rows = propertyId?await env.DB.prepare('SELECT * FROM templates WHERE workspace_id=? AND (property_id IS NULL OR property_id=?) ORDER BY name LIMIT 200').bind(workspaceId,safeId(propertyId)).all():await env.DB.prepare('SELECT * FROM templates WHERE workspace_id=? ORDER BY name LIMIT 200').bind(workspaceId).all();
            return json(rows.results);
        }
        if (method === 'POST' && parts.length === 2) {
            await requireWritePlan(env.DB, workspaceId);
            const body = await jsonBody(request), name = text(body.name, 120, true), type = body.reportType;
            if (!Object.hasOwn(REPORT_TYPES, type))
                throw new HttpError(400, 'Unknown template type.');
            if(body.propertyId)await getProperty(env.DB,workspaceId,safeId(body.propertyId));
            const data = sanitizeReport(body.report, type, { address: '' }, brand);
            data.photos = [];
            for (const area of data.areas)
                for (const item of area.items) {
                    item.agentComments = '';
                    item.tenantComments = '';
                    item.actionComments = '';for(const key of ['maintenanceCommentary','activityDate','activityTime','activityParty','status','dueDate','quantity','identifier'])if(Object.hasOwn(item,key))item[key]='';if(Object.hasOwn(item,'maintenanceRequired'))item.maintenanceRequired=false;
                    for (const flag of ['clean', 'undamaged', 'working', 'tenantAgrees'])
                        if (Object.hasOwn(item, flag))
                            item[flag] = null;
                }
            for (const field of Object.keys(data.details))
                if (!['reportType', 'waFormVersion', 'formName', 'formNumber', 'actNotice'].includes(field))
                    data.details[field] = '';
            const id = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO templates(workspace_id,id,name,report_type,template_data,created_at,property_id) VALUES(?,?,?,?,?,?,?)').bind(workspaceId, id, name, type, JSON.stringify(data), nowSeconds(),body.propertyId||null).run();
            return json({ id, name }, 201);
        }
        if (method === 'DELETE' && parts.length === 3) {
            requireRole(workspace.role, 'admin');
            const r = await env.DB.prepare('DELETE FROM templates WHERE workspace_id=? AND id=?').bind(workspaceId, safeId(parts[2])).run();
            if (!r.meta.changes)
                throw new HttpError(404, 'Template not found.');
            return json({ success: true });
        }
    }
    return null;
}
