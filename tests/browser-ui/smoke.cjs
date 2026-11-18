/* Synthetic local browser QA only. Never connect this harness to a real service. */
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const appRequire = createRequire(process.cwd() + '/package.json');
const { encode } = appRequire('next-auth/jwt');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const playwrightVersion = require(process.env.PLAYWRIGHT_MODULE + '/package.json').version;
const origin = 'http://127.0.0.1:3173';
const output = process.env.VISUAL_OUTPUT || 'visual-results';
const secret = randomBytes(32).toString('hex');
const results = [];
const failures = [];
const browserDiagnostics = [];
let server;
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const emptyPage = { content: [], page: 0, size: 50, totalElements: 0 };
const rule = { id: 'qa-rule', name: 'Synthetic QA rule', enabled: true, scope: 'PER_IP', keyStrategyId: 'ip', onLimitExceedPolicy: 'REJECT_REQUEST', bands: [{windowSeconds: 60, capacity: 30, label: 'QA only'}], ruleSetId: 'qa-fixture', tags: ['synthetic'], attributes: {}, version: 0 };
function fixture(path, params, mode, admin) {
  const now = Math.floor(Date.now() / 60000) * 60000;
  const to = Number(params.get('to')) || now;
  const from = Number(params.get('from')) || to - 5 * 60000;
  const buckets = Array.from({length: 5}, (_, i) => ({start: from + i * 60000, allowed: mode === 'empty' ? 0 : 20 + i * 3, rejected: mode === 'empty' ? 0 : i % 2}));
  const total = buckets.reduce((n, b) => n + b.allowed + b.rejected, 0);
  const rejected = buckets.reduce((n, b) => n + b.rejected, 0);
  const set = {ruleSetId: 'qa-fixture', total, rejected, rejectRate: total ? rejected / total : 0, lastDecisionAt: mode === 'empty' ? null : to - 1000, trend: buckets.map(b => b.rejected)};
  if (path === '/api/me') return { username: 'qa-fixture', name: 'SYNTHETIC QA', roles: [admin ? 'ADMIN' : 'VIEWER'], canWrite: admin };
  if (path === '/api/monitoring/timeseries') return {window: '5m', from, to, bucketMillis: 60000, buckets};
  if (path === '/api/monitoring/overview') return {window: '5m', from, to, total, rejected, rejectRate: total ? rejected / total : 0, ruleSets: [set]};
  if (path === '/api/monitoring/top-rejected') return mode === 'empty' ? [] : [{ruleSetId: 'qa-fixture', key: admin ? 'synthetic-key-not-a-real-user' : 'synthetic***', masked: !admin, rejected: 2, lastRejectedAt: to - 1000}];
  if (path === '/api/dashboard/stats') return {totalRules: 1, activeRules: 1, disabledRules: 0, totalRuleSets: 1, lastUpdated: new Date(to).toISOString()};
  if (path === '/api/rules') return params.has('page') ? {...emptyPage, content: [rule], totalElements: 1} : [rule];
  if (path === '/api/keys/transforms') return ['none', 'sha256'];
  if (path === '/api/audit') return emptyPage;
  if (path === '/api/events') return {
    items: mode === 'empty' ? [] : [{
      id: params.has('cursor') ? 'synthetic-page-two' : 'synthetic-page-one',
      occurredAt: to - 1000,
      ruleSetId: 'synthetic-events-' + 'long-rule-set-'.repeat(8),
      ruleId: params.has('cursor') ? 'synthetic-second-page' : 'synthetic-first-page',
      allowed: params.get('outcome') === 'ALLOW', remainingTokens: 0, retryAfterMillis: 1000,
      key: 'DO-NOT-RENDER-KEY', clientIp: 'DO-NOT-RENDER-IP', attributes: {secret:'DO-NOT-RENDER-SECRET'},
    }],
    nextCursor: mode === 'empty' || params.has('cursor') ? null : 'opaque+/=cursor',
  };

  throw new Error('Unmocked API path: ' + path);
}
async function contextFor(width, locale, theme, admin = true) {
  const context = await browser.newContext({viewport: {width, height: 900}, locale: locale === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce', serviceWorkers: 'block'});
  context.setDefaultTimeout(10000);
  context.setDefaultNavigationTimeout(15000);
  context.on('page', page => {
    page.on('pageerror', error => browserDiagnostics.push({kind:'exception',url:page.url(),message:error.stack || error.message}));
    page.on('console', message => { if(message.type()==='error') browserDiagnostics.push({kind:'console',message:message.text()}); });
    page.on('response', response => { if(response.status()>=400) browserDiagnostics.push({kind:'http',status:response.status(),url:response.url()}); });
  });
  const token = await encode({secret, token: {sub: 'synthetic-qa', name: 'SYNTHETIC QA', expiresAt: Math.floor(Date.now()/1000)+3600}, maxAge: 3600});
  await context.addCookies([{name: 'next-auth.session-token', value: token, url: origin, httpOnly: true, sameSite: 'Lax'}, {name: 'studio_locale', value: locale, url: origin}]);
  await context.addInitScript(({mode, allowedOrigin}) => {
    // Init scripts also run in opaque about:blank documents; only seed our fixture.
    if (location.origin === allowedOrigin) localStorage.setItem('studio-color-mode', mode);
  }, {mode: theme, allowedOrigin: origin});
  let mode = 'normal';
  const unexpected = [];
  const eventRequests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push('External request: '+url.origin); await route.abort(); return; }
    if (url.pathname === '/api/auth/session') {await route.fulfill({json: {user: {name: 'SYNTHETIC QA'}, expires: new Date(Date.now()+3600000).toISOString()}});return;}
    if (url.pathname.startsWith('/api/proxy/')) {
      const path = url.pathname.slice('/api/proxy'.length);
      if (path === '/api/events') eventRequests.push(Object.fromEntries(url.searchParams));
      if (route.request().method() !== 'GET') { unexpected.push('Unexpected write: '+path);await route.fulfill({status: 405,json:{message:'No writes in visual QA'}});return; }
      if ((mode === 'error' && path !== '/api/me') || (mode === 'counts-error' && path === '/api/monitoring/overview')) {await route.fulfill({status:path === '/api/events' ? 500 : 503,json:{message:'Synthetic QA failure'}});return;}
      try {await route.fulfill({json:fixture(path,url.searchParams,mode,admin)});} catch(error) {unexpected.push(error.message);await route.fulfill({status:500,json:{message:error.message}});}
      return;
    }
    await route.continue();
  });
  return {context, setMode: value => {mode=value;}, unexpected, eventRequests};
}
async function capture(page, name) {
  await page.evaluate(() => {
    if (document.getElementById('qa-fixture-label')) return;
    const label = document.createElement('div');
    label.id = 'qa-fixture-label';label.textContent = 'SYNTHETIC UI QA · NOT PRODUCTION DATA';
    Object.assign(label.style,{position:'fixed',bottom:'0',left:'0',zIndex:'9999',font:'10px monospace',background:'#111',color:'#fff',padding:'3px 8px',pointerEvents:'none'});
    document.body.append(label);
  });
  await page.screenshot({path: output+'/'+name+'.png',fullPage:true});
  const dimensions = await page.evaluate(() => {
    const main=document.querySelector('#main');
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,mainClient:main?.clientWidth,mainScroll:main?.scrollWidth};
  });
  assert.ok(dimensions.document <= dimensions.viewport + 1, name+' document horizontal overflow '+JSON.stringify(dimensions));
  assert.ok(dimensions.mainScroll <= dimensions.mainClient + 1, name+' main horizontal overflow '+JSON.stringify(dimensions));
  results.push({name,dimensions});
}
async function scenario(name, run) {console.log('Scenario:',name);try {await run();} catch(error) {failures.push({name,error:error.stack});console.error(name,error.message);}}
(async()=>{
  await mkdir(output,{recursive:true});
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3173'],{env:{...process.env,NEXTAUTH_URL:origin,NEXTAUTH_SECRET:secret,ADMIN_API_URL:'http://127.0.0.1:9',NEXT_PUBLIC_API_URL:'http://127.0.0.1:9',KEYCLOAK_ISSUER:'http://127.0.0.1:9/qa',KEYCLOAK_CLIENT_ID:'qa-only',KEYCLOAK_CLIENT_SECRET:'qa-only'},stdio:['ignore','inherit','inherit']});
  let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(origin+'/login');if(r.ok){ready=true;break;}}catch{}await delay(500);}
  assert.ok(ready,'Local Next server did not start');
  browser=await chromium.launch();
  for(const width of [360,390,768,1280])for(const locale of ['en','ko'])for(const theme of ['dark','light']){
    const name=width+'-'+locale+'-'+theme;
    await scenario(name,async()=>{
      const fixtureContext=await contextFor(width,locale,theme);
      try{
        const page=await fixtureContext.context.newPage();const errors=[];page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
        for(const screen of ['overview','rules','keys','audit','events']){
          await page.goto(origin+'/'+screen+'?refresh=off',{waitUntil:'networkidle'});
          assert.ok(!page.url().includes('/login'),'Unexpected login redirect');
          await page.screenshot({path: output+'/'+name+'-'+screen+'-before-check.png',fullPage:true});
          await page.locator('#main h1').first().waitFor();await delay(250);
          if(screen==='overview'){
            await page.locator('.uplot canvas').first().waitFor();
            assert.equal(await page.locator('[data-chart-load-error]').count(),0,'Normal locale chart failure');
          }
          if (screen === 'events' && width < 768) {
            const grid = page.locator('table').first();
            assert.ok((await grid.locator('tbody tr').first().boundingBox()).height < 220, 'Identifiers should fit a readable row');
            const scroll = page.getByRole('region', { name: locale === 'en' ? 'Decision events' : '판정 이벤트' });
            assert.ok(await scroll.evaluate(el => el.scrollWidth > el.clientWidth));
            await scroll.focus();
            await page.keyboard.press('End');
            await grid.locator('th').last().scrollIntoViewIfNeeded();
            assert.ok(await scroll.evaluate(el => el.scrollLeft > 0));
            await scroll.evaluate(el => el.scrollLeft = 0);
          }
          await capture(page,name+'-'+screen);
          assert.deepEqual(errors,[],name+' / '+screen+' browser exceptions');
        }
        assert.deepEqual(errors,[],'Browser exceptions');assert.deepEqual(fixtureContext.unexpected,[],'Requests escaped fixture');
      }finally{await fixtureContext.context.close();}
    });
  }
  await scenario('empty-error-stale-recovery',async()=>{
    const f=await contextFor(1280,'en','dark');
    try{
      const page=await f.context.newPage();
      f.setMode('empty');await page.goto(origin+'/overview?refresh=off',{waitUntil:'networkidle'});await page.getByText('No decisions in the selected range.',{exact:true}).first().waitFor();await capture(page,'state-empty');
      f.setMode('error');await page.reload({waitUntil:'networkidle'});await page.getByText('Could not load this panel.',{exact:true}).first().waitFor();await capture(page,'state-error');
      f.setMode('normal');await page.reload({waitUntil:'networkidle'});await delay(250);
      f.setMode('error');await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Refresh failed. Displayed values are from the last successful response.',{exact:true}).first().waitFor();await capture(page,'state-stale');
      await page.getByRole('button',{name:/Decisions Panel menu/}).click();await page.getByRole('menuitem',{name:'View',exact:true}).click();await page.getByRole('dialog').getByText('Refresh failed. Displayed values are from the last successful response.',{exact:true}).waitFor();await capture(page,'state-stale-expanded');await page.keyboard.press('Escape');
      f.setMode('normal');await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Refresh failed. Displayed values are from the last successful response.',{exact:true}).first().waitFor({state:'hidden'});
      assert.deepEqual(f.unexpected,[]);
    }finally{await f.context.close();}
  });
  await scenario('tooltip-viewport-and-focus',async()=>{
    for(const width of [360,1280]){
      const f=await contextFor(width,'en','dark');
      try{
        const page=await f.context.newPage();
        await page.goto(origin+'/overview?refresh=off',{waitUntil:'networkidle'});
        const anchors=page.locator('#main header span[tabindex="0"]');
        assert.ok(await anchors.count()>0,'No tooltip anchors tested');
        for(let i=0;i<await anchors.count();i++){
          await anchors.nth(i).scrollIntoViewIfNeeded();
          await anchors.nth(i).focus();
          const tip=page.getByRole('tooltip');
          await tip.waitFor();
          const rect=await tip.boundingBox();
          assert.ok(rect && rect.x>=0 && rect.x+rect.width<=width,'Tooltip outside viewport');
          await page.keyboard.press('Escape');
          await tip.waitFor({state:'hidden'});
          await anchors.nth(i).evaluate(el=>el.blur());
        }
        await anchors.first().hover();
        await page.getByRole('tooltip').waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('tooltip').waitFor({state:'hidden'});
        await capture(page,'tooltip-focus-'+width);
        assert.deepEqual(f.unexpected,[]);
      }finally{await f.context.close();}
    }
  });
  await scenario('invalid-browser-locale-isolated',async()=>{
    const f=await contextFor(1280,'en','dark');
    try{
      await f.context.addInitScript(()=>Object.defineProperty(navigator,'language',{configurable:true,get:()=> 'en-US@posix'}));
      const page=await f.context.newPage();const errors=[];page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
      await page.goto(origin+'/overview?refresh=off',{waitUntil:'networkidle'});
      await page.locator('#main h1').first().waitFor();
      await page.locator('[data-chart-load-error]').first().waitFor();
      assert.equal(await page.locator('#main').count(),1);
      assert.deepEqual(errors,[],'Locale failure escaped chart');
      assert.deepEqual(f.unexpected,[]);
      await capture(page,'invalid-browser-locale');
    }finally{await f.context.close();}
  });
  await scenario('rules-search-review-keyboard',async()=>{
    for (const width of [390, 1280]) {
      const f = await contextFor(width, 'en', width === 390 ? 'light' : 'dark');
      try {
        const page = await f.context.newPage();
        f.setMode('counts-error');
        await page.goto(origin + '/rules', {waitUntil:'networkidle'});
        await page.getByText('Rule-set rejection counts could not be loaded.').waitFor();
        await page.getByText('– rejected in 24 hours').waitFor();
        f.setMode('normal');
        await page.getByRole('button', {name:'Retry', exact:true}).click();
        await page.getByText('2 rejected in 24 hours').waitFor();
        const search = page.getByRole('searchbox', {name:'Search rules'});
        await search.fill('no match');
        await page.getByText('Showing 0 of 1 rules').waitFor();
        await page.getByRole('button', {name:'Clear search'}).click();
        await page.getByText('Showing 1 of 1 rules').waitFor();
        await page.getByRole('button', {name:'New rule'}).click();
        await page.locator('#rule-id').fill('qa-new');
        await page.locator('#rule-name').fill('QA new rule');
        await page.getByRole('button', {name:'Review changes'}).click();
        const review = page.getByRole('dialog', {name:'Review the change'});
        await review.waitFor();
        const cancel = review.getByRole('button', {name:'Cancel'});
        assert.ok(await cancel.evaluate(el => el === document.activeElement));
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Shift+Tab');
        assert.ok(await review.evaluate(el => el.contains(document.activeElement)));
        await capture(page, 'rule-confirm-' + width);
        await page.keyboard.press('Escape');
        await review.waitFor({state:'hidden'});
        assert.equal(await page.locator('#rule-id').inputValue(), 'qa-new');
        assert.deepEqual(f.unexpected, []);
      } finally { await f.context.close(); }
    }
  });
  await scenario('rules-create-edit-confirmation', async () => {
    const f = await contextFor(1280, 'en', 'dark');
    const fixtureRules = [rule];
    const writes = [];
    try {
      await f.context.route(origin + '/api/proxy/api/rules**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const base = '/api/proxy/api/rules';
        if (request.method() === 'GET' && url.pathname === base) {
          return route.fulfill({json:fixtureRules});
        }
        if (request.method() === 'POST' && url.pathname === base) {
          const created = {...request.postDataJSON(), version:0};
          fixtureRules.push(created);
          writes.push('create');
          return route.fulfill({status:201, json:created});
        }
        if (request.method() === 'PUT' && url.pathname === base + '/new-fixture'
            && url.searchParams.get('ruleSetId') === 'qa-fixture'
            && request.headers()['if-match'] === '0') {
          const updated = {...fixtureRules[1], ...request.postDataJSON(), version:1};
          fixtureRules[1] = updated;
          writes.push('update');
          return route.fulfill({json:updated});
        }
        return route.fallback();
      });
      const page = await f.context.newPage();
      await page.goto(origin + '/rules', {waitUntil:'networkidle'});
      await page.getByRole('button', {name:'New rule'}).click();
      await page.locator('#rule-id').fill('new-fixture');
      await page.locator('#rule-name').fill('New fixture');
      await page.locator('#rule-set').fill('qa-fixture');
      await page.getByRole('button', {name:'Review changes'}).click();
      assert.deepEqual(writes, []);
      await page.getByRole('button', {name:'Reset counts and save'}).click();
      const row = page.getByRole('row').filter({hasText:'new-fixture'});
      await row.getByText('New fixture', {exact:true}).waitFor();
      await row.getByRole('button', {name:'Edit', exact:true}).click();
      await page.locator('#rule-name').fill('Updated fixture');
      await page.getByRole('button', {name:'Review changes'}).click();
      assert.deepEqual(writes, ['create']);
      await page.getByRole('button', {name:'Reset counts and save'}).click();
      await row.getByText('Updated fixture', {exact:true}).waitFor();
      assert.deepEqual(writes, ['create', 'update']);
      assert.deepEqual(f.unexpected, []);
    } finally { await f.context.close(); }
  });
  await scenario('events-filters-pagination-recovery',async()=>{
    const f=await contextFor(1280,'en','dark');
    const page=await f.context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
    try{
      const now = new Date('2026-11-19T00:14:56.789Z');
      await page.clock.setFixedTime(now);
      await page.goto(origin+'/events',{waitUntil:'networkidle'});
      await page.getByRole('cell',{name:'synthetic-first-page',exact:true}).waitFor();
      await page.getByText('Page received', {exact:true}).waitFor();
      const first={...f.eventRequests.at(-1)};
      assert.equal(Number(first.to), now.getTime() + 1);
      assert.equal(Number(first.to) - Number(first.from), 3_600_000);
      assert.equal(await page.locator('#events-to').evaluate(el => new Date(el.value).getTime()), Number(first.to));
      assert.ok((await page.locator('dl').innerText()).includes(':56.790'));
      assert.equal(first.limit,'50');assert.ok(Number(first.to)-Number(first.from)<=86400000);
      assert.ok(!(await page.locator('body').innerText()).includes('DO-NOT-RENDER'));
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.getByRole('cell',{name:'synthetic-second-page',exact:true}).waitFor();
      const second=f.eventRequests.at(-1);assert.equal(second.cursor,'opaque+/=cursor');assert.equal(second.from,first.from);assert.equal(second.to,first.to);
      assert.ok(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
      await page.getByRole('button',{name:'Previous',exact:true}).click();
      await page.getByRole('cell',{name:'synthetic-first-page',exact:true}).waitFor();
      await page.getByLabel('Result',{exact:true}).selectOption('ALLOW');
      await page.getByRole('button',{name:'Apply filters',exact:true}).click();
      await page.getByRole('cell',{name:'Allowed',exact:true}).waitFor();
      assert.equal(f.eventRequests.at(-1).to, first.to);
      assert.equal(f.eventRequests.at(-1).outcome,'ALLOW');assert.equal(f.eventRequests.at(-1).cursor,undefined);
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.getByRole('cell',{name:'synthetic-second-page',exact:true}).waitFor();
      await page.getByLabel('From (local time)',{exact:true}).fill('2026-01-01T10:00');
      await page.getByLabel('To (local time)',{exact:true}).fill('2026-01-01T11:00');
      await page.getByRole('button',{name:'Apply filters',exact:true}).click();
      await page.getByRole('cell',{name:'synthetic-first-page',exact:true}).waitFor();
      assert.equal(Number(f.eventRequests.at(-1).to)-Number(f.eventRequests.at(-1).from),3600000);
      assert.equal(f.eventRequests.at(-1).cursor,undefined);
      assert.ok(await page.getByRole('button',{name:'Previous',exact:true}).isDisabled());
      const applied = page.locator('dl').filter({hasText:'Applied interval'});
      const appliedText = await applied.innerText();
      const count=f.eventRequests.length;
      await page.getByLabel('To (local time)',{exact:true}).fill('2026-01-03T11:00');
      await page.getByRole('button',{name:'Apply filters',exact:true}).click();
      await page.getByText('Choose a valid interval of up to 24 hours.',{exact:true}).waitFor();await delay(200);assert.equal(f.eventRequests.length,count);
      assert.equal(await applied.innerText(), appliedText);
      const refreshed = new Date(now.getTime() + 12_345);
      await page.clock.setFixedTime(refreshed);
      f.setMode('error');await page.getByRole('button',{name:'Refresh latest hour',exact:true}).click();
      await page.getByText('Could not load recorded events. Try again.',{exact:true}).waitFor();
      assert.equal(Number(f.eventRequests.at(-1).to), refreshed.getTime() + 1);
      await capture(page,'events-error');
      f.setMode('normal');await page.getByRole('button',{name:'Retry',exact:true}).click();
      await page.getByRole('cell',{name:'synthetic-first-page',exact:true}).waitFor();
      f.setMode('empty');await page.getByRole('button',{name:'Refresh latest hour',exact:true}).click();
      await page.getByText('No recorded events in this interval.',{exact:true}).waitFor();
      assert.ok(await page.getByRole('button',{name:'Next',exact:true}).isDisabled());
      await capture(page,'events-empty');
      f.setMode('normal');await page.getByRole('button',{name:'Refresh latest hour',exact:true}).click();
      await page.getByRole('cell',{name:'synthetic-first-page',exact:true}).waitFor();
      assert.deepEqual(f.unexpected,[]);assert.deepEqual(errors,[]);
    }finally{await f.context.close();}
  });
  await scenario('events-viewer-denied',async()=>{
    const f=await contextFor(390,'en','dark',false);const page=await f.context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
    try{
      await page.goto(origin+'/events',{waitUntil:'networkidle'});
      await page.getByText('You do not have permission to view this page.',{exact:true}).waitFor();
      assert.equal(await page.locator('nav a[href="/events"]').count(),0);
      assert.equal(f.eventRequests.length,0);
      await capture(page,'events-viewer');assert.deepEqual(f.unexpected,[]);assert.deepEqual(errors,[]);
    }finally{await f.context.close();}
  });
  await scenario('viewer-navigation',async()=>{
    const f=await contextFor(390,'en','dark',false);
    try{const page=await f.context.newPage();await page.goto(origin+'/overview?refresh=off',{waitUntil:'networkidle'});assert.equal(await page.locator('nav a[href="/keys"]').count(),0);assert.equal(await page.locator('nav a[href="/audit"]').count(),0);await capture(page,'viewer-mobile');assert.deepEqual(f.unexpected,[]);}finally{await f.context.close();}
  });
})().catch(e=>failures.push({name:'harness',error:e.stack})).finally(async()=>{
  if(browser)await browser.close();if(server)server.kill('SIGTERM');
  await writeFile(output+'/report.json',JSON.stringify({synthetic:true,playwright:playwrightVersion,results,failures,browserDiagnostics,limitations:['No real backend, auth provider or production data','No manual visual judgement or WCAG certification','Rule create/edit writes use an in-memory browser fixture']},null,2));
  console.log('Captured',results.length,'views; failures:',failures.length);process.exitCode=failures.length?1:0;
});

