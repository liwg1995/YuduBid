const { fetchRemoteWithTimeout, readResponseText } = require('../utils/secureHttp.cjs');

function normalizeDoi(value) {
  const doi = String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  if (!/^10\.\d{4,9}\/[\w.()/:;+-]+$/i.test(doi) || doi.length > 200) {
    throw new Error('请输入有效的 DOI，例如 10.1000/xyz123');
  }
  return doi;
}

async function lookupDoi(value, fetcher = fetchRemoteWithTimeout) {
  const doi = normalizeDoi(value);
  const response = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    timeoutMs: 12000,
    headers: { accept: 'application/json', 'user-agent': 'OpenBidKit-ThesisTutor/1.0 (DOI metadata lookup)' },
  });
  if (response.status === 404) throw new Error('Crossref 未找到该 DOI；中文文献可手动填写题录并到原文核验');
  if (!response.ok) throw new Error(`Crossref 查询失败（HTTP ${response.status}）`);
  const payload = JSON.parse(await readResponseText(response, 256 * 1024));
  const work = payload?.message;
  if (!work || typeof work !== 'object') throw new Error('Crossref 返回的题录格式不正确');
  const names = Array.isArray(work.author) ? work.author.slice(0, 12).map((author) => [author.family, author.given].filter(Boolean).join(' ')) : [];
  const year = work.published?.['date-parts']?.[0]?.[0] || work.issued?.['date-parts']?.[0]?.[0];
  return {
    doi: String(work.DOI || doi).slice(0, 200),
    title: String(work.title?.[0] || '').slice(0, 260),
    authors: names.join(', ').slice(0, 240),
    year: year ? String(year).slice(0, 40) : '',
    source: String(work['container-title']?.[0] || work.publisher || '').slice(0, 300),
    url: `https://doi.org/${encodeURIComponent(doi)}`,
  };
}

module.exports = { lookupDoi, normalizeDoi };
