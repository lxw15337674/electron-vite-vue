import { utilityProcess, MessagePortMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TaskResult {
    success: boolean;
    data?: any;
    error?: string;
    code?: number;
}

export interface TaskProgress {
    taskId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
    message?: string;
}

export class TaskExecutor {
    private utilityProcess: Electron.UtilityProcess | null = null;
    private messagePort: MessagePortMain | null = null;
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

            console.log('Utility process worker path:', workerPath);

            // 创建utility process
            this.utilityProcess = utilityProcess.fork(workerPath, [], {
                serviceName: 'system-task-worker',
                allowLoadingUnsignedLibraries: true,
                env: process.env,
                stdio: 'pipe'
            });

            // 创建MessageChannel进行通信
            const { port1, port2 } = new MessageChannel();
            this.messagePort = port1;

            // 监听utility process的消息
            this.messagePort.on('message', (event) => {
                this.handleWorkerMessage(event.data);
            });

            // 监听utility process的错误
            this.utilityProcess.on('exit', (code) => {
                console.log(`Utility process exited with code ${code}`);
                if (code !== 0 && !this.restartCooldown) {
                    this.restartWorker();
                }
            });

            // 发送MessagePort给utility process
            this.utilityProcess.postMessage({ type: 'init', port: port2 }, [port2]);

            console.log('Utility process task worker initialized successfully');

            // 重置重启计数器，因为worker成功启动了
            this.restartAttempts = 0;
            this.restartCooldown = false;
        } catch (error) {
            console.error('Failed to initialize utility process worker:', error);
        }
    }

    private restartWorker() {
        if (this.restartAttempts >= this.maxRestartAttempts) {
            console.error('Max restart attempts reached. Stopping worker restart.');
            this.restartCooldown = true;
            return;
        }

        this.restartAttempts++;
        console.log(`Restarting worker process... (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);

        this.cleanup();

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
                    pendingTask.resolve({
                        success: true,
                        data: result
                    });
                } else {
                    pendingTask.resolve({
                        success: false,
                        error: error,
                        code: message.code
                    });
                }
            }
        }
    }

    async executeTask(taskName: string, ...args: any[]): Promise<TaskResult> {
        return new Promise((resolve, reject) => {
            if (!this.utilityProcess || !this.messagePort || this.restartCooldown) {
                resolve({
                    success: false,
                    error: this.restartCooldown ? 
                        'Utility process is in cooldown after multiple failures' :
                        'Utility process not available'
                });
                return;
            }

            const taskId = `task-${++this.taskIdCounter}-${Date.now()}`;

            // 设置超时（30秒）
            const timeout = setTimeout(() => {
                this.pendingTasks.delete(taskId);
                resolve({
                    success: false,
                    error: 'Task timeout',
                    code: -1
                });
            }, 30000);

            this.pendingTasks.set(taskId, { resolve, reject, timeout });

            // 通过MessagePort发送任务到utility process
            this.messagePort.postMessage({
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

    createHandler(taskName: string) {
        return async (_event: any, ...args: any[]) => {
            try {
                const result = await this.executeTask(taskName, ...args);

                if (result.success) {
                    return result.data;
                } else {
                    throw new Error(result.error || 'Task execution failed');
                }
            } catch (error) {
                console.error(`Task ${taskName} failed:`, error);
                throw error;
            }
        };
    }

    cleanup() {
        // 清理所有待处理的任务
        for (const [taskId, task] of this.pendingTasks) {
            clearTimeout(task.timeout);
            task.resolve({
                success: false,
                error: 'Task executor shutting down'
            });
        }
        this.pendingTasks.clear();

        // 关闭MessagePort
        if (this.messagePort) {
            this.messagePort.close();
            this.messagePort = null;
        }

        // 关闭utility process
        if (this.utilityProcess) {
            this.utilityProcess.kill();
            this.utilityProcess = null;
        }
    }
}

// 单例实例
export const taskExecutor = new TaskExecutor();
