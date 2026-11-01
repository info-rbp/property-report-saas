import { readFile, mkdir, access, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(await readFile(path.join(root, 'UPSTREAM.json'), 'utf8'));
const destination = path.join(root, 'vendor', 'property-report-tool');
try {
    await access(destination);
    throw new Error(`Destination already exists: ${destination}. It will not be overwritten.`);
}
catch (e) {
    if (e.code !== 'ENOENT')
        throw e;
}
function git(args, cwd) { const r = spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); if (r.error || r.status !== 0)
    throw new Error(`Git failed: ${r.error?.message || r.stderr}`); return r.stdout.trim(); }
await mkdir(path.dirname(destination), { recursive: true });
const temporary = path.join(root, 'vendor', `.fetch-${crypto.randomUUID()}`);
await mkdir(temporary);
try {
    git(['init', '--quiet'], temporary);
    git(['remote', 'add', 'origin', source.repository], temporary);
    git(['fetch', '--depth=1', 'origin', source.commit], temporary);
    git(['checkout', '--detach', 'FETCH_HEAD'], temporary);
    if (git(['rev-parse', 'HEAD'], temporary) !== source.commit)
        throw new Error('Upstream commit did not match the reviewed source.');
    // It is a read-only reference copy for integration work. Never add a push path to the source repository.
    git(['remote', 'set-url', '--push', 'origin', 'DISABLED'], temporary);
    await rename(temporary, destination);
    console.log(`Fetched pinned source into ${destination}. This DOES NOT integrate its editor, PDF renderer or workflows.`);
    console.log('The vendor directory is ignored by Git. Port deliberately, retaining third-party notices and adding tenant-safe tests.');
}
catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
}
