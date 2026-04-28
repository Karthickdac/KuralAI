const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const API  = process.env.API_URL  || 'http://localhost:3000';
const OUT  = path.resolve(__dirname, 'screenshots');

const PAGES = [
  { route: '/login',                            file: '01-login.png',                 label: 'Login screen' },
  { route: '/',                                 file: '02-tenant-dashboard.png',      label: 'Tenant dashboard' },
  { route: '/customers',                        file: '03-customers.png',             label: 'Customers' },
  { route: '/campaigns',                        file: '04-campaigns.png',             label: 'Campaigns' },
  { route: '/calls',                            file: '05-calls.png',                 label: 'Calls history' },
  { route: '/templates',                        file: '06-templates.png',             label: 'Prompt templates' },
  { route: '/workflows',                        file: '07-workflows.png',             label: 'Call workflows' },
  { route: '/dynamic-call',                     file: '08-dynamic-call.png',          label: 'Dynamic single call' },
  { route: '/simulate',                         file: '09-simulate.png',              label: 'Simulate / test agent' },
  { route: '/crm',                              file: '10-crm.png',                   label: 'CRM integration' },
  { route: '/reports',                          file: '11-reports.png',               label: 'Reports' },
  { route: '/billing',                          file: '12-billing.png',               label: 'Billing & credits' },
  { route: '/users',                            file: '13-users.png',                 label: 'Users (admin)' },
  { route: '/settings',                         file: '14-settings.png',              label: 'Settings' },
  { route: '/api-config',                       file: '15-api-config.png',            label: 'API configuration' },
  { route: '/superadmin',                       file: '20-superadmin-dashboard.png',  label: 'Super admin dashboard' },
  { route: '/superadmin/organizations',         file: '21-superadmin-organizations.png', label: 'Organizations (super admin)' },
  { route: '/superadmin/plans',                 file: '22-superadmin-plans.png',      label: 'Subscription plans' },
  { route: '/superadmin/usage',                 file: '23-superadmin-usage.png',      label: 'Usage analytics' },
  { route: '/superadmin/revenue',               file: '24-superadmin-revenue.png',    label: 'Revenue overview' },
];

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.DOC_USER || 'superadmin@kuralai.com',
      password: process.env.DOC_PASS || 'KuralAI@Super123',
    }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const auth = await login();
  console.log('✓ Logged in as', auth.user.email);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH || '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 30000 });

  await page.evaluate((authData) => {
    localStorage.setItem('kuralai_token', authData.token);
    localStorage.setItem('kuralai_user', JSON.stringify(authData.user));
  }, auth);

  for (const p of PAGES) {
    const url = BASE + p.route;
    process.stdout.write(`→ ${p.route} ... `);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({
        path: path.join(OUT, p.file),
        fullPage: true,
      });
      console.log('OK');
    } catch (e) {
      console.log('FAIL', e.message);
    }
  }

  await browser.close();
  console.log('\n✓ Done. Screenshots saved to', OUT);
})().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
