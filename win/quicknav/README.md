# QuickNav 快捷启动器

一个输入框：输入别名回车，就打开对应的文件、文件夹或网址，开完自动消失。
别名写在文件名里，不用维护任何配置文件。

## 两个版本，选一个

| 下载 | 大小 | 说明 |
|---|---|---|
| `QuickNav.exe` | 69 KB | 双击就用，不用解压，不用装运行时（Win10/11 自带 .NET Framework 4.x） |
| `QuickNav.zip` | 6 KB | hta 版，解压后双击 `QuickNav.hta`；本体是一页 HTML，想改随时改 |

两版读同一个 `folder` 目录，别名写法完全一致。

## 怎么用

1. 下载后放进一个固定目录（例如 `%USERPROFILE%\Documents\QuickNav`）。
2. 双击 `QuickNav.exe`（或 hta 版解压出来的 `QuickNav.hta`）。
3. 往同级 `folder` 目录里丢快捷方式，列表自动生成。

exe 版第一次运行若弹出「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」。
程序没买代码签名证书，不是文件损坏。

**命名规则**（都是可选的，能省）

| 文件名写法 | 效果 |
|---|---|
| `hl=原理图.lnk` | 输入 `hl` 回车，打开「原理图」 |
| `hl,hlt=原理图.lnk` | 多个别名，`hl` 或 `hlt` 都能调 |
| `md=MD Editor [工具].lnk` | `[ ]` 或 `【 】` 里的是分组名 |
| `_tmp=临时.lnk` | 下划线开头 = 不进列表，但仍可手输调用 |

- **搜索**：输入 `要搜的词 g`（Google）/ `b`（Bing）/ `bd`（百度）/ `yd`（有道词典）。
- `Esc` 关闭。拖动标题栏可移动窗口。

## 窗口大小（仅 exe 版）

exe 默认按系统缩放的 0.75 倍出窗，嫌大嫌小改同目录的 `scale.txt`：
第一行一个倍数，`0.50`–`1.50`，保存后重开程序生效，字随窗口等比缩放。

## 依赖

- exe 版：Windows 10/11 自带的 .NET Framework 4.x，不需要管理员权限。
- hta 版：`mshta.exe` + VBScript + `WScript.Shell`，系统自带。

## 脱敏说明

两版都不含真实用户名、内网地址、公司文件、本机快捷方式或任何密钥；
`folder` 目录是空的，列表全部由你自己的快捷方式生成。
原源码里写死的一处本机绝对路径，已改成「取本程序同级的 `folder`」。

## 入口

- 列表页：https://askmkmnn.github.io/tools/win/
- exe：https://askmkmnn.github.io/tools/win/quicknav/QuickNav.exe
  sha256 `9c574a79c864678659bb0b63e7503e122e63fdfb9d7a8b05186b8308489731e8`（71 168 B）
- hta：https://askmkmnn.github.io/tools/win/quicknav/QuickNav.zip
