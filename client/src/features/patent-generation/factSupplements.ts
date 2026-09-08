import type { PatentPoint } from './types';

function factKey(value: string) {
  return String(value || '').toLocaleLowerCase().replace(/[\s，。；：、,.!?！？:;"'“”‘’（）()【】\[\]]+/g, '');
}

export function getConfirmedFactSupplements(point: PatentPoint) {
  return (point.factSupplements || []).filter((item) => item.source === 'manual' && item.content.trim());
}

export function getUnresolvedMissingFacts(point: PatentPoint) {
  const confirmedKeys = new Set(getConfirmedFactSupplements(point).map((item) => factKey(item.fact)));
  return (point.missingFacts || []).filter((fact) => !confirmedKeys.has(factKey(fact)));
}
