import fs from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { watch } from 'node:fs'
import path from 'node:path'
import pkg from './package.json'

const execAsync = promisify(exec)

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 只清理main和preload目录，保留workers目录
  if (fs.existsSync('dist-electron/main')) {
    fs.rmSync('dist-electron/main', { recursive: true, force: true })
  }
  if (fs.existsSync('dist-electron/preload')) {
    fs.rmSync('dist-electron/preload', { recursive: true, force: true })
  }

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  // Worker 热编译函数
  const buildWorker = async () => {
    console.log('🔄 Building worker process...')
    try {
      await execAsync('npm run build:worker')
      console.log('✅ Worker process built successfully')
      return true
    } catch (error) {
      console.error('❌ Failed to build worker process:', error)
      return false
    }
  }

  // 开发模式下启动 worker 文件监听
  if (isServe) {
    const workerSourcePath = path.resolve('electron/workers/systemTaskWorker.ts')

    let buildTimeout: NodeJS.Timeout | null = null

    // 监听 worker 源文件变化
    watch(workerSourcePath, (eventType) => {
      if (eventType === 'change') {
        // 防抖：避免快速连续修改导致多次编译
        if (buildTimeout) {
          clearTimeout(buildTimeout)
        }

        buildTimeout = setTimeout(async () => {
          console.log('📝 Worker source changed, rebuilding...')
          await buildWorker()
        }, 500)
      }
    })

    console.log('👀 Watching worker file:', workerSourcePath)
  }

  return {
    plugins: [
      vue(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`
          entry: 'electron/main/index.ts',
          async onstart({ startup }) {
            // 确保worker文件存在
            if (!fs.existsSync('dist-electron/workers/systemTaskWorker.cjs')) {
              await buildWorker()
            }

            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
            } else {
              startup()
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                // Some third-party Node.js libraries may not be built correctly by Vite, especially `C/C++` addons, 
                // we can use `external` to exclude them to ensure they work correctly.
                // Others need to put them in `dependencies` to ensure they are collected into `app.asar` after the app is built.
                // Of course, this is not absolute, just this way is relatively simple. :)
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },

        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
      return {
        host: url.hostname,
        port: +url.port,
      }
    })(),
    clearScreen: false,
  }
})
