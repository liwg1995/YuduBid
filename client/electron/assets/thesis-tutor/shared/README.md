# 共享配置文件

本目录包含 Thesis Tutor 的共享配置文件，用于支持多语言和学科细分功能。

## 文件说明

### disciplines.json
学科元数据配置，包含：
- 学科中英文名称
- 关键词（用于意图识别）
- 学科细分方向

### citation_formats.json
引用格式配置，包含：
- 6种主流引用格式（GB/T 7714、APA、MLA、IEEE、Chicago、Vancouver）
- 按学科/地区的默认格式映射
- 各格式的示例

## 使用方式

这些配置文件由 `KnowledgeBase` 类自动加载，用于：
1. 多语言学科名称映射
2. 意图识别的关键词匹配
3. 学科细分方向识别
4. 引用格式推荐

## 扩展指南

### 添加新学科
1. 在 `disciplines.json` 中添加学科配置
2. 创建对应的语言目录和文件
3. 更新 `local_assistant.py` 中的学科映射

### 添加新引用格式
1. 在 `citation_formats.json` 中添加格式配置
2. 更新 `default_by_discipline` 映射
