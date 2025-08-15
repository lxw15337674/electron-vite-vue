import { TaskExecutor, TaskResult, DiskInfo, SystemInfo, TaskExecutionOptions } from './taskExecutor';

/**
 * 任务管理器
 * 提供类型安全和简化的任务执行 API
 */
export class TaskManager {
    private taskExecutor: TaskExecutor;

    constructor(taskExecutor: TaskExecutor) {
        this.taskExecutor = taskExecutor;
    }

    /**
     * 安装 .deb 包
     * @param debPath .deb 文件路径
     * @returns 安装结果消息
     */
    async installDeb(debPath: string): Promise<string> {
        const result = await this.taskExecutor.execute<string>('install-deb', debPath);
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Failed to install deb package');
    }

    /**
     * 更新系统
     * @returns 更新结果消息
     */
    async updateSystem(): Promise<string> {
        const result = await this.taskExecutor.executeWithOptions<string>(
            'update-system',
            { timeout: 300000 } // 5分钟超时
        );
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Failed to update system');
    }

    /**
     * 安装软件包
     * @param packageName 包名
     * @returns 安装结果消息
     */
    async installPackage(packageName: string): Promise<string> {
        const result = await this.taskExecutor.execute<string>('install-package', packageName);
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Failed to install package');
    }

    /**
     * 管理系统服务
     * @param serviceName 服务名
     * @param action 操作类型
     * @returns 操作结果消息
     */
    async manageService(
        serviceName: string,
        action: 'start' | 'stop' | 'restart' | 'status' | 'enable' | 'disable'
    ): Promise<string> {
        const result = await this.taskExecutor.execute<string>('manage-service', serviceName, action);
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Failed to manage service');
    }

    /**
     * 检查磁盘空间
     * @returns 磁盘信息数组
     */
    async checkDiskSpace(): Promise<DiskInfo[]> {
        const result = await this.taskExecutor.execute<DiskInfo[]>('check-disk-space');
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Failed to check disk space');
    }

    /**
     * 获取系统信息
     * @returns 系统信息
     */
    async getSystemInfo(): Promise<SystemInfo> {
        const result = await this.taskExecutor.execute<SystemInfo>('get-system-info');
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Failed to get system info');
    }

    /**
     * 通用任务执行方法（保持灵活性）
     * @param taskName 任务名称
     * @param args 任务参数
     * @returns 任务结果
     */
    async execute<T = any>(taskName: string, ...args: any[]): Promise<T> {
        const result = await this.taskExecutor.execute<T>(taskName, ...args);
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Task execution failed');
    }

    /**
     * 通用任务执行方法（带选项）
     * @param taskName 任务名称
     * @param options 执行选项
     * @param args 任务参数
     * @returns 任务结果
     */
    async executeWithOptions<T = any>(
        taskName: string,
        options: TaskExecutionOptions,
        ...args: any[]
    ): Promise<T> {
        const result = await this.taskExecutor.executeWithOptions<T>(taskName, options, ...args);
        if (result.success) {
            return result.data!;
        }
        throw new Error(result.error || 'Task execution failed');
    }

    /**
     * 检查任务管理器是否可用
     */
    isAvailable(): boolean {
        return this.taskExecutor.isAvailable();
    }

    /**
     * 获取最近的日志
     */
    getRecentLogs(lines?: number): string[] {
        return this.taskExecutor.getRecentLogs(lines);
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.taskExecutor.dispose();
    }
}
