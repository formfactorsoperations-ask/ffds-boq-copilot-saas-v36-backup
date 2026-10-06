import { execSync } from 'child_process';
import fs from 'fs';

console.log('1. Cleaning dist...');
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist/assets', { recursive: true });

console.log('2. Preparing dist/index.html...');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<script type="module" src="/index.tsx"></script>', '<script type="module" src="/assets/index.js"></script>');
if (html.includes('src="/index.tsx"')) {
  html = html.replace('src="/index.tsx"', 'src="/assets/index.js"');
}
if (!html.includes('/assets/index.css')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="/assets/index.css">\n  </head>');
}
fs.writeFileSync('dist/index.html', html, 'utf8');

console.log('3. Copying public assets...');
if (fs.existsSync('public')) {
  fs.cpSync('public', 'dist', { recursive: true });
}

console.log('4. Gathering client environment variables...');
const clientEnv = {
  DEV: false,
  PROD: true,
  MODE: 'production',
  BASE_URL: '/'
};

// Copy any VITE_ env vars from process.env
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('VITE_') && typeof v === 'string') {
    clientEnv[k] = v;
  }
}

// Copy any VITE_ env vars from .env file if it exists
if (fs.existsSync('.env')) {
  const envText = fs.readFileSync('.env', 'utf8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key.startsWith('VITE_') && clientEnv[key] === undefined) {
        clientEnv[key] = val;
      }
    }
  }
}

// Ensure common VITE keys are defined so property accesses never fail
if (!clientEnv.VITE_RESEND_API_KEY) clientEnv.VITE_RESEND_API_KEY = '';
if (!clientEnv.VITE_STUDIO_NAME) clientEnv.VITE_STUDIO_NAME = '';
if (!clientEnv.VITE_STUDIO_PHONE) clientEnv.VITE_STUDIO_PHONE = '';
if (!clientEnv.VITE_STUDIO_LOGO_URL) clientEnv.VITE_STUDIO_LOGO_URL = '';
if (!clientEnv.VITE_BRAND_COLOR) clientEnv.VITE_BRAND_COLOR = '';
if (!clientEnv.VITE_SUPABASE_URL) clientEnv.VITE_SUPABASE_URL = '';
if (!clientEnv.VITE_SUPABASE_ANON_KEY) clientEnv.VITE_SUPABASE_ANON_KEY = '';
if (!clientEnv.VITE_APP_DOMAIN) clientEnv.VITE_APP_DOMAIN = '';
if (!clientEnv.VITE_PUBLIC_APP_URL) clientEnv.VITE_PUBLIC_APP_URL = '';

console.log('5. Bundling client with esbuild...');
const clientEnvJson = JSON.stringify(clientEnv);
const envDefines = Object.entries(clientEnv)
  .map(([k, v]) => `--define:import.meta.env.${k}=${JSON.stringify(JSON.stringify(v))}`)
  .join(' ');

execSync(
  `npx esbuild index.tsx --bundle --outfile=dist/assets/index.js --format=esm --conditions=style --loader:.tsx=tsx --loader:.ts=ts --loader:.css=css --jsx=automatic --jsx-import-source=react --minify --define:process.env.NODE_ENV=\\"production\\" --define:import.meta.env=${JSON.stringify(clientEnvJson)} ${envDefines}`,
  { stdio: 'inherit' }
);

console.log('5b. Compiling full Tailwind CSS bundle with @tailwindcss/cli...');
execSync(
  'npx @tailwindcss/cli -i src/index.css -o dist/assets/index.css --minify',
  { stdio: 'inherit' }
);

console.log('6. Bundling server with esbuild...');
execSync(
  'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --define:import.meta.env={} --define:import.meta={} --outfile=dist/server.cjs',
  { stdio: 'inherit' }
);

console.log('Build complete!');
