const $ = selector => document.querySelector(selector);
const state = { account: null, workspace: null, tab: 'properties' };
const node = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; if (className)
    n.className = className; return n; };
function message(value, error = false) { $('#message').textContent = value; $('#message').className = error ? 'error' : ''; }
async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(path, { method, credentials: 'same-origin', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(state.workspace ? { 'X-Workspace-ID': state.workspace.id } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}
function safe(action) { return async (event) => { event?.preventDefault(); try {
    await action(event);
}
catch (error) {
    message(error.message, true);
} }; }
function card(title) { const n = node('section', '', 'card'); n.append(node('h2', title)); return n; }
function field(form, label, name, value = '', type = 'text') { const l = node('label', label), input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.name = name; if (type !== 'textarea')
    input.type = type; input.value = value; l.append(input); form.append(l); return input; }
function action(parent, label, callback) { const b = node('button', label); b.type = 'button'; b.addEventListener('click', safe(callback)); parent.append(b); return b; }
function currentRole() { return state.workspace?.role || 'viewer'; }
async function refresh() {
    state.account = await api('/api/me');
    $('#login').hidden = true;
    $('#account').hidden = false;
    $('#logout').hidden = false;
    const select = $('#workspace-select');
    select.replaceChildren();
    for (const ws of state.account.workspaces) {
        const o = node('option', ws.name);
        o.value = ws.id;
        select.append(o);
    }
    const saved = sessionStorage.getItem(`pr-workspace:${state.account.user.id}`);
    state.workspace = state.account.workspaces.find(w => w.id === state.workspace?.id) || state.account.workspaces.find(w => w.id === saved) || state.account.workspaces[0] || null;
    if (state.workspace)
        select.value = state.workspace.id;
    await render();
}
async function render() {
    const root = $('#content');
    root.replaceChildren();
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (!state.workspace) {
        root.append(card('Create your first workspace'));
        return;
    }
    if (state.tab === 'properties')
        return properties(root);
    if (state.tab === 'team')
        return team(root);
    if (state.tab === 'branding')
        return branding(root);
    if (state.tab === 'billing')
        return billing(root);
    if (state.tab === 'recovery')return recovery(root);
    if (state.tab === 'readiness')
        return release(root);
}
async function properties(root) {
    const section = card('Property register');
    root.append(section);
    if (['owner', 'admin', 'editor'].includes(currentRole())) {
        const form = document.createElement('form');
        field(form, 'Property address', 'address').required = true;
        field(form, 'Internal reference', 'reference');
        const b = node('button', 'Add property');
        form.append(b);
        form.addEventListener('submit', safe(async () => { await api('/api/properties', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); await render(); message('Property created.'); }));
        section.append(form);
    }
    let after = '';
    do {
        const page = await api(`/api/properties${after ? `?after=${encodeURIComponent(after)}` : ''}`);
        for (const property of page.properties) {
            const row = node('div', '', 'row'), label = node('div');
            label.append(node('strong', property.address), node('div', property.reference, 'muted'));
            row.append(label);
            action(row, 'Open', () => openProperty(property));
            section.append(row);
        }
        after = page.next;
    } while (after);
}
async function openProperty(property) {
    const result = await api(`/api/properties/${property.id}`), root = $('#content');
    root.replaceChildren();
    const section = card(property.address);
    root.append(section);
    action(section, 'Back to properties', () => render());
    if (['owner', 'admin', 'editor'].includes(currentRole())) {
        const catalogue = await api('/api/catalogue'), form = document.createElement('form'), label = node('label', 'Report type'), select = document.createElement('select');
        for (const [type, title] of Object.entries(catalogue)) {
            const option = node('option', title);
            option.value = type;
            select.append(option);
        }
        label.append(select);
        form.append(label, node('button', 'Create draft'));
        form.addEventListener('submit', safe(async () => { const report = await api(`/api/properties/${property.id}/reports`, { method: 'POST', body: { reportType: select.value } }); await openReport(report.id); }));
        section.append(form);
    }
    const templates=await api(`/api/templates?propertyId=${encodeURIComponent(property.id)}`);
    if(templates.length&&['owner','admin','editor'].includes(currentRole())){const picker=document.createElement('select');for(const t of templates){const option=node('option',t.name);option.value=t.id;picker.append(option);}section.append(picker);action(section,'Create from saved template',async()=>{const t=templates.find(x=>x.id===picker.value);const report=await api(`/api/properties/${property.id}/reports`,{method:'POST',body:{reportType:t.report_type,templateId:t.id}});await openReport(report.id);});}
    for (const report of result.reports) {
        const row = node('div', '', 'row');
        row.append(node('span', `${report.report_type} - ${report.status} - revision ${report.revision}`));
        action(row, 'Open report', () => openReport(report.id));
        section.append(row);
    }
}
async function openReport(id) { location.assign(`/editor.html?workspace=${encodeURIComponent(state.workspace.id)}&report=${encodeURIComponent(id)}`); }
async function team(root) {
    if (!['owner', 'admin'].includes(currentRole())) {
        root.append(card('Team administration requires an administrator role.'));
        return;
    }
    const section = card('Team members');
    root.append(section);
    const members = await api(`/api/workspaces/${state.workspace.id}/members`);
    for (const member of members) {
        const row = node('div', '', 'row');
        row.append(node('span', member.email), node('span', member.role, 'badge'));
        if(currentRole()==='owner'&&member.id!==state.account.user.id){
            const roles=document.createElement('select');for(const role of ['viewer','editor','admin','owner']){const o=node('option',role);o.value=role;roles.append(o);}roles.value=member.role;row.append(roles);
            action(row,'Change role',async()=>{await api(`/api/workspaces/${state.workspace.id}/members/${member.id}`,{method:'PATCH',body:{role:roles.value}});await render();});
            action(row,'Remove',async()=>{if(confirm('Remove this member from the workspace?')){await api(`/api/workspaces/${state.workspace.id}/members/${member.id}`,{method:'DELETE'});await render();}});
            action(row,'Transfer ownership',async()=>{if(confirm('Make this member the owner and change your role to administrator?')){await api(`/api/workspaces/${state.workspace.id}/transfer-ownership`,{method:'POST',body:{userId:member.id}});await refresh();}});
        }else if(currentRole()==='admin'&&member.id!==state.account.user.id&&['editor','viewer'].includes(member.role)){
            action(row,'Toggle editor/viewer',async()=>{await api(`/api/workspaces/${state.workspace.id}/members/${member.id}`,{method:'PATCH',body:{role:member.role==='editor'?'viewer':'editor'}});await render();});
            action(row,'Remove',async()=>{if(confirm('Remove this member?')){await api(`/api/workspaces/${state.workspace.id}/members/${member.id}`,{method:'DELETE'});await render();}});
        }
        section.append(row);
    }
    for(const invite of await api(`/api/workspaces/${state.workspace.id}/invitations`)){if(invite.accepted_at||invite.revoked_at)continue;const row=node('div','','row');row.append(node('span',`${invite.email} - ${invite.role} - expires ${new Date(invite.expires_at*1000).toLocaleDateString()}`));action(row,'Revoke invitation',async()=>{await api(`/api/workspaces/${state.workspace.id}/invitations/${invite.id}`,{method:'DELETE'});await render();});section.append(row);}
    const form = document.createElement('form');
    field(form, 'Invite email', 'email', '', 'email').required = true;
    const label = node('label', 'Role'), select = document.createElement('select');
    select.name = 'role';
    for (const role of currentRole() === 'owner' ? ['editor', 'viewer', 'admin'] : ['editor', 'viewer']) {
        const o = node('option', role);
        o.value = role;
        select.append(o);
    }
    label.append(select);
    form.append(label, node('button', 'Send invitation'));
    form.addEventListener('submit', safe(async () => { await api(`/api/workspaces/${state.workspace.id}/invitations`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); message('Invitation sent.'); form.reset(); }));
    section.append(form);
}
async function branding(root) {
    const section = card('Business branding'), form = document.createElement('form');
    root.append(section);
    const labels = { companyName: 'Company name', companyAddress: 'Business address', companyPhone: 'Phone', companyEmail: 'Reply contact email', companyWebsite: 'Website (HTTPS)' };
    for (const [key, label] of Object.entries(labels))
        field(form, label, key, state.workspace.branding[key] || '');
    const editable = ['owner', 'admin'].includes(currentRole());
    form.querySelectorAll('input').forEach(input => input.readOnly = !editable);
    if (editable) {
        form.append(node('button', 'Save branding'));
        form.addEventListener('submit', safe(async () => { state.workspace.branding = await api(`/api/workspaces/${state.workspace.id}/branding`, { method: 'PUT', body: Object.fromEntries(new FormData(form)) }); message('Branding saved for this workspace.'); }));
    }
    section.append(form,node('p','Completed reports retain their original branding snapshot. Logos are validated, stored privately and mirrored.','muted'));
    if(editable){const upload=document.createElement('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.setAttribute('aria-label','Upload business logo');upload.addEventListener('change',safe(async()=>{const file=upload.files?.[0];if(!file)return;const image=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,800/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));const r=await fetch(`/api/workspaces/${state.workspace.id}/logo`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob,credentials:'same-origin'});const result=await r.json();if(!r.ok)throw new Error(result.error);state.workspace.branding=result;message('Workspace logo saved. Existing completed reports are unchanged.');await render();}));section.append(upload);action(section,'Remove current logo',async()=>{state.workspace.branding=await api(`/api/workspaces/${state.workspace.id}/logo`,{method:'DELETE'});await render();});}
    if(state.workspace.branding.companyLogoAssetId){const image=document.createElement('img');image.src=`/api/workspaces/${state.workspace.id}/assets/${state.workspace.branding.companyLogoAssetId}`;image.alt='Current business logo';image.width=150;section.append(image);} 
}
async function billing(root) {
    if (currentRole() !== 'owner') {
        root.append(card('Billing requires the workspace owner role.'));
        return;
    }
    const section = card('Subscription billing');
    root.append(section);
    section.append(node('p', 'Proposed plans, ex GST. Checkout is disabled by default and live payments remain blocked until the release gates pass.'));
    const status = await api(`/api/workspaces/${state.workspace.id}`);
    section.append(node('p', `Current access: ${status.entitlement.reason}`, 'badge'));
    const grid = node('div', '', 'grid');
    section.append(grid);
    for (const [plan, label, amount] of [['solo', 'Solo', 99], ['professional', 'Professional', 249], ['business', 'Business', 499]]) {
        const tile = card(label);
        tile.append(node('p', `AUD $${amount} / month, ex GST`));
        let requestId = crypto.randomUUID();
        action(tile, 'Open configured checkout', async () => { const result = await api('/api/billing/checkout', { method: 'POST', body: { plan, requestId } }); location.assign(result.url); });
        grid.append(tile);
    }
    action(section, 'Manage existing subscription', async () => { const result = await api('/api/billing/portal', { method: 'POST', body: {} }); location.assign(result.url); });
}
async function release(root) {
    if (currentRole() !== 'owner') {
        root.append(card('Release evidence requires the workspace owner role.'));
        return;
    }
    const section = card('Release status');
    root.append(section);
    const status = await api(`/api/workspaces/${state.workspace.id}/readiness`);
    section.append(node('p', status.ready ? 'Approved for the recorded release.' : 'Paid launch and final report issuing are blocked.'));
    const list = document.createElement('ul');
    for (const blocker of status.blockers)
        list.append(node('li', blocker.replaceAll('-', ' ')));
    section.append(list);
}
$('#login-form').addEventListener('submit', safe(async (event) => { const data = await api('/api/auth/start', { method: 'POST', body: Object.fromEntries(new FormData(event.target)) }); message(data.message); }));
$('#logout').addEventListener('click', safe(async () => { await api('/api/auth/logout', { method: 'POST', body: {} });new BroadcastChannel('pr-session').postMessage('logout');indexedDB.deleteDatabase('property-reports-offline-v2'); for (const key of Object.keys(sessionStorage))
    if (key.startsWith('pr-'))
        sessionStorage.removeItem(key); state.account = null; state.workspace = null; location.assign('/'); }));
$('#workspace-select').addEventListener('change', safe(async (event) => { state.workspace = state.account.workspaces.find(w => w.id === event.target.value); sessionStorage.setItem(`pr-workspace:${state.account.user.id}`, state.workspace.id); await render(); }));
$('#new-workspace').addEventListener('click', () => $('#workspace-dialog').showModal());
$('#cancel-workspace').addEventListener('click', () => $('#workspace-dialog').close());
$('#workspace-form').addEventListener('submit', safe(async (event) => { const data = new FormData(event.target); await api('/api/workspaces', { method: 'POST', body: { name: data.get('name'), accepted: data.has('accepted'), termsVersion: state.account.termsVersion, privacyVersion: state.account.privacyVersion } }); $('#workspace-dialog').close(); await refresh(); }));
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', safe(async () => { state.tab = button.dataset.tab; await render(); })));
async function boot() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const token = fragment.get('verify'), invitation = fragment.get('invite');
    history.replaceState(null, '', location.pathname);
    if (invitation)
        sessionStorage.setItem('pr-pending-invitation', invitation);
    try {
        if (token)
            await api('/api/auth/verify', { method: 'POST', body: { token } });
        await refresh();
        const pending = sessionStorage.getItem('pr-pending-invitation');
        if (pending) {
            await api('/api/invitations/accept', { method: 'POST', body: { token: pending } });
            sessionStorage.removeItem('pr-pending-invitation');
            await refresh();
            message('Invitation accepted.');
        }
    }
    catch (error) {
        if (token || invitation)
            message(error.message, true);
    }
}
await boot();

async function recovery(root){
 if(currentRole()!=='owner'){root.append(card('Recovery and exports require the owner role.'));return;}
 const section=card('Recovery, export and retention');root.append(section);
 const status=await api(`/api/workspaces/${state.workspace.id}/backup-status`);section.append(node('p',status.independentArchiveConfigured?'Independent archive credentials are configured. Receipts and restore drills must still be reviewed.':'Independent archive has not been configured. Local mirror alone is not disaster recovery.'));
 for(const row of status.jobs)section.append(node('p',`${row.status}: ${row.count} archive objects`));
 action(section,'Download workspace export',async()=>{
 const all={workspaceId:state.workspace.id,exportedAt:new Date().toISOString(),tables:{}};let bytes=0;
 for(const table of ['properties','reports','objects','templates','deliveries','signatures','signers','brandAssets','emailStatus','audit']){all.tables[table]=[];let after='';do{const result=await api(`/api/workspaces/${state.workspace.id}/export?table=${table}${after?'&after='+encodeURIComponent(after):''}`);bytes+=JSON.stringify(result.rows).length;if(bytes>64*1024*1024)throw new Error('Export exceeds browser memory allowance. Use the paginated export script. No partial export is presented as complete.');all.tables[table].push(...result.rows);after=result.next;}while(after);}
 const url=URL.createObjectURL(new Blob([JSON.stringify(all,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='workspace-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);message('Workspace record export complete. Photo and PDF bytes remain available through authenticated file endpoints.');});
 const form=document.createElement('form');field(form,'Report ID','reportId').required=true;form.append(node('button','Inspect recovery copies'));form.addEventListener('submit',safe(async()=>{const id=new FormData(form).get('reportId');const result=await api(`/api/recovery/objects?reportId=${encodeURIComponent(id)}`);const panel=card('Recovery inventory');section.append(panel);for(const item of result.objects||result){const row=node('div','','row');row.append(node('span',`${item.id} - ${item.kind||'file'}`));action(row,'Restore verified bytes',async()=>{await api(`/api/recovery/objects/${item.id}/restore`,{method:'POST',body:{confirm:true}});message('Exact backup bytes restored and verified.');});panel.append(row);}}));section.append(form);
 section.append(node('p','Finalised and signed records are retained. Closure/erasure requests are reviewed against retention obligations; requesting closure does not automatically cancel billing or erase evidence.','muted'));
 action(section,'Request closure / erasure review',async()=>{const reason=prompt('Describe the closure or erasure request');if(reason){await api(`/api/workspaces/${state.workspace.id}/closure`,{method:'POST',body:{confirm:true,reason}});message('Closure review request recorded. No records have been erased.');}});
}
