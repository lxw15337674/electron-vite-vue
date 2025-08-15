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

// Worker消息类型定义
interface WorkerMessage {
    type: 'task-complete' | 'task-error';
    taskId: string;
    result?: any;
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

    constructor() {
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
                stdio: ['inherit', 'inherit', 'inherit', 'ipc']
            });

            // 监听 worker 消息
            this.workerProcess.on('message', (message) => {
                const { type, taskId, result, error, code } = message as WorkerMessage;

                const pendingTask = this.pendingTasks.get(taskId);
                if (!pendingTask) return;

                clearTimeout(pendingTask.timeout);
                this.pendingTasks.delete(taskId);

                if (type === 'task-complete') {
                    pendingTask.resolve({ success: true, data: result });
                } else if (type === 'task-error') {
                    pendingTask.resolve({ success: false, error, code });
                }
            });
            
        } catch (error) {
            console.error(`[MAIN PID:${process.pid}] Failed to initialize worker process:`, error);
        }
    }

    // 异常风格的方法 - 直接抛出异常
    async executeAndThrow<T = any>(taskName: string, ...args: any[]): Promise<T> {
        const result = await this.executeTaskInternal(taskName, ...args);
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Task execution failed');
    }


    // 私有方法：实际的任务执行逻辑
    private async executeTaskInternal(taskName: string, ...args: any[]): Promise<TaskResult> {
        return new Promise((resolve, reject) => {
            if (!this.workerProcess) {
                resolve({
                    success: false,
                    error: 'Worker process not available'
                });
                return;
            }

            const taskId = `task-${++this.taskIdCounter}-${Date.now()}`;
            const timeout =30000; // 默认30秒超时

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

            this.workerProcess.send({
                type: 'execute-task',
                taskId,
                taskName,
                args
            });
        });
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
