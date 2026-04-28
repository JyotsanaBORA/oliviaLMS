const cluster = require('node:cluster');
const os = require('os');

const WORKERS = parseInt(process.env.CLUSTER_WORKERS, 10) || Math.min(os.cpus().length, 4);

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} spawning ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.log(`Worker ${worker.process.pid} exited (code ${code}), respawning...`);
    cluster.fork();
  });
} else {
  require('./server.js');
}
