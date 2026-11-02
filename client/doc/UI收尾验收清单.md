# UI收尾验收清单

更新：2026-11-02。分支 design，累计修改未提交、未推送、未发布。本表是收尾状态入口；以往UI当前交接和专题记录保留作证据，不再把历史条目误读为新的待办。

## 固定范围

八大模块现有主要页面、常用弹窗及关键本地流程。只修复文字不可读、控件遮挡/越界、主题残留、保存/恢复/任务状态错误等确认问题；不再追加新的视觉方向和业务功能。未经用户要求，不提交、推送或发布。

## 本轮自动化总验收

2026-11-02重新执行，均退出0：

- [x] `npm run verify:offline`：17项顺序检查，包括IPC契约、更新完整性、安全HTTP、配置密钥、插件兼容、任务恢复、论文、项目协作、模型能力、Agent基础、Mermaid/Renderer/资源打包检查、文档安全、源码准备、专利及软著。
- [x] `npm run build`：TypeScript及Vite构建，7.05s，只有既有chunk体积警告。
- [x] `npm run verify:office-grant:electron`：独立进程公文/课题恢复、项目隔离、中文路径实际DOCX内容/表格、默认文件名、取消/失败。
- [x] `npm run verify:software-presales:persistence`：三个Electron进程软著草稿/清空/历史还原、双项目隔离，售前五成果持久化。
- [x] `npm run verify:project-management:electron`：preload及实际IPC、进度、中文持久化、项目增删切换；模型响应为测试桩。
- [x] `npm run verify:feasibility-report`：项目与文件持久化、下游失效、资源清理、重启恢复。日志中的索引损坏异常由测试故意注入，恢复断言通过，不是用户项目故障。
- [x] `npm run verify:presales-export`：中文目录PPTX/HTML、导出记录和取消；生成4页PPTX、内容断言通过。
- [x] `git diff --check`。

离线/构建日志：`/tmp/yibiao-final-offline-20261102.log`、`/tmp/yibiao-final-build-20261102.log`。Electron各命令结果见本次执行记录。测试使用隔离临时业务数据；无用户真实项目写入，无真实模型请求。

## 仍须关闭的交付项

- [ ] 全模块主要入口最终目视巡检：把此前逐页/组件证据汇总，再补缺少的页面、常用弹窗及长内容状态。源码扫描和组件样本不能代替整页巡检。
- [ ] 原生交互缺口：售前、软著等模块尚未完成全部UI→preload→IPC鼠标操作闭环；后台任务离开/重入恢复仍需独立验证。
- [x] macOS arm64应用目录打包及隔离启动：electron-builder退出0，原生窗口打开欢迎页。尚未计打包后关键业务操作或DMG安装通过。
- [ ] Word/WPS人工排版：目录、分页、长表格、图片、Mermaid、中文字体；已有文件/XML断言不替代目视。
- [ ] 最终累计diff审查：重点主题/覆盖样式、状态及错误恢复，冻结后再跑必要回归。

## 环境受限的独立项目

Windows中文目录、125%/150%缩放与原生文件对话框、Windows安装包安装/运行尚未实测。真实模型的兼容性和输出质量未验收。当前macOS检查不得标记这些项目完成；交付时明确列为未验收条件，不自动延伸成新的UI改造。

## 完成口径

本轮主要页面可读、常用操作可用、关键本地流程有证据、构建及本机打包通过。交付必须同时列出未验证平台/排版项，不把“自动化通过”写成“八模块全状态验收通过”。后续按批次收尾，不再每一条CSS改动单独成为新计划。

## 本机目录打包记录

首次打包下载运行时发生ECONNRESET；使用配置支持的electronDist指向node_modules/electron/dist（同版本41.10.4）重试成功。未改依赖、项目打包配置或既有identity:null签名约定。产物位于`/tmp/yibiao-ui-final-package-20261102/mac-arm64/禹都AI解决方案助手.app`，未覆盖client/release。日志`/tmp/yibiao-ui-final-package-local-20261102.log`。

打包应用使用`YIBIAO_USER_DATA_DIR=/tmp/yibiao-ui-final-native-20261102`启动，原生窗口及欢迎画面可见，随后停止本次进程。日志`/tmp/yibiao-ui-final-native-20261102.log`。原生截图存在倾斜/缩小的采集限制，AX未暴露页面内部节点，因此不计整页文字、控件或交互目视验收通过。原生日志有sandbox_extension及宿主NODE_OPTIONS警告，未观察到窗口启动失败；这些警告未通过修改应用安全配置规避。

## 2026年11月2日打包操作与导出版式补查

原生鼠标操作未验收：隔离userData启动打包应用，界面工具连续两次出现ScreenCaptureKit -3811，无法开始捕获。未尝试改变系统权限或产品安全设置，已退出本批进程。日志`/tmp/yibiao-packaged-interaction-20261102.log`。因此保存/重启/切换鼠标操作仍未关闭。

替代验证边界：使用Electron运行时加载实际app.asar内exportService，成功生成公文、可研和项目协作三类DOCX，warnings均空；不是源码目录下服务的再次自测。样本是合成中文内容，后两类含28行表格，无模型请求、无用户项目读写。复现脚本及文件在`/tmp/yibiao-export-layout-20261102/`。

使用documents技能及工作区依赖中的LibreOffice渲染。首次默认字体环境中文缺字，不作为产品缺字结论；临时FONTCONFIG_FILE引入系统中文字体及替代映射后文字恢复，未修改产品或系统字体。公文2页、可研6页、项目协作9页完成渲染；仅抽查部分页面，不能计逐页通过。抽查公文出现日期独页，需Word/WPS对照；表格分页、目录编号、默认行距等仍需继续核对。字体环境下的分页不应直接等同用户Word环境结果。

本批没有修改产品代码，也没有把渲染成功标作版式验收通过。原生操作、Word/WPS排版、Windows专项的待验收状态保持明确。

2026-11-02按软著截图调整工作组织：使用引导改默认折叠；现代软著工作台按项目源码、登记信息、生成控制、草稿审阅、总检与导出分别显示，保留组件挂载，清单/字段定位先切阶段再滚动。软著与课题项目名改索引详情预览，共用ProjectDetailsDrawer，明确进入项目才切工作区；专利原有预览行为保持。本批不代表所有业务列表均已接入详情。隔离实际React页面验证五阶段、引导展开收起、字段往返保留和就绪清单跳登记阶段；640/1280宽度无body横向溢出。软著/课题名称点击显示抽屉；预览未触发项目切换。样本申报复核API返回null，出现预期读取失败提示，不计申报/生成/真实导出或原生持久化验收通过。证据/tmp/yibiao-soft-stages-fixed.png、/tmp/yibiao-soft-project-details-fixed.png。临时fixture已清除。

2026-11-02用户追加项目详情一致性修复：现代技术方案/已有方案扩写、可研、售前、项目管理接入共享ProjectDetailsDrawer；专利替换为同一组件并补进入按钮，软著/课题增加进入中与抽屉内错误反馈。统一名称预览、显式进入工作区。软著enterProject原先即便当前项目仍switchCase；Main对运行任务拒绝switchCase，错误原在抽屉后。当前项目改直接请求工作台，其他项目仍等待切换结果；缺服务/空结果抛可见错误；增加不含路径/项目内容的进入阶段调试日志。已用真实React页面+隔离bridge验证：技术/扩写/可研/项目管理/课题/专利/售前7条名称预览不进入、抽屉进入回调成功；软著实际页面wrapper当前项目进入不调用switchCase、其他项目成功切换后进入、切换拒绝时抽屉保留且错误可见。640宽body无横向溢出；1280抽屉截图/tmp/yibiao-unified-project-details.png。测试不等同真实用户项目或原生IPC闭环；不标所有模块所有状态通过。项目历史属于已存在的归档预览视图，未改成工作区进入；公文/论文无独立项目索引，不新增虚构列表。构建日志/tmp/yibiao-project-details-final-build.log。

2026-11-02再次收到抽屉进入无响应：前两批浏览器回调证据不足，不能确认用户原生问题解决。发现现代顶栏drag区域与Portal抽屉头部重叠，原.app-shell.is-mac按钮no-drag规则不覆盖body下Portal。ProjectDetailsDrawer增加rootClassName和局部CSS，整个抽屉及后代显式no-drag（覆盖所有复用业务）。隔离页面确认Portal不在shell、按钮y16、顶栏drag、按钮/抽屉no-drag，点击回调执行。构建通过/tmp/yibiao-drawer-hit-build.log。隔离Electron已启动但CUA原生捕获SCStream -3811阻断实点，未标原生验收；进程已停止、临时fixture已删除。该修复为定位到的拖拽命中缺陷，不能声称已实测解决用户真实项目。

2026-11-02用户限定只调整新版设置：新增SettingsDisclosure，modern折叠文本高级参数/ComfyUI长JSON，classic返回原children；通用/外观补即时与保存说明；新增CSS全部modern作用域，组合输入/操作换行、技能/模型长名、数字对齐、焦点和设置Portal no-drag，生图状态移除白色badge。隔离实际SettingsPage验证9分类640宽布局（功能管理经丢弃模拟配置缺省差异后打开），文本并发改7收起重开保留，ComfyUI展开含JSON工具与校验。fixture无模型、无配置写入，模拟配置file_parser缺mineru_token导致初始dirty，非产品新缺陷；不计真实保存/服务连接通过。截图/tmp/yibiao-modern-settings.png为badge追加样式前样本；原生拖拽未实点。旧版分支未新增折叠/提示/样式。

2026-11-02按四张设置截图统一结构：通用提示移到分组标题之后；新版外观恢复相同紫色标记标题栏，移除重复正文标题，把即时生效说明放同一提示行，内容统一24px内距。外观选择卡8px圆角、细选中边框，窄屏单列。旧版原h2/说明保留。隔离实际SettingsPage四页标题均首位且57px高/16px24px内距，640宽外观单列无body溢出；截图/tmp/yibiao-settings-style-unified.png；build通过/tmp/yibiao-settings-consistency-build.log。未写真实配置，未触发切换外观。

2026-11-02修新版Word阅读预览低对比：contentWordPreview.css纸张原使用深色yb-card-bg但正文固定深色；新增modern限定白纸/浅灰代码与表头色板，不修改导出文档。隔离实际ContentWordPreview含标题/正文/列表/表格/代码，计算白纸255/255/255与正文53/65/88，截图/tmp/yibiao-word-reading-fixed.png，build通过/tmp/yibiao-word-reading-build.log；未调用真实Word导出。
