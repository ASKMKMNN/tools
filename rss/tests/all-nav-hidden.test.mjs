import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rssDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(rssDir, 'index.html');
const swPath = path.join(rssDir, 'sw.js');
const html = fs.readFileSync(indexPath, 'utf8');
const sw = fs.readFileSync(swPath, 'utf8');

function loadCore(source) {
  const marker = '/* ==== RSSCore';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('RSSCore block missing');
  const scriptStart = source.lastIndexOf('<script>', start);
  const scriptEnd = source.indexOf('</script>', start);
  const code = source.slice(scriptStart + '<script>'.length, scriptEnd);
  const context = { console };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'rss/index.html' });
  if (!context.RSSCore) throw new Error('RSSCore did not load');
  return context.RSSCore;
}

const C = loadCore(html);

function labelsOf(state) {
  return C.navLabels(state).filter(Boolean);
}
function chipLabels(state) {
  return C.chips(state).map(function (c) { return c.label; });
}
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
function same(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}
function byId(list) {
  const out = {};
  (list || []).forEach(function (item) { out[item.id] = item; });
  return out;
}

function oldConfig() {
  return {
    app: 'rss-reader',
    schema: 1,
    groups: [
      { id: 'g-news', name: '新闻+', displayMode: 'feed', showInFeed: true, showInPics: false },
      { id: 'g-design', name: '设计', displayMode: 'pics', showInFeed: false, showInPics: true },
      { id: 'g-mag', name: '杂志', displayMode: 'pics', showInFeed: false, showInPics: true },
      { id: 'g-tech', name: '科技', displayMode: 'feed', showInFeed: true, showInPics: false },
      { id: 'g-album', name: '图集推荐', displayMode: 'pics', showInFeed: false, showInPics: true },
      { id: 'g-nrec', name: '新闻推荐', displayMode: 'feed', showInFeed: true, showInPics: false },
      { id: 'g-mine', name: '我的', displayMode: 'pics', showInFeed: false, showInPics: true },
      { id: 'g-hide', name: '归档', displayMode: 'hidden', showInFeed: false, showInPics: false }
    ],
    navOrder: ['g-news', 'all', 'g-design', 'g-mag', 'g-tech', 'g-album', 'g-nrec', 'g-mine', 'g-hide'],
    feeds: [
      { id: 'f1', url: 'https://example.com/a.xml', title: '甲', groupId: 'g-news' },
      { id: 'f2', url: 'https://example.com/b.xml', title: '乙', groupId: 'g-mine' },
      { id: 'f3', url: 'https://example.com/c.xml', title: '丙', groupId: '' },
      { id: 'f4', url: 'https://example.com/hidden.xml', title: '藏', groupId: 'g-hide' }
    ],
    stars: [
      { id: 's1', feedId: 'f1', title: '收藏文', link: 'https://example.com/p', date: 10, summary: '摘要', content: '正文', thumb: '', author: '', feedTitle: '甲', enclosures: [], base: 'https://example.com/p', starredAt: 11 }
    ],
    settings: {
      allDisplayMode: 'pics',
      ungroupedDisplayMode: 'feed',
      starDisplayMode: 'pics',
      showListThumb: false,
      settingsTab: 'groups',
      galleryCols: 3,
      proxyMode: 'direct',
      imageFilter: 'medium',
      techNavMigrated: true,
      recommendRenameMigrated: true,
      recommendSplitMigrated: true,
      groupDisplayMigrated: true,
      ithomeMigrated: true,
      otherGroupMigrated: true
    }
  };
}

test('version stays on v1.x and the shell cache moves to rss-v16', function () {
  assert.equal(C.APP_VERSION, 'v1.13');
  assert.equal(C.APP_CHANGELOG[0].version, 'v1.13');
  assert.match(C.APP_VERSION, /^v1\.\d+/);
  assert.equal(/^v2/.test(C.APP_VERSION), false);
  assert.match(html, /<meta name="app-version" content="v1\.13">/);
  assert.match(html, /font-family:system-ui, sans-serif/);
  assert.match(html, /data-open-groups="1"/);
  assert.match(html, /没有可显示的分组/);
  assert.match(html, /name="gm-all" value="hidden"/);
  assert.match(sw, /const CACHE = 'rss-v16'/);
  assert.match(sw, /const ASSETS = \['\.\/', '\.\/index\.html', '\.\/manifest\.webmanifest', '\.\/sw\.js', '\.\/icon\.svg', '\.\/icon-192\.png', '\.\/icon-512\.png', '\.\/icon-maskable\.png'\];/);
  assert.match(sw, /caches\.match\('\.\/index\.html'\)/);
  assert.equal(sw.includes('rss-v15'), false);
});

test('fresh config hides 全部 and keeps the default order', function () {
  const state = {
    groups: [],
    feeds: [{ id: 'custom', url: 'https://example.com/custom.xml', title: '自定义源', groupId: '' }],
    stars: [{ id: 'st', title: '先有的收藏', link: 'https://example.com/s', date: 1 }],
    settings: Object.assign({}, C.DEFAULT_SETTINGS)
  };
  C.mergeDefaults(state);
  assert.equal(state.settings.allNavHidden, true);
  assert.equal(state.settings.allNavHiddenMigrated, true);
  same(labelsOf(state).slice(0, 7), ['新闻+', '设计', '杂志', '科技', '图集推荐', '新闻推荐', '全部']);
  const chips = chipLabels(state);
  assert.equal(chips.includes('全部'), false);
  assert.equal(chips[0], '新闻+');
  assert.equal(chips[1], '设计');
  assert.equal(chips.includes('收藏'), true);
  assert.equal(chips.includes('未分组'), true);
  assert.equal(chips[chips.length - 1], '收藏');
  const news = state.groups.find(function (g) { return g.name === '新闻+'; });
  same(C.defaultView(state), { type: 'group', id: news.id });
  assert.equal(state.groups.find(function (g) { return g.name === '杂志'; }).displayMode, 'pics');
  assert.equal(state.groups.find(function (g) { return g.name === '设计'; }).displayMode, 'pics');
  assert.equal(state.groups.find(function (g) { return g.name === '图集推荐'; }).displayMode, 'pics');
  assert.equal(state.groups.find(function (g) { return g.name === '科技'; }).displayMode, 'feed');
  assert.equal(state.groups.find(function (g) { return g.name === '新闻推荐'; }).displayMode, 'feed');
  assert.equal(state.feeds.some(function (f) { return f.id === 'custom'; }), true);
  assert.equal(state.stars.length, 1);
  assert.equal(state.stars[0].title, '先有的收藏');
});

test('old config hides 全部 once and does not touch anything else', function () {
  const raw = oldConfig();
  const state = C.restoreBackup(clone(raw));
  assert.equal(state.settings.allNavHidden, true);
  assert.equal(state.settings.allNavHiddenMigrated, true);
  same(state.navOrder, raw.navOrder);
  same(labelsOf(state), ['新闻+', '全部', '设计', '杂志', '科技', '图集推荐', '新闻推荐', '我的', '归档']);
  same(chipLabels(state), ['新闻+', '设计', '杂志', '科技', '图集推荐', '新闻推荐', '我的', '未分组', '收藏']);
  assert.equal(state.settings.allDisplayMode, 'pics');
  assert.equal(state.settings.ungroupedDisplayMode, 'feed');
  assert.equal(state.settings.starDisplayMode, 'pics');
  assert.equal(state.settings.showListThumb, false);
  assert.equal(state.settings.settingsTab, 'groups');
  assert.equal(state.settings.galleryCols, 3);
  assert.equal(state.settings.proxyMode, 'direct');
  assert.equal(state.settings.imageFilter, 'medium');
  const groups = byId(state.groups);
  assert.equal(groups['g-design'].displayMode, 'pics');
  assert.equal(groups['g-mine'].displayMode, 'pics');
  assert.equal(groups['g-mine'].name, '我的');
  assert.equal(groups['g-hide'].displayMode, 'hidden');
  assert.equal(groups['g-news'].displayMode, 'feed');
  same(state.feeds.map(function (f) { return [f.id, f.url, f.title, f.groupId]; }), raw.feeds.map(function (f) { return [f.id, f.url, f.title, f.groupId]; }));
  assert.equal(state.stars.length, 1);
  assert.equal(state.stars[0].id, 's1');
  assert.equal(state.stars[0].title, '收藏文');
  assert.equal(state.stars[0].content, '正文');
  same(C.fixView(state, { type: 'group', id: 'g-design' }), { type: 'group', id: 'g-design' });
  same(C.fixView(state, { type: 'star', id: '' }), { type: 'star', id: '' });
  same(C.timeline(state, {}, { type: 'star', id: '' }, 'feed').map(function (s) { return s.id; }), ['s1']);

  const again = C.restoreBackup(C.makeBackup(state));
  assert.equal(again.settings.allNavHidden, true);
  same(again.navOrder, raw.navOrder);
  assert.equal(again.stars[0].title, '收藏文');
  assert.equal(chipLabels(again).includes('全部'), false);
});

test('turning 全部 back on survives a reload', function () {
  const state = C.restoreBackup(oldConfig());
  assert.equal(state.settings.allDisplayMode, 'pics');
  C.setAllNavHidden(state, false);
  assert.equal(state.settings.allNavHidden, false);
  assert.equal(state.settings.allNavHiddenMigrated, true);
  assert.equal(state.settings.allDisplayMode, 'pics');
  assert.equal(chipLabels(state)[1], '全部');
  C.applyAllNavHideMigration(state);
  assert.equal(state.settings.allNavHidden, false);

  const reloaded = C.restoreBackup(C.makeBackup(state));
  assert.equal(reloaded.settings.allNavHidden, false);
  assert.equal(reloaded.settings.allNavHiddenMigrated, true);
  assert.equal(reloaded.settings.allDisplayMode, 'pics');
  assert.equal(chipLabels(reloaded)[1], '全部');
  same(reloaded.navOrder, oldConfig().navOrder);
  assert.equal(reloaded.stars[0].id, 's1');
  assert.equal(reloaded.feeds.length, 4);
  assert.equal(reloaded.groups.find(function (g) { return g.id === 'g-mine'; }).displayMode, 'pics');

  const third = C.restoreBackup(C.makeBackup(reloaded));
  assert.equal(third.settings.allNavHidden, false);
  assert.equal(chipLabels(third).includes('全部'), true);
  assert.equal(chipLabels(third)[1], '全部');
});

test('a view that was on 全部 moves to the first visible group', function () {
  const second = C.restoreBackup(oldConfig());
  same(C.fixView(second, { type: 'all', id: '' }), { type: 'group', id: 'g-news' });
  same(C.defaultView(second), { type: 'group', id: 'g-news' });
  assert.equal(second.navOrder[1], 'all');
  assert.equal(second.settings.allNavHidden, true);

  C.setGroupDisplayMode(second, 'g-news', 'hidden');
  same(C.fixView(second, { type: 'all', id: '' }), { type: 'group', id: 'g-design' });
  assert.equal(second.navOrder[1], 'all');
  assert.equal(chipLabels(second).includes('全部'), false);
  assert.equal(chipLabels(second).includes('收藏'), true);
  assert.equal(second.stars[0].id, 's1');

  const first = oldConfig();
  first.navOrder = ['all', 'g-news', 'g-design', 'g-mag', 'g-tech', 'g-album', 'g-nrec', 'g-mine', 'g-hide'];
  const opened = C.restoreBackup(first);
  assert.equal(opened.navOrder[0], 'all');
  same(C.defaultView(opened), { type: 'group', id: 'g-news' });
  same(C.fixView(opened, { type: 'all', id: '' }), { type: 'group', id: 'g-news' });
  assert.equal(chipLabels(opened)[0], '新闻+');
  assert.equal(opened.feeds.length, 4);
  assert.equal(opened.stars.length, 1);
});

test('no visible group settles on an empty state instead of forcing 全部', function () {
  const raw = oldConfig();
  raw.groups.forEach(function (g) { g.displayMode = 'hidden'; g.showInFeed = false; g.showInPics = false; });
  const state = C.restoreBackup(raw);
  assert.equal(state.settings.allNavHidden, true);
  assert.equal(chipLabels(state).includes('全部'), false);
  same(chipLabels(state), ['未分组', '收藏']);
  same(C.defaultView(state), { type: 'none', id: '' });
  const once = C.fixView(state, { type: 'all', id: '' });
  const twice = C.fixView(state, once);
  const thrice = C.fixView(state, twice);
  same(once, { type: 'none', id: '' });
  same(twice, once);
  same(thrice, once);
  assert.equal(state.settings.allNavHidden, true);
  same(state.navOrder, raw.navOrder);
  assert.equal(state.feeds.length, 4);
  assert.equal(state.stars[0].title, '收藏文');
  same(C.fixView(state, { type: 'star', id: '' }), { type: 'star', id: '' });
  same(C.feedsForView(state, { type: 'none', id: '' }), []);
  same(C.timeline(state, { f1: [{ id: 'a', feedId: 'f1', title: 'A', date: 2 }] }, { type: 'none', id: '' }, 'feed'), []);
  assert.equal(C.viewDisplayMode(state, { type: 'none', id: '' }), 'feed');
  const mode = state.settings.allDisplayMode;
  C.setViewDisplayMode(state, { type: 'none', id: '' }, 'pics');
  assert.equal(state.settings.allDisplayMode, mode);
  assert.equal(state.settings.allNavHidden, true);
});

test('aggregation still works while 全部 is hidden, and favorites stay separate', function () {
  const state = C.restoreBackup(oldConfig());
  const items = {
    f1: [{ id: 'a', feedId: 'f1', title: '甲文', date: 2 }],
    f2: [{ id: 'b', feedId: 'f2', title: '乙文', date: 5 }],
    f3: [{ id: 'c', feedId: 'f3', title: '未分组文', date: 3 }],
    f4: [{ id: 'h', feedId: 'f4', title: '归档文', date: 9 }]
  };
  const all = C.timeline(state, items, { type: 'all', id: '' }, 'feed').map(function (it) { return it.id; });
  same(all, ['b', 'c', 'a']);
  const feeds = C.feedsForView(state, { type: 'all', id: '' }).map(function (f) { return f.id; });
  same(feeds, ['f1', 'f2', 'f3']);
  assert.equal(chipLabels(state).includes('全部'), false);
  same(C.timeline(state, items, { type: 'star', id: '' }, 'feed').map(function (s) { return s.id; }), ['s1']);
  assert.equal(state.settings.starDisplayMode, 'pics');
});

test('existing migrations still run once and leave a re-shown 全部 alone', function () {
  const tech = {
    app: 'rss-reader',
    schema: 1,
    groups: [
      { id: 'g-news', name: '新闻+', displayMode: 'feed' },
      { id: 'g-album', name: '图集推荐', displayMode: 'pics' },
      { id: 'g-tech', name: '科技', displayMode: 'feed' }
    ],
    navOrder: ['g-news', 'g-album', 'all', 'g-tech'],
    feeds: [{ id: 'f1', url: 'https://example.com/keep.xml', title: '留', groupId: 'g-news' }],
    stars: [{ id: 's9', title: '星', link: 'https://example.com/star', date: 1 }],
    settings: {
      allNavHidden: false,
      allNavHiddenMigrated: true,
      allDisplayMode: 'feed',
      techNavMigrated: false,
      recommendRenameMigrated: true,
      recommendSplitMigrated: true,
      ithomeMigrated: true,
      otherGroupMigrated: true
    }
  };
  const moved = C.restoreBackup(tech);
  same(moved.navOrder, ['g-news', 'g-tech', 'g-album', 'all']);
  assert.equal(moved.settings.techNavMigrated, true);
  assert.equal(moved.settings.allNavHidden, false);
  assert.equal(chipLabels(moved).includes('全部'), true);
  assert.equal(moved.stars[0].id, 's9');
  moved.navOrder = ['g-news', 'g-album', 'g-tech', 'all'];
  moved.settings.techNavMigrated = true;
  const stayed = C.restoreBackup(C.makeBackup(moved));
  same(stayed.navOrder, ['g-news', 'g-album', 'g-tech', 'all']);
  assert.equal(stayed.settings.allNavHidden, false);

  const renamed = C.restoreBackup({
    app: 'rss-reader',
    schema: 1,
    groups: [
      { id: 'g-pic', name: '图流', displayMode: 'pics' },
      { id: 'g-feed', name: '信息流', displayMode: 'feed' }
    ],
    navOrder: ['g-pic', 'all', 'g-feed'],
    feeds: [{ id: 'f1', url: 'https://example.com/r.xml', title: '源', groupId: 'g-pic' }],
    stars: [{ id: 's2', title: '收藏还在', link: 'https://example.com/r', date: 2 }],
    settings: {
      allNavHiddenMigrated: true,
      allNavHidden: true,
      recommendRenameMigrated: false,
      recommendSplitMigrated: true,
      techNavMigrated: true,
      ithomeMigrated: true,
      otherGroupMigrated: true
    }
  });
  assert.equal(renamed.groups.find(function (g) { return g.id === 'g-pic'; }).name, '图集推荐');
  assert.equal(renamed.groups.find(function (g) { return g.id === 'g-pic'; }).displayMode, 'pics');
  assert.equal(renamed.groups.find(function (g) { return g.id === 'g-feed'; }).name, '新闻推荐');
  assert.equal(renamed.groups.find(function (g) { return g.id === 'g-feed'; }).displayMode, 'feed');
  assert.equal(renamed.settings.allNavHidden, true);
  assert.equal(renamed.navOrder[1], 'all');
  assert.equal(chipLabels(renamed).includes('全部'), false);
  assert.equal(renamed.stars[0].title, '收藏还在');
  assert.equal(renamed.feeds[0].groupId, 'g-pic');

  const hiddenByFlags = C.migrateGroupDisplayMode({ id: 'g', name: '自定', showInFeed: false, showInPics: false });
  assert.equal(hiddenByFlags.displayMode, 'hidden');
  const feedOnly = C.migrateGroupDisplayMode({ id: 'g2', name: '自定', showInFeed: true, showInPics: false });
  assert.equal(feedOnly.displayMode, 'feed');
});
