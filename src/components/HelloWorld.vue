<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ msg: string }>()

const count = ref(0)
const loading = ref(false)
const result = ref('')
const logs = ref<string[]>([])
const showLogs = ref(false)
const logFilePath = ref('')

// Test disk space check
async function testDiskSpace() {
  loading.value = true
  result.value = ''
  try {
    const diskInfo = await (window as any).ipcRenderer.invoke('check-disk-space')
    result.value = 'Disk space check successful: ' + JSON.stringify(diskInfo, null, 2)
    console.log('Disk space info:', diskInfo)
  } catch (error) {
    result.value = 'Disk space check failed: ' + (error as Error).message
    console.error('Disk space check failed:', error)
  } finally {
    loading.value = false
  }
}

// Test system information retrieval
async function testSystemInfo() {
  loading.value = true
  result.value = ''
  try {
    const systemInfo = await (window as any).ipcRenderer.invoke('get-system-info')
    result.value = 'System info retrieval successful: ' + JSON.stringify(systemInfo, null, 2)
    console.log('System info:', systemInfo)
  } catch (error) {
    result.value = 'System info retrieval failed: ' + (error as Error).message
    console.error('System info retrieval failed:', error)
  } finally {
    loading.value = false
  }
}

// Test deb package installation (requires actual deb file path)
async function testInstallDeb() {
  loading.value = true
  result.value = ''
  try {
    // Note: This requires an actual deb file path for testing
    const testPath = '/path/to/test.deb'
    const installResult = await (window as any).ipcRenderer.invoke('install-deb', testPath)
    result.value = 'Installation result: ' + installResult
    console.log('Installation result:', installResult)
  } catch (error) {
    result.value = 'Installation failed: ' + (error as Error).message
    console.error('Installation failed:', error)
  } finally {
    loading.value = false
  }
}

// Get worker logs
async function getWorkerLogs() {
  try {
    const [recentLogs, filePath] = await Promise.all([
      (window as any).ipcRenderer.invoke('get-worker-logs', 50),
      (window as any).ipcRenderer.invoke('get-log-file-path')
    ])
    logs.value = recentLogs
    logFilePath.value = filePath
    showLogs.value = true
    console.log('Worker logs retrieved:', recentLogs.length, 'lines')
  } catch (error) {
    result.value = 'Failed to get logs: ' + (error as Error).message
    console.error('Failed to get logs:', error)
  }
}

// Refresh logs
async function refreshLogs() {
  if (showLogs.value) {
    await getWorkerLogs()
  }
}
</script>

<template>
  <h1>{{ msg }}</h1>

  <div class="card">
    <button type="button" @click="count++">count is {{ count }}</button>
    <p>
      Edit
      <code>components/HelloWorld.vue</code> to test HMR
    </p>
  </div>
  
  <div class="system-tasks">
    <h2>System Tasks Test</h2>
    <div class="button-group">
      <button @click="testDiskSpace" :disabled="loading">Check Disk Space</button>
      <button @click="testSystemInfo" :disabled="loading">Get System Info</button>
      <button @click="testInstallDeb" :disabled="loading">Test Install Deb</button>
      <button @click="getWorkerLogs" :disabled="loading">View Worker Logs</button>
    </div>
    
    <div v-if="loading" class="loading">Executing...</div>
    
    <div v-if="result" class="result">
      <h3>Execution Result:</h3>
      <pre>{{ result }}</pre>
    </div>
    
    <!-- Worker Logs Viewer -->
    <div v-if="showLogs" class="logs-viewer">
      <div class="logs-header">
        <h3>Worker Process Logs</h3>
        <div class="logs-controls">
          <button @click="refreshLogs" class="refresh-btn">Refresh</button>
          <button @click="showLogs = false" class="close-btn">Close</button>
        </div>
      </div>
      
      <div class="logs-info">
        <p><strong>Log File:</strong> {{ logFilePath }}</p>
        <p><strong>Recent Lines:</strong> {{ logs.length }}</p>
      </div>
      
      <div class="logs-content">
        <div v-for="(line, index) in logs" :key="index" class="log-line" 
             :class="{ 
               'error': line.includes('[ERROR]'),
               'debug': line.includes('[DEBUG]'),
               'info': line.includes('[INFO]')
             }">
          {{ line }}
        </div>
      </div>
    </div>
  </div>

  <p>
    Check out
    <a href="https://vuejs.org/guide/quick-start.html#local" target="_blank"
      >create-vue</a
    >, the official Vue + Vite starter
  </p>
  <p>
    Install
    <a href="https://github.com/johnsoncodehk/volar" target="_blank">Volar</a>
    in your IDE for a better DX
  </p>
  <p class="read-the-docs">Click on the Vite and Vue logos to learn more</p>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}

.system-tasks {
  margin: 2rem 0;
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.button-group {
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}

.button-group button {
  padding: 0.5rem 1rem;
  background: #646cff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.button-group button:hover:not(:disabled) {
  background: #5856eb;
}

.button-group button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.loading {
  color: #646cff;
  font-weight: bold;
  margin: 1rem 0;
}

.result {
  margin: 1rem 0;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 4px;
  text-align: left;
}

.result pre {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  font-size: 12px;
}

.logs-viewer {
  margin: 2rem 0;
  border: 2px solid #646cff;
  border-radius: 8px;
  background: #f9f9f9;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #646cff;
  color: white;
  border-radius: 6px 6px 0 0;
}

.logs-header h3 {
  margin: 0;
}

.logs-controls {
  display: flex;
  gap: 0.5rem;
}

.logs-controls button {
  padding: 0.3rem 0.8rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.refresh-btn {
  background: #4CAF50;
  color: white;
}

.close-btn {
  background: #f44336;
  color: white;
}

.logs-info {
  padding: 0.5rem 1rem;
  background: #e8e8e8;
  font-size: 12px;
}

.logs-info p {
  margin: 0.25rem 0;
}

.logs-content {
  max-height: 400px;
  overflow-y: auto;
  padding: 1rem;
  background: #2d2d2d;
  color: #f0f0f0;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.4;
}

.log-line {
  margin: 0.2rem 0;
  padding: 0.1rem;
  word-break: break-all;
}

.log-line.error {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.log-line.info {
  color: #51cf66;
}

.log-line.debug {
  color: #74c0fc;
}
</style>
