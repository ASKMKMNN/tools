# QuickNav 快捷启动器

一个 720×480 的无边框输入框：输入别名回车，就打开对应的文件、文件夹或网址，开完自动消失。
别名写在文件名里，不用维护任何配置文件。

## 怎么用

1. 下载 `QuickNav.zip`，解压到任意目录（例如 `%USERPROFILE%\Documents\QuickNav`）。
2. 双击 `QuickNav.hta`。
3. 往同级 `folder` 目录里丢快捷方式，列表会自动生成。

**命名规则**（都是可选的，能省）

| 文件名写法 | 效果 |
|---|---|
| `hl=原理图.lnk` | 输入 `hl` 回车，打开「原理图」 |
| `hl,hlt=原理图.lnk` | 多个别名，`hl` 或 `hlt` 都能调 |
| `md=MD Editor [工具].lnk` | `[ ]` 或 `【 】` 里的是分组名 |
| `_tmp=临时.lnk` | 下划线开头 = 不进列表，但仍可手输调用 |

- **搜索**：输入 `要搜的词 g`（Google）/ `b`（Bing）/ `bd`（百度）/ `yd`（有道词典）。
- `Esc` 关闭。拖动标题栏可移动窗口。

## 依赖

Windows 自带组件即可：`mshta.exe` + VBScript + `WScript.Shell` 对象。不需要 .NET、Python、Node，也不需要管理员权限。

## 脱敏说明

已脱敏：源码里原有一处写死的本机绝对路径（`C:\Users\<用户名>\...`），改成「取本程序同级的 `folder` 目录」，换机器不用改代码。本包不含真实用户名、内网地址、公司文件、本机快捷方式或任何密钥。

## 入口

- 列表页：https://askmkmnn.github.io/tools/win/
- 下载：https://askmkmnn.github.io/tools/win/quicknav/QuickNav.zip
