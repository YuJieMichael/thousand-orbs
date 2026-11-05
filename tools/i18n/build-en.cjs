// 生成英文版：node tools/i18n/build-en.cjs        → 写 en/index.html
//            node tools/i18n/build-en.cjs dump   → 列出还没翻译的中文片段（带上下文）
// 做法：用 acorn 找出脚本里所有含中文的字符串 / 模板字符串，以及脚本外的 HTML 文本，
// 把其中每一段连续中文（run）按 en.json 换成英文；注释里的中文不动。代码和 ${...} 原样保留。
// 个别整段需要调语序的，写在 en-lit.json（原文字面量 → 英文字面量）。
const fs = require('fs'), path = require('path'), acorn = require('acorn'), walk = require('acorn-walk');
const ROOT = path.join(__dirname, '..', '..');
let src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// en-sub.json：少数需要整段替换的源码片段（比如开关的「开 / 关」），先替换再翻译
const sub = fs.existsSync(path.join(__dirname, 'en-sub.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'en-sub.json'), 'utf8')) : {};
for (const [a, b] of Object.entries(sub)) { if (!src.includes(a)) console.error('en-sub 没找到：' + a); src = src.split(a).join(b); }
const dict = JSON.parse(fs.readFileSync(path.join(__dirname, 'en.json'), 'utf8'));
const lit = fs.existsSync(path.join(__dirname, 'en-lit.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'en-lit.json'), 'utf8')) : {};
const CJK = /[㐀-鿿]/;
const RUN = /[㐀-鿿　-〿＀-￯](?:[㐀-鿿　-〿＀-￯0-9A-Za-z·…—\-+%×./~ ]*[㐀-鿿　-〿＀-￯])?/g;

function spansOf(html) {
  const out = []; let m; const sRe = /<script>([\s\S]*?)<\/script>/g, scr = [];
  while ((m = sRe.exec(html))) {
    const off = m.index + '<script>'.length, code = m[1]; scr.push([m.index, m.index + m[0].length]);
    const ast = acorn.parse(code, { ecmaVersion: 'latest' }), cand = [];
    walk.full(ast, n => { if ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral') { if (CJK.test(code.slice(n.start, n.end))) cand.push([n.start, n.end]); } });
    cand.sort((a, b) => a[0] - b[0] || b[1] - a[1]); let last = -1;
    for (const [a, b] of cand) if (a >= last) { last = b; if (code.slice(Math.max(0, a - 14), a).includes('/*i18n-keep*/')) continue; out.push({ s: off + a, e: off + b, kind: 'js' }); } // /*i18n-keep*/ 标记的字面量原样保留（双语界面）
  }
  let pos = 0; for (const [a, b] of scr) { out.push({ s: pos, e: a, kind: 'html' }); pos = b; } out.push({ s: pos, e: html.length, kind: 'html' });
  return out.sort((a, b) => a.s - b.s);
}
// 翻译后的小清理：括号 / 引号里多出来的空格
const tidy = t => t.replace(/([(“]) (\$\{|<b)/g, '$1$2').replace(/ ([)”])/g, '$1');
// 「第 X 章 / 轮 / 次 / 层」这类要调语序：先整体换掉，剩下的再逐段翻译
const ORD = { '章': 'Chapter ', '轮': 'Round ', '次': '#', '层': 'Depth ', '名': '#', '个': '#', '天': 'Day ', '关': 'Stage ', '发': 'shot #', '颗': 'orb #', '张': 'card #', '阶段': 'Phase ' };
function exprAt(t, i) { // 从 i 开始读一个 ${...}（处理嵌套括号 / 模板），返回结束位置
  if (t.startsWith('${', i)) { let d = 0; for (let j = i + 1; j < t.length; j++) { const c = t[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return j + 1; } else if (c === '`') { j = t.indexOf('`', j + 1); if (j < 0) return -1; } } return -1; }
  const m = /^(<b[^>]*>\$\{[^`]*?\}<\/b>|<b[^>]*>[0-9]+<\/b>|[0-9]+)/.exec(t.slice(i)); return m ? i + m[0].length : -1;
}
function reorder(t) {
  let out = '', i = 0;
  while (i < t.length) {
    const k = t.indexOf('第', i); if (k < 0) { out += t.slice(i); break; }
    const prev = t[k - 1];
    if (prev && /[㐀-鿿]/.test(prev)) { out += t.slice(i, k + 1); i = k + 1; continue; }
    let j = k + 1; while (t[j] === ' ') j++;
    const e = exprAt(t, j); if (e < 0) { out += t.slice(i, k + 1); i = k + 1; continue; }
    let q = e; while (t[q] === ' ') q++;
    const unit = t.startsWith('阶段', q) ? '阶段' : t[q];
    if (!ORD[unit]) { out += t.slice(i, k + 1); i = k + 1; continue; }
    out += t.slice(i, k) + ORD[unit] + t.slice(j, e); i = q + unit.length;
  }
  return out;
}
function translateText(t, kind, missing, ctx) {
  t = reorder(t);
  return tidy(t.replace(RUN, (r, off, str) => {
    if (!Object.hasOwn(dict, r)) { missing.set(r, missing.get(r) || ctx); return r; }
    let e = dict[r]; if (!e) return e;
    // 中文不用空格，英文要：和前后的数字、${...}、标签之间补一个空格
    const prev = str[off - 1] || '', next = str[off + r.length] || '';
    if (/^[A-Za-z0-9(“#]/.test(e) && /[A-Za-z0-9%)\]}>]/.test(prev)) e = ' ' + e;
    if (/[A-Za-z0-9.,:;!?)”]$/.test(e) && /[A-Za-z0-9<$(“+×]/.test(next) && !str.startsWith('</', off + r.length - 0) ) e = e + ' ';
    return e; }));
}
const missing = new Map(); let outHtml = '', pos = 0;
for (const sp of spansOf(src)) {
  outHtml += src.slice(pos, sp.s); let t = src.slice(sp.s, sp.e);
  if (sp.kind === 'js') { t = Object.hasOwn(lit, t) ? lit[t] : translateText(t, 'js', missing, t.slice(0, 160)); }
  else { // HTML：跳过 <style> 和 HTML 注释
    t = t.replace(/(<style>[\s\S]*?<\/style>|<!--[\s\S]*?-->)|([^]+?)(?=<style>|<!--|$)/g, (all, keep, txt) => keep ? keep : translateText(txt, 'html', missing, 'HTML'));
  }
  outHtml += t; pos = sp.e;
}
outHtml += src.slice(pos);
// 英文版的页面级差异
const SRC_HASH = require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'index.html'))).digest('hex');
outHtml = outHtml.replace('<html lang="zh-CN">', `<!-- 由 tools/i18n/build-en.cjs 从 index.html 生成，不要直接改。source-sha1:${SRC_HASH} -->\n<html lang="en">`)
  .replace(/(href|src)="(icons\/|manifest\.webmanifest)/g, '$1="../$2');
if (process.argv[2] === 'dump') {
  for (const [r, c] of missing) console.log(JSON.stringify(r) + '\t' + c.replace(/\s+/g, ' '));
  console.error('missing', missing.size); process.exit(0);
}
if (missing.size) { console.error(`还有 ${missing.size} 段中文没翻译，先运行 dump 看看`); for (const r of [...missing.keys()].slice(0, 20)) console.error('  ' + r); process.exit(1); }
fs.mkdirSync(path.join(ROOT, 'en'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'en', 'index.html'), outHtml);
console.log('en/index.html 已生成', outHtml.length);
