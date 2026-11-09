const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 英文版 en/index.html 由 tools/i18n/build-en.cjs 生成。改了 index.html 就要重新生成：
//   cd tools/i18n && npm i && cd ../.. && node tools/i18n/build-en.cjs
const root = path.join(__dirname, '..');
const zh = fs.readFileSync(path.join(root, 'index.html'));
const en = fs.readFileSync(path.join(root, 'en', 'index.html'), 'utf8');

test('英文版是从当前的 index.html 生成的（改完中文版记得重新生成）', () => {
  const sha = crypto.createHash('sha1').update(zh).digest('hex');
  assert.match(en, new RegExp(`source-sha1:${sha}`), '英文版过期了：运行 node tools/i18n/build-en.cjs');
  assert.match(en, /<html lang="en">/);
  const v = s => /GAME_V='([^']+)'/.exec(s)[1];
  assert.equal(v(en), v(zh.toString('utf8')));
});

test('英文版的资源路径指向上一级', () => {
  assert.match(en, /href="\.\.\/manifest\.webmanifest"/);
  assert.doesNotMatch(en, /href="icons\//);
});

test('中英文两个版本的脚本都能正常解析（翻译里的引号不能把字符串截断）', () => {
  for (const f of ['index.html', 'en/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const m = /<script>([\s\S]*?)<\/script>/.exec(html);
    assert.doesNotThrow(() => new Function(m[1]), `${f} 脚本解析失败`);
  }
});
