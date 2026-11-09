import type { OutlineItem } from '../../../shared/types';

export function buildScoringResponse(markdown: string, outline: OutlineItem[]) {
  const matches = [...markdown.matchAll(/【评分项名称】\s*[:：]\s*([^\r\n]+)/g)];
  const chapters: OutlineItem[] = [];
  function collect(items: OutlineItem[]) {
    for (const item of items) {
      chapters.push(item);
      if (item.children?.length) collect(item.children);
    }
  }
  collect(outline);

  const normalize = (value: string) => value.normalize('NFKC').replace(/[*_\s]/g, '').toLowerCase();
  return matches.map((match, index) => {
    const title = match[1].trim().replace(/^\*+|\*+$/g, '').trim();
    const end = matches[index + 1]?.index ?? markdown.length;
    const details = markdown.slice(match.index + match[0].length, end).trim();
    const normalized = normalize(title);
    const candidates = normalized ? chapters.filter((chapter) =>
      normalize(chapter.title) === normalized || normalize(chapter.source_requirement_title || '') === normalized) : [];
    return { title, details, candidates };
  });
}
