import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, fs: { allow: ['..'] } },
  preview: { host: true },
});
