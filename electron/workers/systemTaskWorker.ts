import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface TaskMessage {
  type: string;
  taskId: string;
  taskName: string;
  args: any[];
}


// 任务注册表
const taskRegistry = new Map<string, (...args: any[]) => Promise<any>>();

// 注册任务的装饰器函数
function registerTask(taskName: string, handler: (...args: any[]) => Promise<any>) {
  taskRegistry.set(taskName, handler);
}

// 日志记录函数
function logInfo(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WORKER PID:${process.pid}] [INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

function logError(message: string, error?: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [WORKER PID:${process.pid}] [ERROR] ${message}`, error);
}

function logDebug(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WORKER PID:${process.pid}] [DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// 执行系统命令的通用函数
async function executeCommand(command: string, options: { timeout?: number } = {}): Promise<string> {
  try {
    const { timeout = 30000 } = options;
    logInfo(`Executing command: ${command}`);
    logDebug('Command options:', { timeout, maxBuffer: '10MB' });

    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    if (stderr && stderr.trim()) {
      logInfo('Command stderr output:', stderr);
    }

    logInfo('Command executed successfully');
    logDebug('Command stdout length:', stdout.length);

    return stdout.trim();
  } catch (error: any) {
    logError('Command execution failed:', error);
    throw new Error(`Command failed: ${error.message}`);
  }
}

// 注册具体的任务实现
registerTask('install-deb', async (debPath: string): Promise<string> => {
  logInfo('Starting install-deb task', { debPath });

  if (!debPath || typeof debPath !== 'string') {
    logError('Invalid deb path provided', { debPath, type: typeof debPath });
    throw new Error('Invalid deb path provided');
  }

  // 验证文件路径
  if (!debPath.endsWith('.deb')) {
    logError('File must be a .deb package', { debPath });
    throw new Error('File must be a .deb package');
  }

  logInfo(`Installing deb package: ${debPath}`);
  const result = await executeCommand(`pkexec dpkg -i "${debPath}"`);
  logInfo('Deb package installed successfully', { debPath });
  return `Successfully installed: ${debPath}`;
});

registerTask('update-system', async (): Promise<string> => {
  console.log('Updating system packages...');
  const result = await executeCommand('pkexec apt update && pkexec apt upgrade -y', { timeout: 300000 }); // 5分钟超时
  return 'System update completed successfully';
});

registerTask('install-package', async (packageName: string): Promise<string> => {
  if (!packageName || typeof packageName !== 'string') {
    throw new Error('Invalid package name provided');
  }

  console.log(`Installing package: ${packageName}`);
  const result = await executeCommand(`pkexec apt install -y "${packageName}"`);
  return `Successfully installed package: ${packageName}`;
});

registerTask('manage-service', async (serviceName: string, action: string): Promise<string> => {
  if (!serviceName || !action) {
    throw new Error('Service name and action are required');
  }

  const validActions = ['start', 'stop', 'restart', 'status', 'enable', 'disable'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
  }

  console.log(`Managing service ${serviceName}: ${action}`);
  const result = await executeCommand(`pkexec systemctl ${action} "${serviceName}"`);
  return `Service ${serviceName} ${action} completed`;
});

registerTask('check-disk-space', async (): Promise<any> => {
  console.log('Checking disk space...');
  const result = await executeCommand('df -h');

  // 解析df输出
  const lines = result.split('\n').slice(1); // 跳过标题行
  const diskInfo = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 6) {
      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parts[4],
        mountPoint: parts[5]
      };
    }
    return null;
  }).filter(Boolean);

  return diskInfo;
});

registerTask('get-system-info', async (): Promise<any> => {
  console.log('Getting system information...');

  const [osInfo, memInfo, cpuInfo] = await Promise.all([
    executeCommand('lsb_release -a 2>/dev/null || cat /etc/os-release'),
    executeCommand('free -h'),
    executeCommand('lscpu | head -20')
  ]);

  return {
    os: osInfo,
    memory: memInfo,
    cpu: cpuInfo,
    timestamp: new Date().toISOString()
  };
});

// 处理来自主进程的消息
function handleMessage(message: any) {
  if (message.type === 'execute-task') {
    // 直接处理任务消息
    handleTaskMessage(message);
  }
}

// 处理任务消息
async function handleTaskMessage(message: TaskMessage) {
  const { type, taskId, taskName, args } = message;

  logInfo('Received task message from main process', { type, taskId, taskName, argsCount: args?.length });

  if (type === 'execute-task') {
    try {
      logInfo(`Executing task: ${taskName}`, { taskId, args });

      const handler = taskRegistry.get(taskName);
      if (!handler) {
        const error = `Unknown task: ${taskName}`;
        logError(error, { availableTasks: Array.from(taskRegistry.keys()) });
        throw new Error(error);
      }

      const startTime = Date.now();
      const result = await handler(...args);
      const duration = Date.now() - startTime;

      logInfo(`Task completed successfully`, {
        taskName,
        taskId, 
        duration: `${duration}ms`,
        resultType: typeof result,
        resultSize: typeof result === 'string' ? result.length :
          Array.isArray(result) ? result.length : 'N/A'
      });

      // 通过process.send发送成功结果
      logInfo(`Sending task completion to main process`, { taskId, taskName });
      process.send?.({
        type: 'task-complete',
        taskId,
        result
      });

    } catch (error: any) {
      logError(`Task ${taskName} failed`, {
        taskId,
        error: error.message, 
        stack: error.stack,
        code: error.code 
      });

      // 通过process.send发送错误结果
      logInfo(`Sending task error to main process`, { taskId, taskName, error: error.message });
      process.send?.({
        type: 'task-error',
        taskId,
        error: error.message,
        code: error.code || -1
      });
    }
  } else {
    logError('Unknown task message type received', { type, message });
  }
}

// 监听来自主进程的初始化消息
process.on('message', handleMessage);

// 进程错误处理
process.on('uncaughtException', (error) => {
  logError('Uncaught exception in worker', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled rejection in worker', { reason, promise });
  process.exit(1);
});

// 启动信息
logInfo('System task worker started successfully', {
  pid: process.pid,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch
});

logInfo('Registered tasks', {
  tasks: Array.from(taskRegistry.keys()),
  totalCount: taskRegistry.size
});

// 定期输出健康状态（每5分钟）
setInterval(() => {
  logDebug('Worker health check', {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    pid: process.pid
  });
}, 5 * 60 * 1000);
