import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function files(directory) { const out = []; for (const e of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'vendor', '.wrangler', 'artifacts', 'backups', 'generated', 'dist'].includes(e.name))
        continue;
    const p = path.join(directory, e.name);
    if (e.isDirectory())
        out.push(...await files(p));
    else
        out.push(p);
} return out; }
const list = await files(root);
let checked = 0;
for (const file of list) {
    if (file.endsWith('.mjs')) {
        const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (r.status !== 0)
            throw new Error(r.stderr);
        checked++;
    }
    if (/\.(?:mjs|sql|json|jsonc|html|md|yml|sh)$/.test(file)) {
        const source = await readFile(file, 'utf8');
        // Detect plausible committed provider credentials, not variable names or intentionally assembled test values.
        assert.ok(!/\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/.test(source), `Potential Stripe credential in ${file}`);
        assert.ok(!/\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(source), `Potential GitHub credential in ${file}`);
        assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source), `Potential private key in ${file}`);
    }
}
const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
assert.equal(config.workers_dev, false, 'Public deployment fallback must stay disabled in this candidate.');
assert.equal(config.vars.ENVIRONMENT, 'staging');
assert.equal(config.vars.LAUNCH_APPROVED, 'false');
assert.equal(config.vars.STRIPE_MODE, 'test');
assert.equal(config.d1_databases[0].database_id, '00000000-0000-0000-0000-000000000000');
assert.ok(!config.routes?.length, 'Do not point the candidate at a production hostname.');
assert.notEqual(config.r2_buckets[0].bucket_name, config.r2_buckets[1].bucket_name);
const frontend = await readFile(path.join(root, 'public/app.mjs'), 'utf8');
assert.ok(!/\.innerHTML\s*=|document\.write\s*\(/.test(frontend), 'Use textContent rather than injecting user HTML.');
console.log(`PASS: ${checked} JavaScript syntax checks, candidate configuration guards and basic credential-pattern scan.`);
console.log('This does not replace dependency auditing, type checking, Workers runtime testing or a security review.');
