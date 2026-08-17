# Contributing to YuduBid
# YuduBid 贡献指南

感谢您对 YuduBid / 禹都AI解决方案助手的关注。

YuduBid 欢迎社区通过 Issue、Pull Request、Bug Report、文档修订和其他合理方式参与项目建设。

在提交贡献之前，请阅读本文件。

---

## 1. 项目许可证

YuduBid 基于 OpenBidKit_Yibiao 进行二次开发，项目按照 GNU Affero General Public License v3.0进行开源发布。

- 项目许可证见：

[LICENSE](./LICENSE)

- 项目来源与版权说明见：

[NOTICE.md](./NOTICE.md)

- 品牌及商标说明见：

[TRADEMARKS.md](./TRADEMARKS.md)

- 第三方软件说明见：

[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

---

## 2. 提交代码前的基本要求

向 YuduBid 提交代码，即表示您确认：

1. 您有权提交相关代码；
2. 相关代码不是未经许可复制的第三方闭源软件代码；
3. 您的提交不会故意侵犯他人的著作权、专利权、
   商标权、商业秘密或其他合法权益；
4. 对于包含第三方代码的贡献，
   您已经确认其许可证允许以相应方式使用；
5. 您理解 YuduBid 是按照 GNU AGPL v3.0
   发布的开源项目；
6. 您提交并被项目合并的贡献，
   将作为 YuduBid 项目的一部分按照适用的
   GNU AGPL v3.0 条款进行发布。

---

## 3. 贡献者版权

除另有明确书面约定外，贡献者仍然保留其对自己原创贡献依法享有的著作权。

提交代码并不意味着必须将著作权所有权转让给 YuduBid 项目维护者。

但是，被项目接受并合并的代码，将按照 YuduBid 项目的 GNU AGPL v3.0许可体系进行发布。

---

## 4. 不接受的代码

请勿提交：

- 从商业闭源软件复制的代码；
- 来源不明的代码；
- 未经许可反编译后复制的代码；
- 明确与 GNU AGPL v3.0 不兼容且无法合法组合的代码；
- 包含第三方 API Key 的代码；
- 包含密码、Token、私钥的代码；
- 包含他人个人隐私数据的代码；
- 明确包含商业秘密的代码；
- 恶意程序；
- 后门代码；
- 未经说明的大段自动生成第三方代码复制内容。

---

## 5. AI 辅助代码

允许使用 AI 编程工具辅助开发。

但是贡献者仍应对自己提交的代码负责。

提交 AI 辅助代码之前，应当进行必要的：

- 功能检查；
- 安全检查；
- 来源检查；
- 许可证检查；
- 代码审查。

不得因为代码由 AI 工具生成，就当然认为其不存在第三方知识产权风险。

---

## 6. Pull Request

提交 Pull Request 时建议说明：

- 本次修改解决的问题；
- 新增的主要功能；
- 修改的主要文件；
- 是否引入新的第三方依赖；
- 是否修改数据结构；
- 是否影响历史数据；
- 是否修改许可证相关文件；
- 是否包含上游代码修改；
- 是否需要更新使用说明。

较大的功能修改建议提前通过 Issue 讨论。

---

## 7. Commit 建议

建议提交信息尽可能清晰。

例如：

```text
feat: add project risk management
fix: preserve word heading styles
docs: update software copyright guide
refactor: split presales workspace service
```

避免大量无意义提交信息，例如：
```text
update
fix
123
```