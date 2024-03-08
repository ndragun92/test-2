import path, { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import typescript from '@rollup/plugin-typescript'
import { typescriptPaths } from 'rollup-plugin-typescript-paths'

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
  plugins: [dts()],
  resolve: {
    alias: [
      {
        find: '~',
        replacement: path.resolve(__dirname, './src')
      }
    ]
  },
  server: {
    port: 3000
  },
  build: {
    manifest: true,
    minify: true,
    reportCompressedSize: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'test-2',
      fileName: 'test-2',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: [],
      plugins: [
        typescriptPaths({
          preserveExtensions: true
        }),
        typescript({
          sourceMap: false,
          declaration: true,
          outDir: 'dist'
        })
      ]
    }
  }
})
