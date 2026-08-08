const { spawn } = require('child_process');
const path = require('path');

let serverProcess = null;
let restartCount = 0;
const maxRestarts = 5;

function startServer() {
  console.log(`Starting server (attempt ${restartCount + 1}/${maxRestarts})...`);
  
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  serverProcess.on('close', (code) => {
    console.log(`\nServer process exited with code ${code}`);
    
    if (code !== 0 && restartCount < maxRestarts) {
      restartCount++;
      console.log(`Restarting server in 3 seconds... (${restartCount}/${maxRestarts})`);
      setTimeout(startServer, 3000);
    } else if (restartCount >= maxRestarts) {
      console.error('Max restart attempts reached. Please check logs for errors.');
      process.exit(1);
    }
  });

  serverProcess.on('error', (error) => {
    console.error('Server process error:', error);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down monitor...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      serverProcess.kill('SIGKILL');
    }, 5000);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down monitor...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      serverProcess.kill('SIGKILL');
    }, 5000);
  }
  process.exit(0);
});

console.log('Starting LMS Server Monitor...');
startServer();
