// 聖經書卷（恢復本名稱、簡稱、章數）＋ 恢復本經文
(() => {
  'use strict';
  // [全名, 簡稱, 章數]；陣列索引 + 1 = 恢復本網站的書卷編號 (f_BookNo)
  const BOOKS = [
    ['創世記', '創', 50], ['出埃及記', '出', 40], ['利未記', '利', 27], ['民數記', '民', 36],
    ['申命記', '申', 34], ['約書亞記', '書', 24], ['士師記', '士', 21], ['路得記', '得', 4],
    ['撒母耳記上', '撒上', 31], ['撒母耳記下', '撒下', 24], ['列王紀上', '王上', 22], ['列王紀下', '王下', 25],
    ['歷代志上', '代上', 29], ['歷代志下', '代下', 36], ['以斯拉記', '拉', 10], ['尼希米記', '尼', 13],
    ['以斯帖記', '斯', 10], ['約伯記', '伯', 42], ['詩篇', '詩', 150], ['箴言', '箴', 31],
    ['傳道書', '傳', 12], ['雅歌', '歌', 8], ['以賽亞書', '賽', 66], ['耶利米書', '耶', 52],
    ['耶利米哀歌', '哀', 5], ['以西結書', '結', 48], ['但以理書', '但', 12], ['何西阿書', '何', 14],
    ['約珥書', '珥', 3], ['阿摩司書', '摩', 9], ['俄巴底亞書', '俄', 1], ['約拿書', '拿', 4],
    ['彌迦書', '彌', 7], ['那鴻書', '鴻', 3], ['哈巴谷書', '哈', 3], ['西番雅書', '番', 3],
    ['哈該書', '該', 2], ['撒迦利亞書', '亞', 14], ['瑪拉基書', '瑪', 4],
    ['馬太福音', '太', 28], ['馬可福音', '可', 16], ['路加福音', '路', 24], ['約翰福音', '約', 21],
    ['使徒行傳', '徒', 28], ['羅馬書', '羅', 16], ['哥林多前書', '林前', 16], ['哥林多後書', '林後', 13],
    ['加拉太書', '加', 6], ['以弗所書', '弗', 6], ['腓立比書', '腓', 4], ['歌羅西書', '西', 4],
    ['帖撒羅尼迦前書', '帖前', 5], ['帖撒羅尼迦後書', '帖後', 3], ['提摩太前書', '提前', 6],
    ['提摩太後書', '提後', 4], ['提多書', '多', 3], ['腓利門書', '門', 1], ['希伯來書', '來', 13],
    ['雅各書', '雅', 5], ['彼得前書', '彼前', 5], ['彼得後書', '彼後', 3], ['約翰一書', '約壹', 5],
    ['約翰二書', '約貳', 1], ['約翰三書', '約參', 1], ['猶大書', '猶', 1], ['啟示錄', '啟', 22],
  ];
  // 書卷 OSIS 代號（經文資料檔的資料夾名稱），順序同上
  const OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs',
    '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek',
    'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
    'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess',
    '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];

  // 恢復本經文資料：存在本站 data/rcv-zh/{書卷}/{章}.json（複製自「原文對照聖經」的資料，只留經文）
  const SOURCE_SITE = 'https://isaiahovercomer.github.io/interlinear-bible/';
  const TEXT_BASE = 'data/rcv-zh/';
  const ATTRIBUTION = '聖經恢復本經文 © Living Stream Ministry，台灣福音書房出版。';

  const book = (no) => {
    const b = BOOKS[no - 1];
    return b ? { no, name: b[0], short: b[1], chapters: b[2], testament: no <= 39 ? '舊約' : '新約' } : null;
  };

  // 把資料庫存的 {b, c1, c2} 整理成合法範圍
  const normalize = (seg) => {
    const bk = book(Number(seg && seg.b));
    if (!bk) return null;
    let c1 = Math.min(Math.max(1, Number(seg.c1) || 1), bk.chapters);
    let c2 = Math.min(Math.max(1, Number(seg.c2) || c1), bk.chapters);
    if (c2 < c1) [c1, c2] = [c2, c1];
    return { b: bk.no, c1, c2, book: bk };
  };

  const label = (seg) => {
    const s = normalize(seg);
    if (!s) return '';
    if (s.book.chapters === 1) return s.book.name;
    const unit = s.book.no === 19 ? '篇' : '章';
    return s.c1 === s.c2 ? `${s.book.name} 第 ${s.c1} ${unit}` : `${s.book.name} ${s.c1}～${s.c2} ${unit}`;
  };

  // 一章的經文 JSON；在原網站打開同一章的連結
  const textUrl = (b, c) => `${TEXT_BASE}${OSIS[b - 1]}/${c}.json`;
  const sourceUrl = (b, c) => `${SOURCE_SITE}#${OSIS[b - 1]}.${c}`;

  // 資料用 “ ” ‘ ’，恢復本印刷用 『 』 「 」
  const zhQuotes = (t) => String(t).replace(/“/g, '『').replace(/”/g, '』').replace(/‘/g, '「').replace(/’/g, '」');

  const cache = new Map();
  // 回傳 [{n, text}]；n = 0 是詩篇的標題
  function loadChapter(b, c) {
    const key = `${b}:${c}`;
    if (!cache.has(key)) {
      cache.set(key, fetch(textUrl(b, c))
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((d) => (d.verses || []).map((v) => ({ n: v.n, text: zhQuotes(v.text) })))
        .catch((e) => { cache.delete(key); throw e; }));
    }
    return cache.get(key);
  }

  window.GM_BIBLE = {
    BOOKS, book, normalize, label, textUrl, sourceUrl, loadChapter,
    SOURCE_SITE, ATTRIBUTION, count: BOOKS.length,
  };
})();
