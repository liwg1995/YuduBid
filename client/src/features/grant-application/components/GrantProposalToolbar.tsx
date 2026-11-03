import type { ReactNode } from 'react';

export default function GrantProposalToolbar({ batchActions, currentActions }: { batchActions: ReactNode; currentActions: ReactNode }) {
  return <div className="grant-application-proposal-command-bar">
    <fieldset className="grant-application-command-group"><legend>批量处理</legend><div>{batchActions}</div></fieldset>
    <fieldset className="grant-application-command-group"><legend>当前模块</legend><div>{currentActions}</div></fieldset>
    <span className="grant-application-command-hint">建议先批量生成，再批量检测，最后按检查意见批量优化。</span>
  </div>;
}
