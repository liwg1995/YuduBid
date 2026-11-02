import { FileTextIcon } from '@radix-ui/react-icons';
import type { BlindCheckStep } from '../types';

const workflow: Array<{ id: BlindCheckStep; label: string; detail: string }> = [
  { id: 'upload', label: '选择标书', detail: '导入待检标书' },
  { id: 'preset', label: '格式要求', detail: '设置格式与匿名要求' },
  { id: 'results', label: '检查结果', detail: '定位风险与复核' },
  { id: 'fix', label: '修复与导出', detail: '修复副本并复查' },
];

/** 启象的独立工作区导航；业务状态与守矩共用。 */
export default function ModernBlindWorkspace({ step, fileName, hasFile, onStep }: {
  step: BlindCheckStep;
  fileName?: string;
  hasFile: boolean;
  onStep: (step: BlindCheckStep) => void;
}) {
  return (
    <header className="blind-modern-header">
      <div className="blind-modern-title"><FileTextIcon /><div><h1>暗标检查</h1><p title={fileName}>{fileName || '检查匿名风险与文档格式'}</p></div></div>
      <nav className="blind-modern-steps" aria-label="暗标检查步骤">
        {workflow.map((item, index) => <button type="button" key={item.id} aria-current={item.id === step ? 'step' : undefined} disabled={index > 0 && !hasFile} onClick={() => onStep(item.id)}><span className="blind-modern-step-index">{index + 1}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}
      </nav>
    </header>
  );
}
