import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const fixturePath = path.join(here, 'synthetic-backup-v1.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const SECRET = 'unit-test-secret-value';
const outDir = process.env.ARTIFACT_DIR || '/tmp/media-test-out';
fs.mkdirSync(outDir, { recursive: true });

const report = {
  at: new Date().toISOString(),
  passed: [],
  failed: [],
  live: {},
  limits: [],
  screenshots: []
};

function ok(name) { report.passed.push(name); }
function fail(name, detail) {
  report.failed.push({ name, detail: String(detail) });
  const err = new Error(name + ': ' + detail);
  err.soft = false;
  throw err;
}
function assert(name, cond, detail) {
  if (!cond) fail(name, detail || 'assertion failed');
  ok(name);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(child); } }, 400);
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    child.stderr.on('data', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(child); } });
  });
}

async function boot(browser, options) {
  const context = await browser.newContext({
    colorScheme: options && options.colorScheme || 'dark',
    viewport: options && options.viewport || { width: 1280, height: 800 },
    serviceWorkers: 'allow'
  });
  if (options && options.init) await context.addInitScript(options.init);
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  page.on('pageerror', (err) => logs.push('PAGEERROR ' + err.message));
  await page.goto('http://127.0.0.1:8765/media/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ZF && document.getElementById('summary'));
  return { context, page, logs };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const { context, page, logs } = await boot(browser);
    assert('fresh library is empty', await page.evaluate(() => ZF.items().length === 0 && document.body.innerText.indexOf('示例动画甲') < 0));
    assert('no synthetic titles in the shipped page', !fs.readFileSync(path.join(repo, 'media/index.html'), 'utf8').includes('示例动画甲'));

    const dates = await page.evaluate(() => {
      const leap = ZF.addDays({ y: 2024, m: 2, d: 29 }, 1);
      const nonLeap = ZF.addDays({ y: 2023, m: 2, d: 28 }, 1);
      return {
        leap, nonLeap,
        span: ZF.daysUntil('2026-11-08', '2026-11-06'),
        yearSpan: ZF.daysUntil('2027-11-06', '2026-11-06'),
        dst: ZF.daysUntil('2026-03-09', '2026-03-08'),
        invalid: ZF.parseYMD('2026-02-31'),
        looseInvalid: ZF.precisionFromLoose('2026-02-31'),
        looseMonth: ZF.precisionFromLoose('2026-11'),
        looseYear: ZF.precisionFromLoose('2026')
      };
    });
    assert('leap day rolls to March', dates.leap.y === 2024 && dates.leap.m === 3 && dates.leap.d === 1, JSON.stringify(dates.leap));
    assert('non-leap February rolls to March', dates.nonLeap.m === 3 && dates.nonLeap.d === 1);
    assert('civil day difference ignores clock timezone', dates.span === 2 && dates.yearSpan === 365 && dates.dst === 1, JSON.stringify(dates));
    assert('invalid calendar day is rejected', dates.invalid === null && dates.looseInvalid.precision === 'tbd');
    assert('month and year stay coarse', dates.looseMonth.precision === 'month' && dates.looseYear.precision === 'year');

    const access = await page.evaluate(() => {
      ZF.setToday('2026-11-06');
      const prefs = { region: 'CN', platforms: ['cinema', 'bilibili'] };
      const base = { availability: [
        { region: 'US', platform: 'cinema', event: 'theatrical', date: { precision: 'day', value: '2026-11-07' } },
        { region: 'CN', platform: 'cinema', event: 'theatrical', date: { precision: 'day', value: '2026-12-01' } },
        { region: 'CN', platform: 'bilibili', event: 'streaming', date: { precision: 'month', value: '2026-11' } }
      ]};
      const chosen = ZF.pickAvailability(base, prefs, '2026-11-06');
      const described = ZF.describeAccess(chosen);
      const monthOnly = ZF.describeAccess(ZF.pickAvailability({
        availability: [{ region: 'CN', platform: 'cinema', event: 'theatrical', date: { precision: 'month', value: '2026-11' } }]
      }, prefs, '2026-11-06'));
      const past = ZF.describeAccess(ZF.pickAvailability({
        availability: [{ region: 'CN', platform: 'cinema', event: 'theatrical', date: { precision: 'day', value: '2026-10-01' } }]
      }, prefs, '2026-11-06'));
      const tbd = ZF.describeAccess(ZF.pickAvailability({
        availability: [{ region: 'CN', platform: 'cinema', event: 'theatrical', date: { precision: 'tbd', value: null } }]
      }, prefs, '2026-11-06'));
      const need = ZF.describeAccess(ZF.pickAvailability(base, { region: '', platforms: [] }, '2026-11-06'));
      const own = ZF.pickAvailability({
        useOwnPref: true, prefRegion: 'US', prefPlatforms: ['cinema'],
        availability: base.availability
      }, prefs, '2026-11-06');
      return { chosen, described, monthOnly, past, tbd, need, ownDays: own.days, ownRegion: own.row && own.row.region };
    });
    assert('countdown uses the matching region and platform day', access.chosen.days === 25 && access.chosen.row.region === 'CN' && access.chosen.row.platform === 'cinema', JSON.stringify(access.chosen));
    assert('countdown copy does not promise access', access.described.text.includes('还差 25 天') && access.described.text.includes('不代表'));
    assert('month precision has no day count', access.monthOnly.kind === 'coarse' && access.monthOnly.days == null && !/还差\s*\d+\s*天/.test(access.monthOnly.text));
    assert('past day says the date arrived', access.past.kind === 'arrived' && access.past.text.includes('档期已到') && !access.past.text.includes('还差'));
    assert('tbd has no fabricated day', access.tbd.kind === 'coarse' && access.tbd.days == null && access.tbd.text.includes('待定'));
    assert('missing defaults do not borrow another region', access.need.kind === 'need-pref');
    assert('item override beats the global region', access.ownRegion === 'US' && access.ownDays === 1, JSON.stringify(access));

    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ZF);
    await page.click('#btnMore');
    await page.getByRole('button', { name: '导入备份' }).click();
    await page.fill('#impText', JSON.stringify(fixture));
    await page.getByRole('button', { name: '预览', exact: true }).click();
    const preview = await page.locator('#importPreview').innerText();
    assert('import preview warns same title different ids', preview.includes('同名不同 id') && preview.includes('syn_b1') && preview.includes('syn_b2'), preview);
    assert('import preview keeps unknown field names', preview.includes('customNote') && preview.includes('futureField') && preview.includes('orphanExt'), preview);
    await page.getByRole('button', { name: '只加新 id' }).click();
    await page.waitForFunction(() => ZF.items().length === 4);

    const imported = await page.evaluate(() => {
      ZF.setToday('2026-11-06');
      const items = ZF.items();
      const byId = Object.fromEntries(items.map((it) => [it.id, it]));
      const facts = ZF.episodeFacts(byId.syn_a1, '2026-11-06');
      return {
        ids: items.map((it) => it.id),
        titles: items.filter((it) => it.title === '同名示例剧').map((it) => it.id),
        a1: { note: byId.syn_a1.customNote, nested: byId.syn_a1.futureField && byId.syn_a1.futureField.nested, total: byId.syn_a1.total, personal: byId.syn_a1.personalStatus },
        b2ext: byId.syn_b2.orphanExt,
        b2personal: byId.syn_b2.personalStatus,
        c1: { total: byId.syn_c1.total, personal: byId.syn_c1.personalStatus, work: byId.syn_c1.status, finished: ZF.workFinished(byId.syn_c1, '2026-11-06') },
        facts
      };
    });
    assert('same title different ids both kept', imported.titles.length === 2 && imported.titles.includes('syn_b1') && imported.titles.includes('syn_b2'), JSON.stringify(imported.titles));
    assert('unknown fields preserved', imported.a1.note === 'unknown-field-should-be-preserved' && imported.a1.nested === true && imported.b2ext === 'same-title-different-id');
    assert('unknown total stays zero and is not personal completion', imported.a1.total === 0 && imported.a1.personal === 'in_progress' && imported.c1.total === 0 && imported.c1.personal === 'in_progress' && imported.c1.finished === true);
    assert('known total reached by the user can be personal completion without using total zero', imported.b2personal === 'completed');
    assert('projection labels estimate separately from confirmed and full season', imported.facts.gap.theo === 10 && imported.facts.gap.latest === 5 && imported.facts.gap.projecting === true && imported.facts.gap.estimatedUnwatched === 7 && imported.facts.gap.confirmedUnwatched === 2 && imported.facts.gap.seasonRemaining === null && imported.facts.latestText.includes('预计') && imported.facts.seasonText === '总量未知', JSON.stringify(imported.facts));

    await page.evaluate(() => { ZF.setToday('2026-11-06'); ZF.replaceLibrary(ZF.items()); });
    await page.evaluate(() => {
      const btn = document.querySelector('#btnTheme');
      if (document.documentElement.dataset.theme !== 'dark') btn.click();
    });
    const card = page.locator('.card[data-id="syn_a1"]');
    await card.waitFor();
    const cardText = await card.innerText();
    const cardData = await card.evaluate((el) => ({ gap: el.dataset.gap, season: el.dataset.season, estimate: el.dataset.estimate, confirmedGap: el.dataset.confirmedGap, personal: el.dataset.personal, work: el.dataset.workFinished }));
    assert('card shows estimate gap and unknown total separately', cardData.estimate === '1' && cardData.gap === '7' && cardData.confirmedGap === '2' && cardData.season === 'unknown' && cardText.includes('预计') && cardText.includes('总量未知') && !cardText.includes('共 0'), JSON.stringify(cardData) + cardText);
    assert('finished work with unknown total is still a pit', await page.locator('.card[data-id="syn_c1"]').getAttribute('data-pit') === '1' && await page.locator('.card[data-id="syn_c1"]').getAttribute('data-personal') === 'in_progress');

    await page.click('#btnMore');
    await page.getByRole('button', { name: 'AI 接口' }).click();
    await page.fill('#aiEndpoint', 'https://api.deepseek.com');
    await page.fill('#aiModel', 'deepseek-flash');
    await page.fill('#aiKey', SECRET);
    await page.locator('#aiRemember').check();
    await page.locator('#aiConfirm').check();
    await page.keyboard.press('Escape');
    const payload = await page.evaluate(() => ZF.exportPayload());
    assert('export schema is version 2', payload.includes('"version": 2') && payload.includes('"schema": 2') && JSON.parse(payload).app === '书影游助手');
    const backupId = await page.evaluate(() => ({
      legacy: ZF.readBackup({ app: '追番助手', version: 1, items: [{ id: 'a', title: '旧' }] }),
      current: ZF.readBackup({ app: '书影游助手', version: 2, schema: 2, items: [] }),
      foreign: ZF.readBackup({ app: '别的工具', version: 1, items: [{ id: 'a' }] })
    }));
    assert('legacy 追番助手 version 1 is accepted', backupId.legacy.ok === true && backupId.legacy.from === 'legacy-v1');
    assert('current schema 2 is accepted', backupId.current.ok === true && backupId.current.from === 'schema-2');
    assert('unknown backup identity is refused', backupId.foreign.ok === false);
    assert('export has no secret', !payload.includes(SECRET) && !payload.includes('apiKey') && !payload.includes('data:image'));
    assert('export roundtrip keeps unknown fields', (() => {
      const parsed = JSON.parse(payload);
      const a1 = parsed.items.find((it) => it.id === 'syn_a1');
      const b2 = parsed.items.find((it) => it.id === 'syn_b2');
      return a1 && a1.customNote === 'unknown-field-should-be-preserved' && a1.futureField.nested === true && a1.total === 0 && b2.orphanExt === 'same-title-different-id';
    })());
    assert('console did not receive the secret', !logs.some((line) => line.includes(SECRET)));
    const storedAi = await page.evaluate((store) => localStorage.getItem(store), await page.evaluate(() => ZF.AI_STORE));
    assert('remember writes local storage only after the user asks', storedAi && storedAi.includes(SECRET));

    await page.click('#btnMore');
    await page.getByRole('button', { name: '退回导入前的快照' }).click();
    await page.waitForFunction(() => ZF.items().length === 0);
    assert('rollback restores the pre-import snapshot', await page.evaluate(() => ZF.items().length === 0));

    await page.evaluate(() => {
      ZF.setToday('2026-11-06');
      ZF.setPrefs({ region: 'CN', platforms: ['cinema', 'bilibili', 'netflix', 'steam', 'bookstore'] });
      ZF.replaceLibrary([
        { id: 'book-plan', title: '示例书想读', mediaType: 'book', personalStatus: 'planned', author: '合成作者', bookProgress: null, availability: [{ region: 'CN', platform: 'bookstore', event: 'physical', date: { precision: 'year', value: '2026' }, source: 'user' }] },
        { id: 'book-done', title: '示例书已读', mediaType: 'book', personalStatus: 'completed', bookProgress: { mode: 'page', value: '120' } },
        { id: 'anime-air', title: '示例动画在看', mediaType: 'anime', personalStatus: 'in_progress', current: 3, latest: 5, latestDate: '2026-10-01', cycle: 7, total: 0, unit: '集', status: 'airing', latestOrigin: 'manual' },
        { id: 'series-known', title: '示例剧集', mediaType: 'series', personalStatus: 'planned', current: 1, latest: 4, latestDate: '2026-11-06', cycle: 0, total: 12, unit: '集', status: 'airing', latestOrigin: 'bangumi' },
        { id: 'movie-day', title: '示例电影档期', mediaType: 'movie', personalStatus: 'in_progress', availability: [
          { region: 'US', platform: 'cinema', event: 'theatrical', date: { precision: 'day', value: '2026-11-07' }, source: 'user' },
          { region: 'CN', platform: 'cinema', event: 'theatrical', date: { precision: 'day', value: '2026-12-01' }, source: 'user' },
          { region: 'CN', platform: 'bilibili', event: 'streaming', date: { precision: 'month', value: '2026-12' }, source: 'user' }
        ] },
        { id: 'movie-month', title: '示例电影年月', mediaType: 'movie', personalStatus: 'planned', availability: [{ region: 'CN', platform: 'cinema', event: 'theatrical', date: { precision: 'month', value: '2026-11' }, source: 'user' }] },
        { id: 'game-play', title: '示例游戏想玩', mediaType: 'game', personalStatus: 'planned', gameProgress: { percent: 40, note: '主线' }, availability: [{ region: 'CN', platform: 'steam', event: 'digital', date: { precision: 'day', value: '2026-10-01' }, source: 'user' }] },
        { id: 'game-done', title: '示例游戏已玩', mediaType: 'game', personalStatus: 'completed' }
      ]);
    });

    const summary = await page.locator('#summary').evaluate((el) => ({ text: el.textContent, pit: el.dataset.pit, planned: el.dataset.planned, active: el.dataset.active, done: el.dataset.done }));
    assert('pit counts planned plus in progress only', summary.pit === '6' && summary.done === '2' && summary.text.includes('坑 6'), JSON.stringify(summary));

    await page.locator('#typeFilters [data-type="book"]').click();
    const bookSummary = await page.locator('#summary').innerText();
    const bookLabels = await page.locator('#statusFilters').innerText();
    assert('book filter uses read labels and its own pit', bookSummary.includes('书') && bookSummary.includes('坑 1') && bookLabels.includes('想读') && bookLabels.includes('已读'), bookSummary + bookLabels);
    const bookDone = await page.locator('.card[data-id="book-done"]').innerText();
    assert('book progress has no remaining count', bookDone.includes('读到') && bookDone.includes('120') && !bookDone.includes('剩余') && !bookDone.includes('未看'), bookDone);

    await page.locator('#typeFilters [data-type="anime"]').click();
    const anime = await page.locator('.card[data-id="anime-air"]').innerText();
    assert('anime keeps manual projection and unknown total', anime.includes('预计最新 10') && anime.includes('确认 5') && anime.includes('未看 7') && anime.includes('总量未知') && !anime.includes('全季剩余'));

    await page.locator('#typeFilters [data-type="series"]').click();
    const series = await page.locator('.card[data-id="series-known"]').evaluate((el) => ({ text: el.innerText, season: el.dataset.season, gap: el.dataset.gap, estimate: el.dataset.estimate }));
    assert('known total separates confirmed unwatched from full season', series.estimate === '0' && series.gap === '3' && series.season === '11' && series.text.includes('已确认') && series.text.includes('全季剩余 11'), JSON.stringify(series));

    await page.locator('#typeFilters [data-type="movie"]').click();
    const movieDay = await page.locator('.card[data-id="movie-day"]').evaluate((el) => ({ text: el.innerText, access: el.dataset.access, days: el.dataset.days }));
    const movieMonth = await page.locator('.card[data-id="movie-month"]').evaluate((el) => ({ text: el.innerText, access: el.dataset.access, days: el.dataset.days }));
    assert('movie day countdown ignores the other region', movieDay.access === 'countdown' && movieDay.days === '25' && movieDay.text.includes('还差 25 天') && !movieDay.text.includes('集'), JSON.stringify(movieDay));
    assert('movie month shows no day countdown', movieMonth.access === 'coarse' && movieMonth.days === '' && movieMonth.text.includes('2026-11') && !/还差\s*\d+\s*天/.test(movieMonth.text), JSON.stringify(movieMonth));

    await page.locator('#typeFilters [data-type="game"]').click();
    const game = await page.locator('.card[data-id="game-play"]').evaluate((el) => ({ text: el.innerText, access: el.dataset.access, personal: el.dataset.personal }));
    assert('game has no remaining count and past date is arrival', game.personal === 'planned' && game.access === 'arrived' && game.text.includes('手填 40%') && game.text.includes('档期已到') && !game.text.includes('剩余'), JSON.stringify(game));
    await page.locator('#statusFilters [data-ps="completed"]').click();
    assert('status filter shows only completed games', await page.locator('.card').count() === 1 && await page.locator('.card').getAttribute('data-id') === 'game-done');
    await page.locator('.card .pill').click();
    assert('status pill cycles off completed and out of the pit filter', await page.locator('.card').count() === 0);
    await page.locator('#statusFilters [data-ps="all"]').click();
    await page.locator('#typeFilters [data-type="all"]').click();
    const afterCycle = await page.locator('#summary').evaluate((el) => el.dataset.pit);
    assert('cycling off completed increases the pit', afterCycle === '7', afterCycle);

    const mapped = await page.evaluate(() => {
      const releases = ZF.mapTmdbReleaseDates({ results: [{ iso_3166_1: 'CN', release_dates: [
        { release_date: '2026-11-06T00:00:00.000Z', type: 3 },
        { release_date: '2026-12-01T00:00:00.000Z', type: 4 },
        { release_date: '2026-02-31', type: 3 }
      ] }, { iso_3166_1: 'US', release_dates: [{ release_date: '2026-01-15T00:00:00.000Z', type: 5 }] }] }, 99);
      const providers = ZF.mapTmdbProviders({ results: { CN: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } } }, 99);
      const bad = ZF.sanitizeExtract('```json\n{"title":"<b>三体</b><img src=x onerror=alert(1)>","author":"刘慈欣","type":"book"}\n```');
      const junkType = ZF.sanitizeExtract({ title: 'x', author: 'y', type: 'movie<script>' });
      const ol = ZF.mapOlDoc({ key: '/works/OL1W', title: '三体', author_name: ['刘慈欣'], first_publish_year: 2008 });
      return { releases, providers, bad, junkType, ol };
    });
    assert('tmdb theatrical and digital stay separate', mapped.releases.filter((r) => r.region === 'CN' && r.date.precision === 'day').length === 2);
    assert('invalid tmdb day is not kept as a day', mapped.releases.some((r) => r.date && r.date.value === '2026-02-31' && r.date.precision === 'day') === false);
    assert('provider rows do not invent a day', mapped.providers[0].platform === 'netflix' && mapped.providers[0].date.precision === 'tbd');
    assert('extracted text is sanitized', mapped.bad.title === '三体' && mapped.bad.author === '刘慈欣' && mapped.bad.type === 'book' && !mapped.bad.title.includes('<'));
    assert('unknown extract type is rejected', mapped.junkType.type === 'unknown');
    assert('open library year is not a day', mapped.ol.date.precision === 'year' && mapped.ol.date.value === '2008');

    await page.route('https://api.bgm.tv/**', async (route) => {
      const body = { data: [{ id: 7, type: 2, name: '<img src=x onerror=window.__xss=1>', name_cn: '<img src=x onerror=window.__xss=1>', date: '2013-04-07', platform: 'TV', images: {} }] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.click('#btnAdd');
    await page.fill('#fTitle', 'xss');
    await page.selectOption('#fType', 'anime');
    await page.click('#fSearch');
    await page.locator('.src-item .t').waitFor();
    const xss = await page.evaluate(() => ({
      text: document.querySelector('.src-item .t').textContent,
      html: document.querySelector('.src-item .t').innerHTML,
      flag: window.__xss || null,
      items: ZF.items().length
    }));
    assert('third party html is text', xss.text.includes('<img') && xss.html.includes('&lt;img') && !xss.flag, JSON.stringify(xss));
    assert('search does not save', xss.items === 8);
    await page.keyboard.press('Escape');
    await page.unroute('https://api.bgm.tv/**');

    let aiCalls = [];
    await page.route('https://api.deepseek.com/**', async (route) => {
      aiCalls.push({ url: route.request().url(), auth: route.request().headers()['authorization'] || '', body: route.request().postData() || '' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"title":"<i>示例识别</i>","author":"某人","type":"movie"}' } }] }) });
    });
    await page.route('https://example.test/**', async (route) => {
      aiCalls.push({ url: route.request().url(), auth: route.request().headers()['authorization'] || '', host: 'example.test' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    const beforeVision = await page.evaluate(() => ZF.items().length);
    await page.click('#btnMore');
    await page.getByRole('button', { name: '图片识别', exact: true }).click();
    await page.setInputFiles('#visionFile', path.join(repo, 'media/icon-192.png'));
    await page.waitForTimeout(200);
    assert('choosing an image does not call the API', aiCalls.length === 0, JSON.stringify(aiCalls));
    await page.click('#visionGo');
    await page.getByText('识别到的标题').waitFor();
    assert('recognition sends one image to the confirmed endpoint', aiCalls.length === 1 && aiCalls[0].url.includes('api.deepseek.com') && aiCalls[0].auth.includes(SECRET) && aiCalls[0].body.includes('image_url') && !aiCalls[0].body.includes(SECRET), 'calls=' + aiCalls.length);
    assert('library unchanged before confirm', await page.evaluate(() => ZF.items().length) === beforeVision);
    await page.getByRole('button', { name: '不匹配，手动填写' }).click();
    await page.locator('#fTitle').waitFor();
    const drafted = await page.locator('#fTitle').inputValue();
    assert('preview fills the form and still does not save', drafted === '示例识别' && await page.evaluate(() => ZF.items().length) === beforeVision);
    await page.keyboard.press('Escape');

    aiCalls = [];
    await page.click('#btnMore');
    await page.getByRole('button', { name: 'AI 接口' }).click();
    await page.fill('#aiEndpoint', 'https://example.test/v1');
    await page.locator('#aiEndpoint').blur();
    const keyAfter = await page.locator('#aiKey').inputValue();
    assert('endpoint change clears the key', keyAfter === '');
    await page.click('#aiTest');
    await page.waitForTimeout(300);
    assert('new endpoint is not called until the key is confirmed again', aiCalls.filter((c) => c.host === 'example.test').length === 0, JSON.stringify(aiCalls));
    await page.keyboard.press('Escape');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ZF);
    await page.evaluate(() => { ZF.setToday('2026-11-06'); });
    const sw = await page.evaluate(async (secret) => {
      const ready = Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), 8000))
      ]);
      const reg = await ready;
      const keys = await caches.keys();
      let leakedUrl = false;
      let leakedBody = false;
      const urls = [];
      for (const key of keys) {
        const cache = await caches.open(key);
        for (const req of await cache.keys()) {
          urls.push(req.url);
          if (/bgm\.tv|themoviedb|openlibrary|deepseek|example\.test/i.test(req.url)) leakedUrl = true;
          const res = await cache.match(req);
          const text = await res.text();
          if (text.includes(secret)) leakedBody = true;
        }
      }
      return { scope: reg.scope, controller: !!navigator.serviceWorker.controller, keys, leakedUrl, leakedBody, urls };
    }, SECRET);
    assert('service worker controls the app', !!sw.controller && sw.scope.includes('/media/'), JSON.stringify(sw));
    assert('cache does not store API responses or the secret', !sw.leakedUrl && !sw.leakedBody, JSON.stringify(sw));

    const manifest = await page.evaluate(async () => {
      const res = await fetch('manifest.webmanifest');
      return res.json();
    });
    assert('manifest is standalone', manifest.display === 'standalone' && manifest.start_url === './' && manifest.scope === './');

    await page.locator('#typeFilters [data-type="all"]').click();
    await page.screenshot({ path: path.join(outDir, 'media-desktop-dark.png'), fullPage: true });
    report.screenshots.push('media-desktop-dark.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(outDir, 'media-mobile-dark.png'), fullPage: true });
    report.screenshots.push('media-mobile-dark.png');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ZF && ZF.items().length > 0);
    assert('offline reload keeps the library', (await page.locator('#summary').innerText()).includes('坑'));
    await page.screenshot({ path: path.join(outDir, 'media-offline-mobile-dark.png'), fullPage: true });
    report.screenshots.push('media-offline-mobile-dark.png');
    await context.setOffline(false);

    await context.close();

    const livePage = await (await browser.newContext()).newPage();
    await livePage.goto('http://127.0.0.1:8765/media/', { waitUntil: 'domcontentloaded' });
    await livePage.waitForFunction(() => window.ZF);
    report.live = await livePage.evaluate(async () => {
      async function probe(name, run) {
        try {
          const value = await run();
          return { name, ok: true, value };
        } catch (e) {
          return { name, ok: false, error: e && (e.message || String(e)), status: e && e.status, cors: !!(e && e.cors) };
        }
      }
      const bangumi = await probe('bangumi-search', async () => {
        const [giant, book, game] = await Promise.all([
          ZF.bgmSearch('进击的巨人', [2]),
          ZF.bgmSearch('三体', [1]),
          ZF.bgmSearch('原神', [4])
        ]);
        const brief = (list) => (list || []).slice(0, 3).map((hit) => ({ id: hit.id, type: hit.type, name: hit.nameCn || hit.name }));
        return { giant: brief(giant), book: brief(book), game: brief(game) };
      });
      const options = await probe('bangumi-options', async () => {
        const res = await fetch('https://api.bgm.tv/v0/search/subjects', {
          method: 'OPTIONS',
          headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
        });
        return { status: res.status, readable: true };
      });
      const ol = await probe('openlibrary', async () => {
        const docs = await ZF.olSearch('三体');
        return docs.slice(0, 3).map((doc) => ({ title: doc.title, year: doc.date && doc.date.value, precision: doc.date && doc.date.precision }));
      });
      const tmdb = await probe('tmdb-no-key', async () => {
        const res = await fetch('https://api.themoviedb.org/3/search/movie?query=' + encodeURIComponent('霸王别姬'));
        let body = '';
        try { body = (await res.text()).slice(0, 180); } catch (e) { body = ''; }
        return { status: res.status, body };
      });
      const deepseek = await probe('deepseek-no-key', async () => {
        let optStatus = null, optError = '';
        try {
          const opt = await fetch('https://api.deepseek.com/chat/completions', { method: 'OPTIONS' });
          optStatus = opt.status;
        } catch (e) { optError = e && e.name ? e.name : String(e); }
        let postStatus = null, postError = '', postBody = '';
        try {
          const post = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'deepseek-flash', messages: [{ role: 'user', content: 'ping' }] })
          });
          postStatus = post.status;
          postBody = (await post.text()).slice(0, 180);
        } catch (e) { postError = e && e.name ? e.name : String(e); }
        return { optStatus, optError, postStatus, postError, postBody };
      });
      return { bangumi, options, ol, tmdb, deepseek };
    });

    const giantNames = ((report.live.bangumi.value || {}).giant || []).map((h) => h.name).join(' ');
    const bookNames = ((report.live.bangumi.value || {}).book || []).map((h) => h.name).join(' ');
    const gameNames = ((report.live.bangumi.value || {}).game || []).map((h) => h.name).join(' ');
    assert('browser Bangumi matches 进击的巨人', report.live.bangumi.ok && /进击|巨人/.test(giantNames), JSON.stringify(report.live.bangumi));
    assert('browser Bangumi matches 三体 as a book', report.live.bangumi.ok && /三体/.test(bookNames), JSON.stringify(report.live.bangumi));
    assert('browser Bangumi type 4 matches 原神', report.live.bangumi.ok && /原神/.test(gameNames), JSON.stringify(report.live.bangumi));
    assert('browser can read Bangumi preflight or search', report.live.options.ok || report.live.bangumi.ok, JSON.stringify(report.live.options));
    const olTitles = ((report.live.ol.value) || []).map((d) => d.title).join(' ');
    assert('browser Open Library matches 三体 without a key', report.live.ol.ok && /三体|Three-Body|Three Body/i.test(olTitles), JSON.stringify(report.live.ol));
    report.limits.push('TMDB live search was called without a key. Result recorded in live.tmdb. No successful catalog mapping from the live API is claimed.');
    report.limits.push('DeepSeek live call was made without a key. Result recorded in live.deepseek. Vision extraction against the real API was not run.');
    report.limits.push('Camera permission UI was not yet exercised in this browser context.');
    if (!(report.live.tmdb && report.live.tmdb.ok && report.live.tmdb.value && report.live.tmdb.value.status === 401) && !(report.live.tmdb && report.live.tmdb.cors)) {
      report.limits.push('TMDB no-key browser result was neither HTTP 401 nor a CORS failure: ' + JSON.stringify(report.live.tmdb));
    }

    await livePage.close();

    const denied = await boot(browser, { init: () => {
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia = async () => { throw err; };
    }});
    await denied.page.click('#btnMore');
    await denied.page.getByRole('button', { name: '图片识别', exact: true }).click();
    await denied.page.click('#cameraBtn');
    const deniedText = await denied.page.locator('#cameraFallback').innerText();
    assert('camera denial shows a fallback', deniedText.includes('权限被拒绝') && deniedText.includes('选图'), deniedText);
    await denied.context.close();

    const missing = await boot(browser, { init: () => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); } });
    await missing.page.click('#btnMore');
    await missing.page.getByRole('button', { name: '图片识别', exact: true }).click();
    await missing.page.click('#cameraBtn');
    const missingText = await missing.page.locator('#cameraFallback').innerText();
    assert('missing camera API uses the file picker fallback', missingText.includes('没有相机接口'), missingText);
    await missing.context.close();

    const cam = await boot(browser, { init: () => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 24;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#3366cc';
        ctx.fillRect(0, 0, 32, 24);
        return canvas.captureStream(5);
      };
    }});
    await cam.page.click('#btnMore');
    await cam.page.getByRole('button', { name: '图片识别', exact: true }).click();
    await cam.page.click('#cameraBtn');
    await cam.page.locator('#videoBox').waitFor({ state: 'visible' });
    await cam.page.waitForTimeout(300);
    await cam.page.getByRole('button', { name: '用这一帧' }).click();
    await cam.page.locator('img.thumb').waitFor({ state: 'visible' });
    assert('camera capture stays local until recognition', await cam.page.evaluate(() => document.querySelector('#visionOut').textContent === ''));
    await cam.context.close();
    report.limits = report.limits.filter((line) => !line.includes('Camera permission'));
    report.limits.push('Camera tests used a mocked getUserMedia. A real OS permission prompt was not shown. The denial, missing-API, and captured-frame paths were exercised in Chrome.');

    const cover = await boot(browser, { colorScheme: 'dark', viewport: { width: 390, height: 844 } });
    const legacyCovers = {
      app: '追番助手', version: 1, items: [
        { id: 'cov_anime_local', title: '封面仅本地动画', bgmId: 55770, bgmType: 2, cover: '', coverLocal: 'file:///storage/emulated/0/covers/55770.jpg', current: 3, latest: 5, latestDate: '2026-10-01', cycle: 7, total: 0, unit: '集', status: 'airing', customNote: 'keep-me', futureField: { nested: true } },
        { id: 'cov_book_local', title: '封面仅本地书', bgmId: 9585, bgmType: 1, coverLocal: 'file:///storage/emulated/0/covers/9585.jpg', current: 4, latest: 6, latestDate: '2026-05-01', cycle: 0, total: 0, unit: '卷', status: 'airing' },
        { id: 'cov_game', title: '游戏本地封面', bgmId: 284157, bgmType: 4, coverLocal: 'content://com.example.provider/covers/284157', current: 0, latest: 0, latestDate: '2026-01-01', cycle: 0, total: 0, unit: '集', status: 'finished' },
        { id: 'cov_bad_id', title: '无效编号', bgmId: 0, bgmType: 2, cover: 'https://lain.bgm.tv/pic/cover/l/78/c9/55770_HsJfh.jpg', current: 1, latest: 1, latestDate: '2026-09-01', cycle: 0, total: 0, unit: '集', status: 'airing' },
        { id: 'cov_empty_id', title: '空编号', bgmId: '', cover: 'not a url', coverLocal: 'content://local/x', current: 2, latest: 4, latestDate: '2026-08-01', cycle: 7, total: 12, unit: '集', status: 'airing' }
      ]
    };
    await cover.page.evaluate(() => localStorage.clear());
    await cover.page.reload({ waitUntil: 'domcontentloaded' });
    await cover.page.waitForFunction(() => window.ZF);
    await cover.page.click('#btnMore');
    await cover.page.getByRole('button', { name: '导入备份' }).click();
    await cover.page.fill('#impText', JSON.stringify(legacyCovers));
    await cover.page.getByRole('button', { name: '预览', exact: true }).click();
    const importHint = await cover.page.locator('#importPreview').innerText();
    assert('legacy cover backup is recognized as 追番助手', importHint.includes('追番助手'));
    await cover.page.getByRole('button', { name: '只加新 id' }).click();
    await cover.page.waitForFunction(() => ZF.items().length === 5);
    const beforeCovers = await cover.page.evaluate(() => ({
      localPoster: !!document.querySelector('.card[data-id="cov_anime_local"] .poster img'),
      httpsPoster: !!document.querySelector('.card[data-id="cov_bad_id"] .poster img'),
      bookPoster: !!document.querySelector('.card[data-id="cov_book_local"] .poster img')
    }));
    assert('phone file cover is not used as the image', beforeCovers.localPoster === false && beforeCovers.bookPoster === false);
    assert('existing https cover still displays beside a local file', beforeCovers.httpsPoster === true);
    await cover.page.click('#btnMore');
    await cover.page.getByRole('button', { name: '刷新已绑定的 Bangumi' }).click();
    await cover.page.waitForFunction(() => {
      const img = document.querySelector('.card[data-id="cov_book_local"] .poster img');
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 20000 });
    await cover.page.waitForFunction(() => {
      const img = document.querySelector('.card[data-id="cov_anime_local"] .poster img');
      return img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 20000 });
    const afterCovers = await cover.page.evaluate(() => {
      const byId = Object.fromEntries(ZF.items().map((it) => [it.id, it]));
      const width = (id) => {
        const img = document.querySelector('.card[data-id="' + id + '"] .poster img');
        return img ? img.naturalWidth : 0;
      };
      return {
        anime: { cover: byId.cov_anime_local.cover, current: byId.cov_anime_local.current, latest: byId.cov_anime_local.latest, date: byId.cov_anime_local.latestDate, note: byId.cov_anime_local.customNote, nested: byId.cov_anime_local.futureField.nested, local: byId.cov_anime_local.coverLocal, width: width('cov_anime_local') },
        book: { cover: byId.cov_book_local.cover, current: byId.cov_book_local.current, latest: byId.cov_book_local.latest, width: width('cov_book_local') },
        game: { cover: byId.cov_game.cover, personal: byId.cov_game.personalStatus, width: width('cov_game') },
        bad: { cover: byId.cov_bad_id.cover, latest: byId.cov_bad_id.latest },
        empty: { cover: byId.cov_empty_id.cover, poster: !!document.querySelector('.card[data-id="cov_empty_id"] .poster img') }
      };
    });
    assert('refresh replaces a phone-only anime cover with a loaded Bangumi image', /^https:\/\/lain\.bgm\.tv\//.test(afterCovers.anime.cover) && afterCovers.anime.width > 0, JSON.stringify(afterCovers.anime));
    assert('refresh keeps legacy progress and unknown fields', afterCovers.anime.current === 3 && afterCovers.anime.latest === 5 && afterCovers.anime.date === '2026-10-01' && afterCovers.anime.note === 'keep-me' && afterCovers.anime.nested === true && afterCovers.anime.local.indexOf('file:') === 0);
    assert('refresh also loads a book cover without changing its record', /^https:\/\/lain\.bgm\.tv\//.test(afterCovers.book.cover) && afterCovers.book.width > 0 && afterCovers.book.current === 4 && afterCovers.book.latest === 6, JSON.stringify(afterCovers.book));
    assert('refresh loads a game cover', /^https:\/\/lain\.bgm\.tv\//.test(afterCovers.game.cover) && afterCovers.game.width > 0 && afterCovers.game.personal === 'planned', JSON.stringify(afterCovers.game));
    assert('invalid and empty Bangumi ids are not rewritten', afterCovers.bad.latest === 1 && afterCovers.bad.cover.indexOf('55770_HsJfh') > 0 && afterCovers.empty.cover === 'not a url' && afterCovers.empty.poster === false, JSON.stringify(afterCovers));
    await cover.page.screenshot({ path: path.join(outDir, 'cover-refresh-mobile-dark.png'), fullPage: true });
    report.screenshots.push('cover-refresh-mobile-dark.png');
    await cover.context.close();

    const tree = fs.readFileSync(path.join(repo, 'media/index.html'), 'utf8') + fs.readFileSync(path.join(repo, 'media/sw.js'), 'utf8') + fs.readFileSync(path.join(repo, 'media/README.md'), 'utf8');
    assert('shipped files have no preset key', !/sk-[A-Za-z0-9]{8,}/.test(tree) && !tree.includes(SECRET) && !/api_key\s*[:=]\s*['"][A-Za-z0-9]{8,}/.test(tree));
    assert('shipped files have no home directory or email', !/\/Users\/|C:\\Users\\|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(tree));
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    fs.writeFileSync(path.join(outDir, 'media-test-report.json'), JSON.stringify(report, null, 2));
  }
}

main().then(() => {
  if (report.failed.length) {
    console.error(JSON.stringify(report.failed, null, 2));
    process.exit(1);
  }
  console.log('PASSED ' + report.passed.length);
  console.log('LIVE ' + JSON.stringify(report.live, null, 2).slice(0, 4000));
  console.log('LIMITS ' + report.limits.join('\n'));
}).catch((err) => {
  console.error(err && err.stack || err);
  fs.writeFileSync(path.join(outDir, 'media-test-report.json'), JSON.stringify(report, null, 2));
  process.exit(1);
});
