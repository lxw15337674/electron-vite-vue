# System Tasks Framework

A robust child process-based task execution framework for Electron applications, designed to safely execute system commands without affecting the main application process.

## ✨ Features

- **Process Isolation**: System commands run in separate child processes
- **Crash Protection**: Main application remains stable even if tasks fail
- **Auto Recovery**: Automatic worker process restart on failures
- **Timeout Protection**: 30-second timeout prevents hanging operations
- **Easy Extension**: Simple task registration system
- **Type Safety**: Full TypeScript support
- **Error Handling**: Comprehensive error catching and reporting

## 🏗️ Architecture

```
Main Process (Electron)
    ↓ IPC Handle
Task Executor
    ↓ Child Process
System Task Worker
    ↓ exec/spawn
System Commands
```

## 🚀 Available Tasks

| Task Name | Description | Parameters |
|-----------|-------------|------------|
| `install-deb` | Install .deb packages | `debPath: string` |
| `update-system` | Update system packages | None |
| `install-package` | Install apt packages | `packageName: string` |
| `manage-service` | Control systemd services | `serviceName: string, action: string` |
| `check-disk-space` | Get disk usage info | None |
| `get-system-info` | Get system information | None |

## 📦 Usage

### Frontend (Vue/React/etc.)

```typescript
// All tasks use the same pattern - no changes to existing code!
const result = await window.ipcRenderer.invoke('install-deb', '/path/to/package.deb');
const diskInfo = await window.ipcRenderer.invoke('check-disk-space');
const systemInfo = await window.ipcRenderer.invoke('get-system-info');
```

### Adding New Tasks

#### 1. Register the task name (main process)

```typescript
// electron/main/index.ts
const systemTasks = [
  // ... existing tasks
  'your-new-task'  // ← Add this line
];
```

#### 2. Implement the task (worker process)

```typescript
// electron/workers/systemTaskWorker.ts
registerTask('your-new-task', async (param1: string, param2: number): Promise<string> => {
  // Validate parameters
  if (!param1 || typeof param2 !== 'number') {
    throw new Error('Invalid parameters');
  }
  
  // Execute your system command
  const result = await executeCommand(`your-command "${param1}" ${param2}`);
  
  return `Task completed: ${result}`;
});
```

#### 3. Use from frontend

```typescript
const result = await window.ipcRenderer.invoke('your-new-task', 'test', 123);
```

## 🛠️ Development

### Building

```bash
# Build worker process
npm run build:worker

# Full build
npm run build
```

### Testing

The framework includes a test interface in the main application window with buttons to test:
- Disk space checking
- System information retrieval  
- Package installation (requires valid .deb path)

## 🔧 Configuration

### Timeout Settings

Edit `taskExecutor.ts` to modify timeout:

```typescript
const timeout = setTimeout(() => {
  // ... timeout handling
}, 30000); // 30 seconds (adjustable)
```

### Worker Process Settings

Edit `systemTaskWorker.ts` to modify command execution:

```typescript
async function executeCommand(command: string, options: { timeout?: number } = {}) {
  const { timeout = 30000 } = options; // Adjust default timeout
  // ...
}
```

## 🔐 Security Considerations

1. **Parameter Validation**: Always validate input parameters in tasks
2. **Command Injection**: Use proper escaping for shell commands
3. **File Path Validation**: Verify file paths and extensions
4. **Permission Checks**: Use `pkexec` for operations requiring elevated privileges

## 🐛 Troubleshooting

### Worker Process Crashes

Check the console for error messages. Common issues:
- Missing dependencies
- Permission errors
- Invalid command syntax

### Module Not Found Errors

Ensure the worker file is built:
```bash
npm run build:worker
```

### Permission Denied

For system operations requiring root access, ensure `pkexec` is available and properly configured.

## 📁 File Structure

```
electron/
├── main/
│   ├── index.ts              # Main process with IPC handlers
│   └── taskExecutor.ts       # Task execution manager
├── workers/
│   └── systemTaskWorker.ts   # Task implementations
└── preload/
    └── index.ts              # IPC bridge to renderer

dist-electron/
├── main/
├── workers/
│   └── systemTaskWorker.cjs  # Compiled worker (CommonJS)
└── preload/
```

## 📈 Performance

- **Startup Time**: ~100ms for worker initialization
- **Task Execution**: Depends on system command complexity
- **Memory Usage**: Minimal overhead per task
- **Concurrency**: One task at a time per worker (expandable to pool)

## 🔄 Future Enhancements

- [ ] Worker process pooling for concurrent tasks
- [ ] Task priority queuing
- [ ] Progress reporting for long-running tasks
- [ ] Task cancellation support
- [ ] Metrics and monitoring

---

**Note**: This framework is designed for Linux systems with `apt` package manager and `systemctl` service management. Adapt commands for other operating systems as needed.
