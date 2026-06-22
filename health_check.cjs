const http = require('http');
http.get('http://localhost:3000', (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => console.log('HTTP ' + res.statusCode));
}).on('error', (e) => console.log('Error: ' + e.message));
