#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 查找最新的日志文件
function findLatestLogFile() {
  const logsDir = path.join(__dirname, 'logs');
  
  if (!fs.existsSync(logsDir)) {
    console.log('No logs directory found. Start the application to generate logs.');
    return null;
  }
  
  const files = fs.readdirSync(logsDir)
    .filter(file => file.startsWith('worker-') && file.endsWith('.log'))
    .map(file => ({
      name: file,
      path: path.join(logsDir, file),
      mtime: fs.statSync(path.join(logsDir, file)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return files.length > 0 ? files[0].path : null;
}

// 显示日志
function showLogs(logPath, lines = 50) {
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const allLines = content.split('\n').filter(line => line.trim());
    const recentLines = allLines.slice(-lines);
    
    console.log(`\n📋 Worker Process Logs (Last ${recentLines.length} lines)`);
    console.log(`📁 File: ${logPath}`);
    console.log('─'.repeat(80));
    
    recentLines.forEach(line => {
      if (line.includes('[ERROR]')) {
        console.log(`\x1b[31m${line}\x1b[0m`); // Red
      } else if (line.includes('[INFO]')) {
        console.log(`\x1b[32m${line}\x1b[0m`); // Green
      } else if (line.includes('[DEBUG]')) {
        console.log(`\x1b[36m${line}\x1b[0m`); // Cyan
      } else {
        console.log(line);
      }
    });
    
    console.log('─'.repeat(80));
    console.log(`📊 Total lines in file: ${allLines.length}`);
    
  } catch (error) {
    console.error('❌ Error reading log file:', error.message);
  }
}

// 实时监控日志
function watchLogs(logPath) {
  console.log(`\n👀 Watching logs: ${logPath}`);
  console.log('Press Ctrl+C to stop...\n');
  
  let lastSize = 0;
  
  setInterval(() => {
    try {
      const stats = fs.statSync(logPath);
      if (stats.size > lastSize) {
        const content = fs.readFileSync(logPath, 'utf-8');
        const newContent = content.slice(lastSize);
        const newLines = newContent.split('\n').filter(line => line.trim());
        
        newLines.forEach(line => {
          if (line.includes('[ERROR]')) {
            console.log(`\x1b[31m${line}\x1b[0m`);
          } else if (line.includes('[INFO]')) {
            console.log(`\x1b[32m${line}\x1b[0m`);
          } else if (line.includes('[DEBUG]')) {
            console.log(`\x1b[36m${line}\x1b[0m`);
          } else {
            console.log(line);
          }
        });
        
        lastSize = stats.size;
      }
    } catch (error) {
      // File might not exist yet or be locked
    }
  }, 1000);
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🔧 Worker Process Log Viewer\n');
  
  const logPath = findLatestLogFile();
  if (!logPath) {
    return;
  }
  
  switch (command) {
    case 'watch':
    case 'tail':
    case 'follow':
      watchLogs(logPath);
      break;
      
    case 'all':
      showLogs(logPath, Infinity);
      break;
      
    default:
      const lines = parseInt(command) || 50;
      showLogs(logPath, lines);
      console.log('\n💡 Usage:');
      console.log('  node view-logs.cjs [lines]    # Show last N lines (default: 50)');
      console.log('  node view-logs.cjs all        # Show all lines');
      console.log('  node view-logs.cjs watch      # Watch logs in real-time');
      break;
  }
}

// 处理Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

main();
