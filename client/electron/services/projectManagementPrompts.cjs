function projectContextText(profile) {
  return `- 项目名称：${profile.projectName || '待确认'}
- 甲方/客户：${profile.clientName || '待确认'}
- 乙方/交付方：${profile.vendorName || '待确认'}
- 项目类型：${profile.projectType || '待确认'}
- 项目分组：${profile.projectGroup || '未分组'}
- 当前阶段：${profile.currentStage || '待确认'}
- 开始日期：${profile.startDate || '待确认'}
- 结束日期：${profile.endDate || '待确认'}
- 合同金额：${profile.contractAmount || '待确认'}
- 付款/回款条款：${profile.paymentTerms || '待确认'}
- 团队角色：${profile.teamRoles || '待确认'}
- 关键约束：${profile.keyConstraints || '待确认'}`;
}

function diagramOutputRequirement(items = []) {
  const diagrams = items.filter(Boolean).map((item, index) => `${index + 1}. ${item}`).join('\n');
  return `图表输出要求：
1. 必须在正文中增加“阶段图表”章节，并输出以下图表：
${diagrams}
2. 每张图都必须使用 Markdown 的 \`\`\`mermaid 代码块输出，便于页面预览和 Word 导出转图片。
3. 图表必须基于用户提供的信息和已有上下文；信息不足时用“待确认”节点，不要编造具体日期、人员或数值。
4. 优先使用 Mermaid 稳定语法：flowchart、gantt、timeline、quadrantChart、journey、pie、xychart-beta。结构图、流程图、鱼骨图优先使用 flowchart LR 横向展开，避免使用过高的竖向图；节点较多时分组横向排布。
5. 每张图后用 2-3 句话说明图表怎么看、下一步应该关注什么。`;
}

function createPlanningPrompt({ profile, planningInput }) {
  return `你是资深项目经理，擅长中国 IT 服务项目交付、乙方项目管理、WBS、里程碑、风险矩阵、RACI、回款节点和客户沟通。

请基于以下项目档案和启动材料，生成一份可直接编辑使用的《项目启动与规划方案》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达专业、具体、可执行。
3. 不编造不存在的日期、金额、人员姓名；未知信息写“待确认”。
4. 必须包含：项目概览、目标与成功标准、范围边界、WBS 任务分解、里程碑计划、RACI 职责矩阵、回款节点与交付物联动、风险登记册、沟通机制、下一步行动清单。
5. WBS 至少拆到二级；风险登记册包含风险、概率、影响、预警信号、应对措施、负责人。
6. 如信息不足，在文末列出“待补充信息”。
7. ${diagramOutputRequirement(['WBS 工作分解结构图（建议用 flowchart LR 横向展开）', '项目里程碑甘特图（建议用 gantt）', '关键里程碑时间线（建议用 timeline 或 flowchart LR）'])}

## 项目档案
${projectContextText(profile)}

## 启动材料
### 项目背景
${planningInput.background || '待补充'}

### 项目目标
${planningInput.objectives || '待补充'}

### 范围边界
${planningInput.scope || '待补充'}

### 已知风险
${planningInput.knownRisks || '待补充'}

### 额外要求
${planningInput.extraRequirements || '无'}`;
}

function createDiscoveryPrompt({ profile, discoveryInput, planningResult }) {
  return `你是资深产品经理和项目经理，擅长中国 IT 服务项目的需求调研、PRD 编写、用户故事、验收标准、需求优先级和范围控制。

请基于以下项目档案、已有启动规划和需求材料，生成一份可直接编辑使用的《需求分析与 PRD 框架》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达具体、可评审、可交付。
3. 不编造客户没有提供的事实；缺失信息写“待确认”。
4. 必须包含：需求背景、用户角色/干系人、业务流程、功能清单、需求优先级、用户故事、非功能需求、数据/接口需求、验收标准、需求确认与变更机制、待确认问题清单。
5. 功能清单按 P0/P1/P2 或 MoSCoW 分类；用户故事使用“作为...我希望...以便...”表达；验收标准尽量使用 Given/When/Then。
6. 明确哪些内容会影响范围、排期、回款或验收。
7. ${diagramOutputRequirement(['业务流程图（建议用 flowchart）', '需求优先级矩阵（建议用 quadrantChart）', '用户旅程图（建议用 journey 或 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有启动规划摘要
${planningResult ? planningResult.slice(0, 12000) : '暂无启动规划，可仅根据需求材料输出。'}

## 需求材料
### 访谈/会议纪要
${discoveryInput.interviewNotes || '待补充'}

### 用户角色/干系人
${discoveryInput.userRoles || '待补充'}

### 业务流程/现状问题
${discoveryInput.businessProcesses || '待补充'}

### 功能诉求
${discoveryInput.featureRequests || '待补充'}

### 验收/测试关注点
${discoveryInput.acceptanceNotes || '待补充'}

### 额外要求
${discoveryInput.extraRequirements || '无'}`;
}

function createExecutionPrompt({ profile, executionInput, planningResult, discoveryResult }) {
  return `你是资深项目经理和交付经理，擅长中国 IT 服务项目的执行排期、Sprint 节奏、跨部门推进、任务拆解、依赖管理和风险前置。

请基于以下项目档案、已有启动规划、需求材料和执行信息，生成一份可直接落地使用的《项目排期与推进计划》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达具体、可执行、可追踪。
3. 不编造不存在的日期、人员姓名或承诺；未知信息写“待确认”。
4. 必须包含：执行目标、阶段排期、WBS/任务清单、里程碑与交付物、责任人/RACI、依赖关系、资源计划、例会与汇报节奏、阻塞处理机制、进度风险预警、未来两周行动清单。
5. 任务清单要包含任务、负责人、起止时间或周期、依赖、验收标准、状态建议。
6. 如适合敏捷节奏，请给出 Sprint 划分；如更适合瀑布/混合模式，请说明理由并给出阶段门控。
7. 明确哪些事项影响范围、排期、回款或验收。
8. ${diagramOutputRequirement(['执行甘特图（建议用 gantt）', '任务依赖图（建议用 flowchart）', 'Sprint 燃尽图（建议用 xychart-beta；缺少数值时用待确认占位）'])}

## 项目档案
${projectContextText(profile)}

## 已有启动规划摘要
${planningResult ? planningResult.slice(0, 10000) : '暂无启动规划，可根据现有执行信息输出。'}

## 已有需求与 PRD 摘要
${discoveryResult ? discoveryResult.slice(0, 10000) : '暂无需求与 PRD，可根据现有执行信息输出。'}

## 执行信息
### 工作流/模块拆分
${executionInput.workstreams || '待补充'}

### 已知里程碑
${executionInput.milestones || '待补充'}

### 资源与人员
${executionInput.resources || '待补充'}

### 依赖关系
${executionInput.dependencies || '待补充'}

### 当前阻塞/推进难点
${executionInput.blockers || '待补充'}

### 推进节奏/会议机制
${executionInput.cadence || '待补充'}

### 额外要求
${executionInput.extraRequirements || '无'}`;
}

function createRiskPrompt({ profile, riskInput, planningResult, discoveryResult, executionResult }) {
  return `你是资深项目经理和项目救火顾问，擅长中国 IT 服务项目的风险识别、问题升级、客户预期管理、延期止损和危机应对。

请基于以下项目档案、已有规划/需求/排期结果和风险材料，生成一份可直接使用的《项目风险与问题应对方案》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达务实、克制、可执行。
3. 不编造不存在的事实、人员姓名或承诺；未知信息写“待确认”。
4. 必须包含：风险总览、风险登记册、问题清单、概率-影响矩阵、预警信号、应对策略、升级路径、客户沟通建议、止损方案、未来一周行动清单。
5. 风险登记册包含：风险/问题、分类、概率、影响、等级、触发信号、应对措施、负责人、截止时间、当前状态。
6. 对高风险项给出至少三种处理选项：保守方案、推荐方案、强硬止损方案，并说明适用条件。
7. 明确哪些事项影响范围、排期、预算、回款或验收。
8. ${diagramOutputRequirement(['风险概率-影响矩阵（建议用 quadrantChart）', '鱼骨分析图（用 flowchart LR 模拟原因分支）', '问题升级路径图（建议用 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有启动规划摘要
${planningResult ? planningResult.slice(0, 8000) : '暂无启动规划。'}

## 已有需求与 PRD 摘要
${discoveryResult ? discoveryResult.slice(0, 8000) : '暂无需求与 PRD。'}

## 已有排期与推进摘要
${executionResult ? executionResult.slice(0, 8000) : '暂无排期与推进计划。'}

## 风险材料
### 风险信号
${riskInput.riskSignals || '待补充'}

### 当前问题
${riskInput.currentIssues || '待补充'}

### 干系人压力/客户反馈
${riskInput.stakeholderPressure || '待补充'}

### 排期/预算/回款影响
${riskInput.scheduleBudgetImpact || '待补充'}

### 已采取措施
${riskInput.mitigationActions || '待补充'}

### 需要升级或决策的事项
${riskInput.escalationNeeds || '待补充'}

### 额外要求
${riskInput.extraRequirements || '无'}`;
}

function createStakeholderPrompt({ profile, stakeholderInput, planningResult, discoveryResult, executionResult, riskResult }) {
  return `你是资深项目经理和干系人沟通顾问，擅长中国 IT 服务项目中的客户预期管理、向上汇报、跨部门协同、需求变更控制、会议纪要和决策留痕。

请基于以下项目档案、已有规划/需求/排期/风险结果和沟通变更材料，生成一份可直接使用的《项目沟通与变更管理方案》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达专业、克制、可落地。
3. 不编造不存在的事实、姓名或承诺；未知信息写“待确认”。
4. 必须包含：干系人地图、沟通目标、分歧/冲突分析、沟通策略、会议机制、变更控制流程、决策留痕模板、客户沟通话术、内部同步话术、下一步行动清单。
5. 干系人地图按“角色/诉求/影响力/关注点/沟通频率/建议策略”输出。
6. 变更控制要说明：变更描述、影响评估、审批人、是否影响范围/排期/预算/回款/验收、留痕方式。
7. 针对敏感冲突给出“柔性沟通方案、正式升级方案、止损留痕方案”三种选择。
8. ${diagramOutputRequirement(['干系人权力-影响力矩阵（建议用 quadrantChart）', '变更控制流程图（建议用 flowchart）', '沟通升级路径图（建议用 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有启动规划摘要
${planningResult ? planningResult.slice(0, 6000) : '暂无启动规划。'}

## 已有需求与 PRD 摘要
${discoveryResult ? discoveryResult.slice(0, 6000) : '暂无需求与 PRD。'}

## 已有排期与推进摘要
${executionResult ? executionResult.slice(0, 6000) : '暂无排期与推进计划。'}

## 已有风险问题摘要
${riskResult ? riskResult.slice(0, 6000) : '暂无风险问题方案。'}

## 沟通变更材料
### 干系人列表
${stakeholderInput.stakeholders || '待补充'}

### 当前分歧/冲突
${stakeholderInput.conflicts || '待补充'}

### 变更诉求
${stakeholderInput.changeRequests || '待补充'}

### 会议纪要/讨论记录
${stakeholderInput.meetingNotes || '待补充'}

### 历史沟通与承诺
${stakeholderInput.communicationHistory || '待补充'}

### 需要决策或确认事项
${stakeholderInput.decisionsNeeded || '待补充'}

### 额外要求
${stakeholderInput.extraRequirements || '无'}`;
}

function createDeliveryPrompt({ profile, deliveryInput, planningResult, discoveryResult, executionResult, riskResult, stakeholderResult }) {
  return `你是资深项目交付经理，擅长中国 IT 服务项目的测试验证、UAT、上线准备、客户验收、培训交接、运维移交和回滚预案。

请基于以下项目档案、已有规划/需求/排期/风险/沟通结果和交付上线材料，生成一份可直接使用的《项目交付上线与验收方案》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达具体、严谨、可执行。
3. 不编造不存在的日期、人员姓名或承诺；未知信息写“待确认”。
4. 必须包含：交付状态总览、测试与缺陷收敛计划、UAT 方案、上线检查清单、上线步骤、回滚预案、验收标准、培训交接计划、运维交接清单、客户签字确认事项、上线后一周稳定性跟踪。
5. 上线检查清单要覆盖环境、配置、数据、账号权限、接口、备份、监控、日志、通知、回滚。
6. 验收标准必须能用于客户确认，写清交付物、验收方式、负责人、证据材料和截止时间。
7. 明确哪些事项影响范围、排期、回款或最终验收。
8. ${diagramOutputRequirement(['上线流程图（建议用 flowchart）', '验收路径图（建议用 flowchart）', '回滚流程图（建议用 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有启动规划摘要
${planningResult ? planningResult.slice(0, 5000) : '暂无启动规划。'}

## 已有需求与 PRD 摘要
${discoveryResult ? discoveryResult.slice(0, 5000) : '暂无需求与 PRD。'}

## 已有排期与推进摘要
${executionResult ? executionResult.slice(0, 5000) : '暂无排期与推进计划。'}

## 已有风险问题摘要
${riskResult ? riskResult.slice(0, 5000) : '暂无风险问题方案。'}

## 已有沟通变更摘要
${stakeholderResult ? stakeholderResult.slice(0, 5000) : '暂无沟通变更方案。'}

## 交付上线材料
### 测试状态/缺陷情况
${deliveryInput.testStatus || '待补充'}

### UAT 范围/参与方
${deliveryInput.uatScope || '待补充'}

### 上线检查/发布准备
${deliveryInput.releaseChecklist || '待补充'}

### 验收标准/签字条件
${deliveryInput.acceptanceCriteria || '待补充'}

### 培训与交接
${deliveryInput.trainingHandover || '待补充'}

### 回滚预案/应急处理
${deliveryInput.rollbackPlan || '待补充'}

### 额外要求
${deliveryInput.extraRequirements || '无'}`;
}

function createReportingPrompt({ profile, reportingInput, planningResult, discoveryResult, executionResult, riskResult, stakeholderResult, deliveryResult }) {
  return `你是资深项目经理，擅长面向客户、老板、管理层和项目团队输出项目周报、月报、里程碑汇报和风险预警。

请基于以下项目档案、已有项目上下文和汇报材料，生成一份可直接使用的《项目汇报材料》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达专业、清晰、克制。
3. 不编造不存在的日期、百分比、金额或承诺；未知信息写“待确认”。
4. 必须包含：汇报摘要、红黄绿状态、关键进展、进度/质量/风险/成本状态、已完成事项、未完成事项、风险与问题、需协调事项、下阶段计划、对不同对象的话术建议。
5. 如果汇报对象是客户，重点突出交付进展、待确认事项、风险提示和下一步安排；如果是内部管理层，重点突出风险、资源、回款、决策和责任归属。
6. 输出一个“可复制到周报/月报”的精简版本和一个“会议汇报版”。
7. ${diagramOutputRequirement(['红黄绿状态图（建议用 flowchart 或 pie）', '进度趋势图（建议用 xychart-beta；缺少数值时用待确认占位）', '下阶段路线图（建议用 timeline 或 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有项目上下文
### 启动规划
${planningResult ? planningResult.slice(0, 4000) : '暂无启动规划。'}

### 需求与 PRD
${discoveryResult ? discoveryResult.slice(0, 4000) : '暂无需求与 PRD。'}

### 排期与推进
${executionResult ? executionResult.slice(0, 4000) : '暂无排期与推进计划。'}

### 风险问题
${riskResult ? riskResult.slice(0, 4000) : '暂无风险问题方案。'}

### 沟通变更
${stakeholderResult ? stakeholderResult.slice(0, 4000) : '暂无沟通变更方案。'}

### 交付上线
${deliveryResult ? deliveryResult.slice(0, 4000) : '暂无交付上线方案。'}

## 汇报材料
### 汇报周期
${reportingInput.reportPeriod || '待补充'}

### 汇报对象
${reportingInput.audience || '待补充'}

### 已完成工作
${reportingInput.completedWork || '待补充'}

### 进度/质量/成本指标
${reportingInput.progressMetrics || '待补充'}

### 风险与问题
${reportingInput.risksIssues || '待补充'}

### 下阶段计划
${reportingInput.nextPlan || '待补充'}

### 额外要求
${reportingInput.extraRequirements || '无'}`;
}

function createCommercialPrompt({ profile, commercialInput, planningResult, discoveryResult, executionResult, riskResult, stakeholderResult, deliveryResult, reportingResult }) {
  return `你是资深乙方项目经理和商务回款顾问，擅长中国 IT 服务项目的合同条款拆解、验收触发、开票回款、逾期风险处理、续约和增购机会识别。

请基于以下项目档案、已有项目上下文和商务回款材料，生成一份可直接使用的《项目商务回款与续约跟进方案》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达专业、务实、可执行。
3. 不编造不存在的合同金额、付款比例、日期或承诺；未知信息写“待确认”。
4. 必须包含：商务状态总览、合同条款要点、回款节点表、验收触发条件、开票/回款跟进清单、逾期风险预警、客户沟通话术、内部协同事项、续约/增购机会、未来两周行动清单。
5. 回款节点表包含：节点、触发条件、对应交付物、金额/比例、预计时间、当前状态、责任人、风险、下一步动作。
6. 对回款受阻事项给出“温和提醒、正式催办、升级处理”三档跟进方案，并说明适用条件。
7. 明确哪些事项影响范围、排期、验收、开票、回款或续约。
8. ${diagramOutputRequirement(['回款节点时间线（建议用 timeline 或 gantt）', '合同-交付-回款联动图（建议用 flowchart）', '逾期升级流程图（建议用 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有项目上下文
### 启动规划
${planningResult ? planningResult.slice(0, 3500) : '暂无启动规划。'}

### 需求与 PRD
${discoveryResult ? discoveryResult.slice(0, 3500) : '暂无需求与 PRD。'}

### 排期与推进
${executionResult ? executionResult.slice(0, 3500) : '暂无排期与推进计划。'}

### 风险问题
${riskResult ? riskResult.slice(0, 3500) : '暂无风险问题方案。'}

### 沟通变更
${stakeholderResult ? stakeholderResult.slice(0, 3500) : '暂无沟通变更方案。'}

### 交付上线
${deliveryResult ? deliveryResult.slice(0, 3500) : '暂无交付上线方案。'}

### 汇报材料
${reportingResult ? reportingResult.slice(0, 3500) : '暂无汇报材料。'}

## 商务回款材料
### 合同/付款条款
${commercialInput.contractTerms || '待补充'}

### 回款节点
${commercialInput.paymentMilestones || '待补充'}

### 验收触发条件
${commercialInput.acceptanceTriggers || '待补充'}

### 开票/回款状态
${commercialInput.invoiceCollectionStatus || '待补充'}

### 当前阻塞
${commercialInput.blockers || '待补充'}

### 续约/增购机会
${commercialInput.renewalUpsellOpportunities || '待补充'}

### 额外要求
${commercialInput.extraRequirements || '无'}`;
}

function createRetrospectivePrompt({ profile, retrospectiveInput, planningResult, discoveryResult, executionResult, riskResult, stakeholderResult, deliveryResult, reportingResult, commercialResult }) {
  return `你是资深项目复盘顾问，擅长中国 IT 服务项目的阶段复盘、项目总结、经验教训沉淀、案例库整理、SOP 改进和组织知识资产建设。

请基于以下项目档案、已有项目上下文和复盘材料，生成一份可直接使用的《项目复盘与沉淀报告》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达真实、克制、可复用。
3. 不编造不存在的结果、数据、人员姓名或客户评价；未知信息写“待确认”。
4. 必须包含：项目结果概览、目标达成情况、关键时间线、做得好的地方、主要问题、根因分析、经验教训、SOP 改进建议、可复用资产清单、案例库摘要、后续行动清单。
5. 使用 4L（Liked/Learned/Lacked/Longed for）或 Keep/Problem/Try 结构组织复盘。
6. 对关键问题使用 5Why 或类似方式分析根因，并给出责任边界、改进动作、负责人和截止时间。
7. 输出一版“可归档项目总结”和一版“可沉淀到知识库/案例库的结构化条目”。
8. ${diagramOutputRequirement(['复盘鱼骨图（用 flowchart LR 模拟原因分支）', '4L 复盘结构图（建议用 flowchart LR 横向展开）', 'SOP 改进流程图（建议用 flowchart LR）'])}

## 项目档案
${projectContextText(profile)}

## 已有项目上下文
### 启动规划
${planningResult ? planningResult.slice(0, 3000) : '暂无启动规划。'}

### 需求与 PRD
${discoveryResult ? discoveryResult.slice(0, 3000) : '暂无需求与 PRD。'}

### 排期与推进
${executionResult ? executionResult.slice(0, 3000) : '暂无排期与推进计划。'}

### 风险问题
${riskResult ? riskResult.slice(0, 3000) : '暂无风险问题方案。'}

### 沟通变更
${stakeholderResult ? stakeholderResult.slice(0, 3000) : '暂无沟通变更方案。'}

### 交付上线
${deliveryResult ? deliveryResult.slice(0, 3000) : '暂无交付上线方案。'}

### 汇报材料
${reportingResult ? reportingResult.slice(0, 3000) : '暂无汇报材料。'}

### 商务回款
${commercialResult ? commercialResult.slice(0, 3000) : '暂无商务回款方案。'}

## 复盘材料
### 项目结果
${retrospectiveInput.projectOutcome || '待补充'}

### 目标达成回顾
${retrospectiveInput.goalsReview || '待补充'}

### 关键事件/决策
${retrospectiveInput.keyEvents || '待补充'}

### 问题与经验教训
${retrospectiveInput.problemsLessons || '待补充'}

### 团队/客户反馈
${retrospectiveInput.teamClientFeedback || '待补充'}

### 可复用资产
${retrospectiveInput.reusableAssets || '待补充'}

### 额外要求
${retrospectiveInput.extraRequirements || '无'}`;
}

function createCompliancePrompt({ profile, complianceInput, planningResult, discoveryResult, executionResult, riskResult, stakeholderResult, deliveryResult, reportingResult, commercialResult, retrospectiveResult }) {
  return `你是资深中国 IT 项目合规与安全交付顾问，熟悉小程序、企业微信、支付宝生态、ICP备案、公安备案、数据安全、等保准备、权限边界、日志审计、上线准入和客户验收场景。

请基于以下项目档案、已有项目上下文和合规材料，生成一份可直接使用的《项目合规本土化与上线准入检查方案》。

输出要求：
1. 使用 Markdown。
2. 用户可见文案使用中文，表达专业、谨慎、可执行。
3. 不编造不存在的资质、备案号、认证结果或法律结论；未知信息写“待确认”。
4. 必须包含：合规范围说明、系统与数据流概览、ICP备案/公安备案检查、等保/安全评审准备、数据安全与隐私检查、账号权限与审计、第三方平台集成检查、上线准入清单、风险整改清单、客户确认事项、后续行动计划。
5. 对每个检查项给出：检查内容、当前状态、责任方、证据材料、风险等级、整改建议、截止时间。
6. 明确哪些事项影响上线、验收、回款、客户承诺或后续运维。
7. 在文末加入“非法律意见说明”，提醒需要由客户法务、合规或安全团队最终确认。
8. ${diagramOutputRequirement(['系统数据流图（建议用 flowchart）', '合规检查路径图（建议用 flowchart）', '上线准入流程图（建议用 flowchart）'])}

## 项目档案
${projectContextText(profile)}

## 已有项目上下文
### 启动规划
${planningResult ? planningResult.slice(0, 2500) : '暂无启动规划。'}

### 需求与 PRD
${discoveryResult ? discoveryResult.slice(0, 2500) : '暂无需求与 PRD。'}

### 排期与推进
${executionResult ? executionResult.slice(0, 2500) : '暂无排期与推进计划。'}

### 风险问题
${riskResult ? riskResult.slice(0, 2500) : '暂无风险问题方案。'}

### 沟通变更
${stakeholderResult ? stakeholderResult.slice(0, 2500) : '暂无沟通变更方案。'}

### 交付上线
${deliveryResult ? deliveryResult.slice(0, 2500) : '暂无交付上线方案。'}

### 汇报材料
${reportingResult ? reportingResult.slice(0, 2500) : '暂无汇报材料。'}

### 商务回款
${commercialResult ? commercialResult.slice(0, 2500) : '暂无商务回款方案。'}

### 复盘沉淀
${retrospectiveResult ? retrospectiveResult.slice(0, 2500) : '暂无复盘沉淀报告。'}

## 合规本土化材料
### 系统范围/业务形态
${complianceInput.systemScope || '待补充'}

### 数据类型/数据流
${complianceInput.dataTypes || '待补充'}

### 第三方平台/本土生态集成
${complianceInput.integrations || '待补充'}

### 部署环境/上线渠道
${complianceInput.deploymentEnvironment || '待补充'}

### 当前备案/等保/合规状态
${complianceInput.complianceStatus || '待补充'}

### 安全风险/客户顾虑
${complianceInput.securityRisks || '待补充'}

### 额外要求
${complianceInput.extraRequirements || '无'}`;
}


module.exports = {
  createCommercialPrompt,
  createCompliancePrompt,
  createDeliveryPrompt,
  createDiscoveryPrompt,
  createExecutionPrompt,
  createPlanningPrompt,
  createReportingPrompt,
  createRetrospectivePrompt,
  createRiskPrompt,
  createStakeholderPrompt,
};
