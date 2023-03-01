import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      name: 'vuesAxios',
      entry: './src/index.ts',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['vue', 'axios']
    }
  }
})
