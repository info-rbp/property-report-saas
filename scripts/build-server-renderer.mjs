import { build } from 'esbuild';
await build({entryPoints:['src/server/renderer-entry.ts'],bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:'generated/server-renderer.mjs',conditions:['browser'],mainFields:['module','main'],external:['canvg','html2canvas','dompurify'],logLevel:'warning'});
