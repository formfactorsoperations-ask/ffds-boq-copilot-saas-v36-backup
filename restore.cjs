const { execSync } = require('child_process');

console.log('Sending kill signals to system processes to force a Cloud Run container restart...');
try {
  // Kill tail -f /dev/null
  process.kill(15, 'SIGTERM');
  console.log('Killed tail.');
} catch (e) {
  console.log('Error killing tail:', e.message);
}

try {
  // Kill control-plane-api
  process.kill(6, 'SIGTERM');
  console.log('Killed control-plane-api.');
} catch (e) {
  console.log('Error killing control plane:', e.message);
}

try {
  // Kill start.sh
  process.kill(1, 'SIGTERM');
  console.log('Killed start.sh.');
} catch (e) {
  console.log('Error killing start.sh:', e.message);
}
