import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],publicDir:'public',build:{outDir:'dist',rollupOptions:{input:{editor:'editor.html',sign:'sign.html'}}}});
