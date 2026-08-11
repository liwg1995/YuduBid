param(
  [string]$Executable = "",
  [string]$Installer = "",
  [int]$StartupSeconds = 8,
  [switch]$KeepData
)

$ErrorActionPreference = "Stop"
$clientDir = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -LiteralPath (Join-Path $clientDir "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$productName = $packageJson.build.productName

if ([string]::IsNullOrWhiteSpace($Executable)) {
  $Executable = Join-Path $clientDir "release\win-unpacked\$productName.exe"
}
if ([string]::IsNullOrWhiteSpace($Installer)) {
  $Installer = Join-Path $clientDir "release\YuDuBid-$($packageJson.version)-win-x64.exe"
}

if (!(Test-Path -LiteralPath $Executable -PathType Leaf)) {
  throw "未找到 Windows 主程序：$Executable"
}
if (!(Test-Path -LiteralPath $Installer -PathType Leaf)) {
  throw "未找到 Windows 安装包：$Installer"
}

$exeSignature = Get-AuthenticodeSignature -LiteralPath $Executable
$installerSignature = Get-AuthenticodeSignature -LiteralPath $Installer
if ($exeSignature.Status -ne "NotSigned") {
  throw "主程序不是预期的未签名状态：$($exeSignature.Status)"
}
if ($installerSignature.Status -ne "NotSigned") {
  throw "安装包不是预期的未签名状态：$($installerSignature.Status)"
}

$acceptanceRoot = Join-Path ([System.IO.Path]::GetTempPath()) "禹都软著验收-$([guid]::NewGuid().ToString('N'))"
$userDataDir = Join-Path $acceptanceRoot "用户数据"
$fixtureDir = Join-Path $acceptanceRoot "中文项目\源码"
New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fixtureDir "主程序示例.js") -Encoding UTF8 -Value "export const 软件名称 = '禹都软著中文路径验收';"

$previousUserData = $env:YIBIAO_USER_DATA_DIR
$processes = @()
try {
  $env:YIBIAO_USER_DATA_DIR = $userDataDir
  $first = Start-Process -FilePath $Executable -PassThru
  $processes += $first
  Start-Sleep -Seconds $StartupSeconds
  if ($first.HasExited) {
    throw "首次启动提前退出，退出码：$($first.ExitCode)"
  }
  Stop-Process -Id $first.Id -Force
  $first.WaitForExit()

  $workspaceDir = Join-Path $userDataDir "workspace"
  New-Item -ItemType Directory -Path $workspaceDir -Force | Out-Null
  $sentinelPath = Join-Path $workspaceDir "未签名验收保留标记.txt"
  Set-Content -LiteralPath $sentinelPath -Encoding UTF8 -Value "该文件用于验证重启后工作区不会被清空。"

  $second = Start-Process -FilePath $Executable -PassThru
  $processes += $second
  Start-Sleep -Seconds $StartupSeconds
  if ($second.HasExited) {
    throw "第二次启动提前退出，退出码：$($second.ExitCode)"
  }
  if (!(Test-Path -LiteralPath $sentinelPath -PathType Leaf)) {
    throw "第二次启动后工作区保留标记丢失"
  }
  Stop-Process -Id $second.Id -Force
  $second.WaitForExit()

  [ordered]@{
    success = $true
    version = $packageJson.version
    mode = "unsigned"
    executable = (Resolve-Path -LiteralPath $Executable).Path
    installer = (Resolve-Path -LiteralPath $Installer).Path
    executableSignature = $exeSignature.Status.ToString()
    installerSignature = $installerSignature.Status.ToString()
    userData = $userDataDir
    chineseFixture = $fixtureDir
    firstLaunch = "pass"
    secondLaunch = "pass"
    workspacePreserved = $true
    verifiedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json -Depth 4
}
finally {
  foreach ($process in $processes) {
    if ($process -and !$process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
  $env:YIBIAO_USER_DATA_DIR = $previousUserData
  if (!$KeepData -and (Test-Path -LiteralPath $acceptanceRoot)) {
    Remove-Item -LiteralPath $acceptanceRoot -Recurse -Force
  }
}
