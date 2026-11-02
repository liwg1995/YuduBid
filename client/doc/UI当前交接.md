# UI当前交接

> 2026-11-02收尾统一入口：[UI收尾验收清单](./UI收尾验收清单.md)。以下为历史计划/记录，不逐条自动新增任务。
2026-10-29恢复工作；当前分支design，累计工作保持未提交，未推送或发布。

## 最新完成

旧版可研单条项目卡片撑满列表的问题已修复。运行时测量确认列表Grid自动轨道拉伸；feasibilityReport.css设置单列、内容行高和顶部对齐，普通卡片约98px，保留列表内部滚动。四种界面、1280/640px、0/1/3/30条共32组Renderer页面检查，以及长名称、搜索清除、末条滚动和重命名取消通过。启象表格正常。构建与diff检查通过。详见旧版可研列表布局验收.md。

上一批公文/课题两进程Electron保存恢复、隔离、真实DOCX内容/表格、取消和失败验证通过；修复默认文件名误带“技术方案”；原生公文保存、重载读回及保存面板默认名/取消通过。命令npm run verify:office-grant:electron。详见公文课题持久化与导出验收.md。

## 下一步和未完成

继续八模块原生深层状态与主题/窗口矩阵，优先课题四阶段成果衔接和公文版本恢复的原生交互；完成业务链路及Word人工版式，Windows中文目录/125%/150%缩放，最终累计审查与打包。Renderer隔离样本、服务回归和原生验收分开记录，不混作全部完成。

继续遵守不读取archive、不新增最近项目入口、不操作用户真实项目、不提交推送发布的约束。常规改造和隔离验证已获授权，不重复询问。

2026-10-30新增：完成新版白块基础样式全量扫描及165处主题变量替换，44组样式样本和构建通过。详见新版白块基础样式复查.md；整页原生全状态视觉验收尚未完成。


2026-10-30补查：用户指出资信水印行仍白底，确认上次遗漏近白色#f8fbff。本批修复该行/轨道及281处浅色声明、40条渐变；实际资信库八分类与开关双态无大面积浅色命中。其他模块为源码巡检，未冒充全页原生通过。详见[近白色与渐变遗漏复查](./近白色与渐变遗漏复查.md)。

2026-10-30：修复投标机会最近扫描健康摘要在暗色下的浅黄块。警告改深琥珀底/浅金文字，正常深绿；摘要12px、入口14px/32px点击高度，保留换行和焦点。同步详情health-strip暗色警告。实际OpportunityOverview组件配隔离数据验证正常/失败/经典三状态和诊断回调，构建/diff通过；截图/tmp/yibiao-opportunity-health-fixed.png。未运行真实扫描或健康诊断服务。

2026-10-30：进度展示压缩。BusinessTaskProgress与TaskProgressSummary显式success不再展示满条/百分比，保留阶段/计数/完成状态；active到100仍显示进度，不提前判成功。公文任务完成/失败仅显示结果说明，running保留进度与等待提示。修复official-document-task-head泛化div布局污染共享控件、摘要居中。实际组件四主题完成/失败42px、运行保留1条进度，无横向溢出；证据/tmp/yibiao-compact-progress.json、/tmp/yibiao-compact-progress.png。属于组件隔离验收，不是所有调用页面整页验收。构建/diff通过。

2026-10-30：更新检查GitCode429处理，新增releaseMetadataService请求合并/5分钟缓存/Retry-After冷却，离线回归与完整性检查通过，原生隔离窗口启动通过。详见更新检查限流处理.md。限流仍作为检查失败反馈，不承诺不再出现IPC错误日志。

2026-10-30继续：修复项目协作任务容器与课题三类任务容器的后代div规则对共用进度布局的污染，清理项目协作未使用的旧估算变量。BusinessTaskProgress/TaskProgressSummary失败态改紧凑摘要，保留失败消息与最后百分比，无整条进度。项目协作和论文实际状态组件+课题原结构样本，四主题×两宽度×三状态共72个面板检查通过：运行各保留一条，终态无进度条，无横向溢出；新版项目协作/论文终态46px。不是完整业务页面/原生验收。证据/tmp/yibiao-status-matrix-20261030.json、/tmp/yibiao-status-panels-20261030.png；构建/diff通过。下一步仍需完整工作台深层状态、原生交互和Windows缩放。

2026-10-30继续：课题任务成功/失败显式结果状态与约46px摘要；专利暂停/停止摘要、过渡状态及日志去重；四主题两宽度64面板样本及构建/diff通过。验证边界与后续六项见[UI后续任务清单](./UI后续任务清单.md)。

2026-10-30整页复查：课题申报书/公文润色实际完整Renderer页面16组，发现并修复课题窄屏导航被压至0高、公文历史面板仅44px；修复后导航68px、历史227px，无body/横向溢出。详见[课题与公文完整页面布局复查](./课题与公文完整页面布局复查.md)。其余入口和原生流程未完成。

2026-10-30可研目录：当前分支已有树路径展示编号，用fr-node-*样本验证八组实际目录页及模拟编辑保存定位通过；本批修复带状态标签标题换行与重复任务反馈/暂停停止样式，详见可研目录编号与反馈复查.md。

2026-10-30可研正文：补阅读标题章节号；实际ContentPanel验证切换未保存确认、保存失败保稿/重试、两节不串稿，四主题双宽度长文内部滚动通过。详见可研正文编号与编辑验收.md。尚非原生磁盘/实际导出验收。

2026-10-30可研配置/预览：三弹窗关闭焦点恢复，共用Word预览服务缺失/同步异常转错误重试。24组主题/窗口边界与模拟失败重试通过，详见可研配置与预览弹窗验收.md。未计实际Word/原生全流程通过。

2026-10-30公文/课题六入口48组整页复查；修模板/参考弹窗关闭焦点与课题过期Word导出文案，五模板及起草参考实际交互通过。详见公文课题六入口整页复查.md，仍非全部原生业务闭环。

2026-10-30项目历史/论文结果：16组主题窗口通过，修阶段预览与证据导出核对焦点，历史选中语义与名称提示；论文实时预览/清空不冒旧结果通过。详见项目历史与论文结果工作区复查.md，非完整论文主工作台/真实导出验收。

2026-10-30售前/软著/专利：两个实际项目页与售前包预览24组主题窗口检查，修创建编辑/预览取消后焦点丢失，抽取useDialogReturnFocus并兼容输入框autoFocus。详见售前软著专利入口与弹窗复查.md；未覆盖三完整工作台、删除归档或真实业务写入。

2026-10-30软著/专利：版本历史读失败误作空态、比较失败无重试已修复；独立loading和缺失服务反馈、恢复确认返回焦点。三实际组件24组长内容/主题窗口通过，详见软著版本源码与专利修订复查.md。未执行真实恢复/修订生成。

2026-10-30软著完整准备工作台/专利查新修订16组通过；修专利生成/保存任务中仍可修改输入问题，锁定解锁保稿通过；软著与专利离线业务回归exit0。软著总检跳转未确认，下一批优先复查。详见软著主工作台与专利任务禁用复查.md。

2026-10-30软著非空态：总检导航待确认项已核实为平滑滚动采样过早，16组定位通过无需改导航。修切草稿读取失败残留旧稿、保存空返回假成功，模拟失败/重试与材料隔离通过。详见软著非空草稿与总检导航验收.md。

2026-11-01：软著/售前三个独立 Electron 进程验证真实磁盘保存、重启、软著历史恢复/清空和双项目五成果隔离通过；售前七阶段56组整页外观/宽度检查通过。修材料读取失败残留旧预览、增加加载错误重试与请求隔离，初始服务缺失纳入错误页。详见[软著售前跨进程持久化与整页验收](./软著售前跨进程持久化与整页验收.md)。仍未计原生 UI/preload/IPC 全链路、真实模型和人工导出版式通过。

2026-11-01续：售前五阶段任务互斥/参数锁定、同项目未保存输入保留、常驻失败与成功摘要；删除按时间递增估算进度和旧任务卡片后代样式。120组整页状态矩阵、五阶段失败保稿/成功重试、跨阶段禁用及最终不定进度复核通过。详见[售前任务互斥保稿与反馈验收](./售前任务互斥保稿与反馈验收.md)。仍非真实模型/原生全链路验收。

2026-11-02：按用户截图修项目历史阶段卡片摘要半行裁切。卡片最小164px、间距12px、内边距16px，标题/摘要14px，摘要22px行高、两行44px且禁止flex压缩，按钮32px。实际ProjectHistoryPage隔离项目十阶段（含待生成），1440/1280/1000/800px检查：摘要均44px，无横向溢出，预览正常。截图/tmp/yibiao-history-stage-fixed.png；修改限启象阶段卡片CSS，未改变项目数据或全文预览。

2026-11-02文字专项续：跨feature源码筛查line-clamp/省略/高度约束，未对未复现页面批量改字号。图片库实际整页复现标题/摘要高度0、底部操作被裁：flex:1的内容固有高度未参与网格行高。imageLibraryDesign.css改内容flex:1 0 auto、子项禁止压缩、网格内容行高，摘要14px/22px，操作栏禁止拆字且可换行。四宽度1440/1280/1000/800×8长短标题卡片实测摘要44px、标题22/44/66px、操作边界未裁，无横向溢出。使用隔离bridge，缩略图不可用占位；不计八模块全部页面验收。证据/tmp/yibiao-image-text-fixed.png、/tmp/yibiao-image-text-matrix.json；构建日志/tmp/yibiao-card-text-build.log。后续仍需其他模块实际长数据整页验证。

2026-11-02可读性续：实际软著JourneyGuide说明测得9px、论文Sidebar历史摘要12px/18px。软著标题14px/22px、说明12px/20px完整显示，列宽自动适配且取消不适配列数的装饰连接线、未到达步骤58%整体透明度；论文启象历史摘要14px/22px，元信息允许换行、时间不挤压、操作按钮不拆字。四窗口×三历史栏宽共12组实际组件隔离检查通过，说明无裁切、历史摘要44px；非主工作台整页验收，未执行恢复/删除/重命名业务。专利候选样式未确认同类缺陷，未改。证据/tmp/yibiao-guide-history-matrix.json、/tmp/yibiao-guide-history-fixed.png；构建/tmp/yibiao-guide-history-build.log。

2026-11-02机会文字专项：实际BidOpportunityPage隔离快照长项目名/长采购人/长英文风险标记。修前800px样本列表client362/scroll1824，风险标记1775px撑开；修后普通与批量四宽度1440/1280/1000/800的scroll均等于client（559/487/361/362）。启象列表标题14px/22px最多三行，采购人两行规则，标签容器宽度限制与任意断词，详情标题16px/24px。截图/tmp/yibiao-opportunity-text-fixed.png、测量/tmp/yibiao-opportunity-text-layout.json。可研旧inspector候选CSS未找到当前TSX节点，不盲改，后续沿真实目录组件复查。仅Renderer隔离数据布局检查，无真实扫描/模型请求/业务写入；非八模块全部验收。构建/tmp/yibiao-opportunity-text-build.log。

2026-11-02可研长标题：实际OutlinePanel长标题/长写作说明隔离样本验证。目录树正常换行，未盲改；标题编辑从input改两行可垂直调整textarea，粘贴换行转空格，保留标题单段数据。模拟saveOutline、原清空下游确认及保存后焦点回标题通过。四宽度1440/1280/1000/800目录树scrollWidth等于clientWidth，无body横向溢出；标题可见高度52px。证据/tmp/yibiao-outline-title-matrix.json、/tmp/yibiao-outline-title-fixed.png、构建/tmp/yibiao-outline-title-build.log。未调用模型、未改真实项目、未验证真实磁盘保存；尚非全模块验收。

2026-11-02共用项目列表：真实ProjectListTable/ProjectListActions隔离样本复现次级长英文说明覆盖邻列，修前名称列client739/scroll2245、说明宽2233px。projectList.css限制名称容器及按钮/strong/small最大宽度并任意断词，头部长标题可断行、操作按钮不拆字。四宽度1440/1280/1000/800修后名称列client=scroll（899/739/459/290），无body横向溢出。键盘ArrowDown打开菜单、Escape关闭回原按钮通过。此为共用组件样本，不能代替各业务列配置整页验收。证据/tmp/yibiao-project-list-wrap-matrix.json、/tmp/yibiao-project-list-wrap-fixed.png，构建/tmp/yibiao-project-list-wrap-build.log。无真实项目写入。

2026-11-02三业务项目页：实际PatentProjectsPage/SoftwareCopyrightProjectsPage/GrantApplicationProjectsPage隔离列表样本（长名称/中文源码路径/状态/时间）。800px下专利未指定元数据列宽导致名称列134px、scroll172px，更新时间换行；专利表scroll.x改1000，类型100/阶段120/交底书100/更新时间180/操作180，其余留名称。四宽度×三业务共12组名称列scroll=client，无body横向溢出，操作按钮完整；专利名称排序通过。软著和课题未确认新缺陷不改。证据/tmp/yibiao-three-project-columns.json、/tmp/yibiao-patent-columns-fixed.png，构建/tmp/yibiao-three-project-columns-build.log。bridge为隔离列表，未写用户数据或执行业务进入/删除；不计原生持久化通过。

2026-11-02收尾总验收：17项离线检查、5组Electron关键流程回归、完整build/diff通过。macOS arm64目录打包首次下载ECONNRESET，使用本机同版Electron41.10.4重新打包成功；隔离userData启动欢迎窗口后退出，原生采集限制不计整页交互通过。无新增UI改动。固定剩余范围、执行结果与环境限制统一见UI收尾验收清单.md；不再逐条追加审美改造。

2026-11-02打包操作补查：ScreenCaptureKit -3811重复阻断原生操作，未改权限，进程已退出。实际app.asar导出服务生成3类DOCX成功；临时字体配置修复QA渲染缺字，非产品改动。公文样本日期独页待Office对照，渲染页仅部分抽查，不计版式通过。详见统一收尾验收清单。

2026-11-02按公文截图修导出反馈：旧容器对所有后代div施加grid，且终态嵌套共享进度，造成左侧文字拥挤/重复“完成”和整块留白。抽OfficialDocumentExportFeedback及独立CSS：终态仅图标+结果+说明，中性背景，完成外高44px；running才显示进度；文字flex可换行；移除feature旧export-status样式。润色成功提示在导出反馈出现时隐藏，失败/运行任务仍保留；新润色/改写开始清除旧导出反馈。四外观×1280/640×三状态共24面板检查无横向溢出；成功/失败无进度，运行保留1条，长错误可换行。实际完整润色页模拟点击导出后仅一条成功反馈、旧任务成功块0；起草/检查/润色三个入口分区复查通过。重构误覆盖相邻块在整页检查中发现并恢复，未交付该中间状态。证据/tmp/yibiao-office-export-feedback-matrix.json、/tmp/yibiao-office-export-feedback-fixed.png，构建/tmp/yibiao-office-export-feedback-build.log。未调用真实导出服务，未写用户数据。

2026-11-02按软著截图调整工作组织：使用引导改默认折叠；现代软著工作台按项目源码、登记信息、生成控制、草稿审阅、总检与导出分别显示，保留组件挂载，清单/字段定位先切阶段再滚动。软著与课题项目名改索引详情预览，共用ProjectDetailsDrawer，明确进入项目才切工作区；专利原有预览行为保持。本批不代表所有业务列表均已接入详情。隔离实际React页面验证五阶段、引导展开收起、字段往返保留和就绪清单跳登记阶段；640/1280宽度无body横向溢出。软著/课题名称点击显示抽屉；预览未触发项目切换。样本申报复核API返回null，出现预期读取失败提示，不计申报/生成/真实导出或原生持久化验收通过。证据/tmp/yibiao-soft-stages-fixed.png、/tmp/yibiao-soft-project-details-fixed.png。临时fixture已清除。

2026-11-02用户追加项目详情一致性修复：现代技术方案/已有方案扩写、可研、售前、项目管理接入共享ProjectDetailsDrawer；专利替换为同一组件并补进入按钮，软著/课题增加进入中与抽屉内错误反馈。统一名称预览、显式进入工作区。软著enterProject原先即便当前项目仍switchCase；Main对运行任务拒绝switchCase，错误原在抽屉后。当前项目改直接请求工作台，其他项目仍等待切换结果；缺服务/空结果抛可见错误；增加不含路径/项目内容的进入阶段调试日志。已用真实React页面+隔离bridge验证：技术/扩写/可研/项目管理/课题/专利/售前7条名称预览不进入、抽屉进入回调成功；软著实际页面wrapper当前项目进入不调用switchCase、其他项目成功切换后进入、切换拒绝时抽屉保留且错误可见。640宽body无横向溢出；1280抽屉截图/tmp/yibiao-unified-project-details.png。测试不等同真实用户项目或原生IPC闭环；不标所有模块所有状态通过。项目历史属于已存在的归档预览视图，未改成工作区进入；公文/论文无独立项目索引，不新增虚构列表。构建日志/tmp/yibiao-project-details-final-build.log。

2026-11-02再次收到抽屉进入无响应：前两批浏览器回调证据不足，不能确认用户原生问题解决。发现现代顶栏drag区域与Portal抽屉头部重叠，原.app-shell.is-mac按钮no-drag规则不覆盖body下Portal。ProjectDetailsDrawer增加rootClassName和局部CSS，整个抽屉及后代显式no-drag（覆盖所有复用业务）。隔离页面确认Portal不在shell、按钮y16、顶栏drag、按钮/抽屉no-drag，点击回调执行。构建通过/tmp/yibiao-drawer-hit-build.log。隔离Electron已启动但CUA原生捕获SCStream -3811阻断实点，未标原生验收；进程已停止、临时fixture已删除。该修复为定位到的拖拽命中缺陷，不能声称已实测解决用户真实项目。

2026-11-02用户限定只调整新版设置：新增SettingsDisclosure，modern折叠文本高级参数/ComfyUI长JSON，classic返回原children；通用/外观补即时与保存说明；新增CSS全部modern作用域，组合输入/操作换行、技能/模型长名、数字对齐、焦点和设置Portal no-drag，生图状态移除白色badge。隔离实际SettingsPage验证9分类640宽布局（功能管理经丢弃模拟配置缺省差异后打开），文本并发改7收起重开保留，ComfyUI展开含JSON工具与校验。fixture无模型、无配置写入，模拟配置file_parser缺mineru_token导致初始dirty，非产品新缺陷；不计真实保存/服务连接通过。截图/tmp/yibiao-modern-settings.png为badge追加样式前样本；原生拖拽未实点。旧版分支未新增折叠/提示/样式。

2026-11-02按四张设置截图统一结构：通用提示移到分组标题之后；新版外观恢复相同紫色标记标题栏，移除重复正文标题，把即时生效说明放同一提示行，内容统一24px内距。外观选择卡8px圆角、细选中边框，窄屏单列。旧版原h2/说明保留。隔离实际SettingsPage四页标题均首位且57px高/16px24px内距，640宽外观单列无body溢出；截图/tmp/yibiao-settings-style-unified.png；build通过/tmp/yibiao-settings-consistency-build.log。未写真实配置，未触发切换外观。

2026-11-02修新版Word阅读预览低对比：contentWordPreview.css纸张原使用深色yb-card-bg但正文固定深色；新增modern限定白纸/浅灰代码与表头色板，不修改导出文档。隔离实际ContentWordPreview含标题/正文/列表/表格/代码，计算白纸255/255/255与正文53/65/88，截图/tmp/yibiao-word-reading-fixed.png，build通过/tmp/yibiao-word-reading-build.log；未调用真实Word导出。
