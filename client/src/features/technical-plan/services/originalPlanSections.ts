interface OriginalPlanSection {
  title: string;
  content: string;
}

export function getOriginalPlanSections(markdown: string): OriginalPlanSection[] {
  const sections: OriginalPlanSection[] = [];
  let title = '原方案开头';
  let lines: string[] = [];
  let fence: string | undefined;

  function saveSection() {
    const content = lines.join('\n').trim();
    if (content) sections.push({ title, content });
    lines = [];
  }

  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = undefined;
      lines.push(line);
      continue;
    }
    const heading = !fence && /^ {0,3}#{1,6}[ \t]+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      saveSection();
      title = heading[1];
    } else {
      lines.push(line);
    }
  }
  saveSection();
  return sections;
}

function normalizeSectionTitle(title: string) {
  return title.normalize('NFKC').trim()
    .replace(/^第[一二三四五六七八九十百零〇\d]+[章节篇部分]\s*[、.．:：]?\s*/, '')
    .replace(/^\d+(?:\.\d+)*(?:[.、:：]\s*|\s+)/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function findOriginalPlanSection(sections: OriginalPlanSection[], title: string): number {
  const normalized = normalizeSectionTitle(title);
  if (!normalized) return -1;
  const matches = sections.flatMap((section, index) =>
    normalizeSectionTitle(section.title) === normalized ? [index] : []);
  return matches.length === 1 ? matches[0] : -1;
}

export function mappingFingerprint(markdown: string, targets: Array<{ id: string; title: string }>) {
  const input = JSON.stringify(['full-source-v2', markdown, targets.map(({ id, title }) => [id, title])]);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
