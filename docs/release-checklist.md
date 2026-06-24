# 发布验证清单

本文用于客户端发版前后验证，重点覆盖 Windows 包内自动更新和 macOS 手动下载更新。

## 测试版本

本轮测试 tag：

```text
v0.4.2-pre
```

对应客户端版本会在 Release CI 中同步为：

```text
0.4.2-pre
```

`v0.4.2-pre` 会被 Release CI 标记为 prerelease。正式版客户端默认不读取 prerelease，只有当前客户端版本号本身包含 `-`，或启动时设置了 `YIBIAO_INCLUDE_PRERELEASE_UPDATE=1`，才会读取该测试版本。

## 发版前检查

1. 确认客户端构建通过：

   ```bash
   cd client
   npm ci
   npm run build
   ```

2. 确认 Release workflow 中 Windows 自动更新产物校验存在：

   - `release/*.exe`
   - `release/*.blockmap`
   - `release/latest.yml`

3. 确认 macOS 手动包命名为：

   ```text
   *-manual-package.zip
   ```

## Windows 自动更新验证

1. 准备一台 Windows 测试机。
2. 安装一个带有自动更新代码的低版本测试客户端，例如本地临时构建的 `0.4.1-pre.0`。
   - 不能使用正式 `0.4.1` 作为自动更新基线，因为该版本尚未包含本次新增的自动更新服务。
   - 如果确实要用不带 `-` 的版本号做测试，需要从命令行设置 `YIBIAO_INCLUDE_PRERELEASE_UPDATE=1` 后启动客户端。
3. 推送测试 tag：

   ```bash
   git tag v0.4.2-pre
   git push origin v0.4.2-pre
   ```

4. 等待 GitHub Actions 的 `Release Client` workflow 完成。
5. 打开 GitHub Release，确认资产包含：

   - Windows `.exe`
   - Windows `.blockmap`
   - `latest.yml`
   - macOS `*-manual-package.zip`

6. 打开已安装的低版本测试客户端。
7. 验证启动后的自动检查：

   - 能检测到 `0.4.2-pre`
   - 能开始下载更新
   - 下载进度可以正常变化
   - 下载完成后出现“安装并重启”

8. 验证设置页手动入口：

   - 进入“设置 -> 关于”
   - 点击“检测版本”
   - 出现新版详情
   - Windows 主按钮显示“下载并安装更新”
   - 点击后能下载并提示安装重启

9. 点击“安装并重启”后确认：

   - 客户端能正常退出
   - 安装器能完成覆盖安装
   - 重启后版本号显示为 `0.4.2-pre`

## Windows 预发布基线包建议

为了验证 `v0.4.2-pre`，建议先制作一个不上传 Release 的本地基线包：

```bash
cd client
npm version 0.4.1-pre.0 --no-git-tag-version --allow-same-version
npm run dist:win
```

安装该基线包后，不要提交这个临时版本号改动。完成测试后恢复 `client/package.json` 和 `client/package-lock.json` 的版本改动，再发布 `v0.4.2-pre`。

## macOS 手动下载验证

1. 在 macOS 测试机打开客户端。
2. 进入“设置 -> 关于”。
3. 点击“检测版本”。
4. 打开新版详情后点击“获取最新版”。
5. 确认打开的下载资产优先是当前架构对应的：

   ```text
   *-manual-package.zip
   ```

6. 解压后确认包内包含：

   - `.dmg`
   - `macOS使用说明.txt`

7. 按说明安装并确认应用可启动。

## 回滚与清理

如果 `v0.4.2-pre` 测试发布失败：

1. 在 GitHub Release 页面标记为 prerelease 或删除测试 Release。
2. 如需删除远端 tag：

   ```bash
   git push origin :refs/tags/v0.4.2-pre
   ```

3. 本地删除 tag：

   ```bash
   git tag -d v0.4.2-pre
   ```

4. 修复问题后使用新的测试 tag，避免客户端缓存旧 Release 元数据造成误判。
