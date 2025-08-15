import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 类型定义
export interface TaskResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    code?: number;
}

export interface TaskExecutionOptions {
    timeout?: number;
}

export interface DiskInfo {
    filesystem: string;
    size: string;
    used: string;
    available: string;
    usePercent: string;
    mounted: string;
}

export interface SystemInfo {
    platform: string;
    arch: string;
    nodeVersion: string;
    uptime: number;
    memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
    };
}

export class TaskExecutor {
    private workerProcess: ChildProcess | null = null;
    private pendingTasks = new Map<string, {
        resolve: (value: TaskResult) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }>();
    private taskIdCounter = 0;
    private restartAttempts = 0;
    private maxRestartAttempts = 5;
    private restartCooldown = false;
    private logFilePath: string;

    constructor() {
        // 创建日志目录
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        this.logFilePath = path.join(logDir, `worker-${Date.now()}.log`);
        this.initWorker();
    }

    private initWorker() {
        try {
            // 根据环境选择worker路径
            const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL;
            let workerPath: string;

            if (isDev) {
                // 开发环境: 需要先编译worker文件
                workerPath = path.join(process.cwd(), 'dist-electron/workers/systemTaskWorker.cjs');
            } else {
                // 生产环境
                workerPath = path.join(__dirname, '../workers/systemTaskWorker.cjs');
            }

            console.log(`[MAIN PID:${process.pid}] Worker process path:`, workerPath);

            // 检查文件是否存在
            if (!fs.existsSync(workerPath)) {
                throw new Error(`Worker file does not exist: ${workerPath}`);
            }

            // 创建子进程
            this.workerProcess = fork(workerPath, [], {
                env: process.env,
                stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            });

            // 监听来自worker的消息
            this.workerProcess.on('message', (message: any) => {
                console.log(`[MAIN PID:${process.pid}] Received message from worker PID:${this.workerProcess?.pid} -`, message.type);
                this.writeToLogFile(`[MAIN PID:${process.pid}] Received message from worker PID:${this.workerProcess?.pid} - ${message.type}\n`);
                this.handleWorkerMessage(message);
            });

            // 监听进程退出
            this.workerProcess.on('exit', (code) => {
                console.log(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} exited with code ${code}`);
                this.writeToLogFile(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} exited with code ${code}\n`);
                if (code !== 0 && !this.restartCooldown) {
                    this.restartWorker();
                }
            });

            // 监听进程错误
            this.workerProcess.on('error', (error) => {
                console.error(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} error:`, error);
                this.writeToLogFile(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} error: ${error.message}\n`);
            });

            // 监听stdout和stderr
            if (this.workerProcess.stdout) {
                this.workerProcess.stdout.on('data', (data) => {
                    console.log(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} stdout:`, data.toString());
                    this.writeToLogFile(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} stdout: ${data.toString()}`);
                });
            }

            if (this.workerProcess.stderr) {
                this.workerProcess.stderr.on('data', (data) => {
                    console.error(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} stderr:`, data.toString());
                    this.writeToLogFile(`[MAIN PID:${process.pid}] Worker PID:${this.workerProcess?.pid} stderr: ${data.toString()}`);
                });
            }

            console.log(`[MAIN PID:${process.pid}] Worker process initialized successfully with PID:${this.workerProcess.pid}`);
            this.writeToLogFile(`[MAIN PID:${process.pid}] Worker process initialized successfully with PID:${this.workerProcess.pid}\n`);

            // 重置重启计数器，因为worker成功启动了
            this.restartAttempts = 0;
            this.restartCooldown = false;
        } catch (error) {
            console.error(`[MAIN PID:${process.pid}] Failed to initialize worker process:`, error);
            this.writeToLogFile(`[MAIN PID:${process.pid}] Failed to initialize worker process: ${error.message}\n`);
        }
    }

    private restartWorker() {
        if (this.restartAttempts >= this.maxRestartAttempts) {
            console.error(`[MAIN PID:${process.pid}] Max restart attempts reached. Stopping worker restart.`);
            this.restartCooldown = true;
            return;
        }

        this.restartAttempts++;
        console.log(`[MAIN PID:${process.pid}] Restarting worker process... (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);

        this.cleanupWorker();

        // 增加重启延迟
        const delay = Math.min(1000 * this.restartAttempts, 10000); // 最多10秒延迟
        setTimeout(() => {
            if (this.workerProcess === null && !this.restartCooldown) {
                this.initWorker();
            }
        }, delay);
    }

    private handleWorkerMessage(message: any) {
        const { type, taskId, result, error } = message;

        if (type === 'task-complete' || type === 'task-error') {
            const pendingTask = this.pendingTasks.get(taskId);
            if (pendingTask) {
                clearTimeout(pendingTask.timeout);
                this.pendingTasks.delete(taskId);

                if (type === 'task-complete') {
                    console.log(`[MAIN PID:${process.pid}] Task completed from worker PID:${this.workerProcess?.pid} - ${taskId}`);
                    this.writeToLogFile(`[MAIN PID:${process.pid}] Task completed from worker PID:${this.workerProcess?.pid} - ${taskId}\n`);
                    pendingTask.resolve({
                        success: true,
                        data: result
                    });
                } else {
                    console.log(`[MAIN PID:${process.pid}] Task failed from worker PID:${this.workerProcess?.pid} - ${taskId} - ${error}`);
                    this.writeToLogFile(`[MAIN PID:${process.pid}] Task failed from worker PID:${this.workerProcess?.pid} - ${taskId} - ${error}\n`);
                    pendingTask.resolve({
                        success: false,
                        error: error,
                        code: message.code
                    });
                }
            }
        }
    }

    // 公共方法
    async execute<T = any>(taskName: string, ...args: any[]): Promise<TaskResult<T>> {
        return this.executeTaskInternal(taskName, {}, ...args) as Promise<TaskResult<T>>;
    }

    async executeWithOptions<T = any>(
        taskName: string,
        options: TaskExecutionOptions,
        ...args: any[]
    ): Promise<TaskResult<T>> {
        return this.executeTaskInternal(taskName, options, ...args) as Promise<TaskResult<T>>;
    }

    isAvailable(): boolean {
        return !!(this.workerProcess && !this.restartCooldown);
    }

    getRecentLogs(lines: number = 100): string[] {
        try {
            const content = fs.readFileSync(this.logFilePath, 'utf-8');
            const allLines = content.split('\n').filter(line => line.trim());
            return allLines.slice(-lines);
        } catch (error) {
            console.error('Failed to read log file:', error);
            return [];
        }
    }

    // 私有方法：实际的任务执行逻辑
    private async executeTaskInternal(taskName: string, options: TaskExecutionOptions = {}, ...args: any[]): Promise<TaskResult> {
        return new Promise((resolve, reject) => {
            if (!this.workerProcess || this.restartCooldown) {
                resolve({
                    success: false,
                    error: this.restartCooldown ? 
                        'Worker process is in cooldown after multiple failures' :
                        'Worker process not available'
                });
                return;
            }

            const taskId = `task-${++this.taskIdCounter}-${Date.now()}`;
            const timeout = options.timeout || 30000; // 默认30秒超时

            // 设置超时
            const timeoutHandle = setTimeout(() => {
                this.pendingTasks.delete(taskId);
                resolve({
                    success: false,
                    error: 'Task timeout',
                    code: -1
                });
            }, timeout);

            this.pendingTasks.set(taskId, { resolve, reject, timeout: timeoutHandle });

            // 通过IPC发送任务到worker process
            console.log(`[MAIN PID:${process.pid}] Sending task to worker PID:${this.workerProcess.pid} - ${taskName} (${taskId})`);
            this.writeToLogFile(`[MAIN PID:${process.pid}] Sending task to worker PID:${this.workerProcess.pid} - ${taskName} (${taskId})\n`);
            this.workerProcess.send({
                type: 'execute-task',
                taskId,
                taskName,
                args
            });
        });
    }

    private writeToLogFile(data: string) {
        try {
            fs.appendFileSync(this.logFilePath, data);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    getLogFilePath(): string {
        return this.logFilePath;
    }

    private cleanupWorker() {
        // 关闭worker process（用于重启时）
        if (this.workerProcess) {
            this.workerProcess.kill();
            this.workerProcess = null;
        }
    }

    dispose() {
        // 清理所有待处理的任务
        Array.from(this.pendingTasks.entries()).forEach(([taskId, task]) => {
            clearTimeout(task.timeout);
            task.resolve({
                success: false,
                error: 'Task executor shutting down'
            });
        });
        this.pendingTasks.clear();

        // 关闭worker process
        this.cleanupWorker();
    }
}

// 单例实例
export const taskExecutor = new TaskExecutor();

// 导出 TaskManager
export { TaskManager } from './TaskManager.js';

// 创建简化的任务管理器实例
import { TaskManager } from './TaskManager.js';
export const taskManager = new TaskManager(taskExecutor);
