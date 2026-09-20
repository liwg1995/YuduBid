import type { ThesisTutorReference } from '../types';

export interface ThesisTutorEvidenceAuditItem {
  id: string;
  title: string;
  issue: 'missing' | 'unverified' | 'no-locator';
}

export interface ThesisTutorEvidenceAudit {
  markerCount: number;
  referencedCount: number;
  items: ThesisTutorEvidenceAuditItem[];
}

// Only inspect explicit markers. Inferring whether unmarked prose has a source would overstate what a local check can establish.
export function auditThesisEvidence(content: string, references: ThesisTutorReference[]): ThesisTutorEvidenceAudit {
  const prose = String(content || '').replace(/```[\s\S]*?```/g, '');
  const markers = [...prose.matchAll(/\[\s*证据\s*[:：]\s*([^\]\s]+)\s*\]/g)].map((match) => match[1]);
  const ids = [...new Set(markers)];
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const items: ThesisTutorEvidenceAuditItem[] = [];

  for (const id of ids) {
    const reference = referenceById.get(id);
    if (!reference) {
      items.push({ id, title: '证据链中找不到该编号', issue: 'missing' });
    } else if (reference.verificationStatus !== 'verified') {
      items.push({ id, title: reference.title, issue: 'unverified' });
    } else if (!reference.evidenceLocator?.trim()) {
      items.push({ id, title: reference.title, issue: 'no-locator' });
    }
  }

  return { markerCount: markers.length, referencedCount: ids.length, items };
}
