# Todo 桌面待办

贴边收纳的桌面待办条。平时是屏幕边上一根窄条，鼠标移上去展开，写完自动收回。基于 PowerShell + WPF，单文件逻辑，不写注册表、不要管理员。

## 怎么用

1. 下载 `Todo.zip`，解压到任意目录（例如 `%USERPROFILE%\Documents\Todo`）。
2. 双击 `TodoLauncher.vbs`。
3. 右键出菜单：换皮肤、切显示模式（网格 / 列表 / 边缘吸附）、置顶、设置。

**数据在哪**

| 文件 | 作用 |
|---|---|
| `tasks.json` | 待办列表 + 窗口位置，首次启动自动生成 |
| `attachments/` | 拖进来的附件，自动创建 |

备份就拷这两样。删掉后重启回到初始状态。

## 依赖

- Windows 自带 **Windows PowerShell 5.1**（`powershell.exe`）。不要用 PowerShell 7，WPF 那部分不兼容。
- .NET Framework 4.x（Win10/11 自带）。
- 无需管理员权限，不写注册表，不装服务。

## 脱敏说明

本包只含程序本体：

- **未附带** `tasks.json`——首次启动自动生成空白列表，原包里那 8 条真实任务（供应商交期、客户 QA 之类）全部剔除。
- **未附带** `attachments/`——原包含 5 个公司邮件 `.msg`、2 个外部快捷方式、1 份内部待办快照，全部剔除；目录由程序首次启动时自建。
- **未附带** `_backups/`（33 份历史备份）、`_old/`（7 份旧版）、`log.txt`、`launcher.log`、`Todo.lnk`。
- 源码本身已核：无硬编码本机路径（全部走 `$scriptDir`）、无用户名、无内网地址、无密钥。PowerShell AST 静态解析 1753 行、14288 token、**0 语法错误**。

## 入口

- 列表页：https://askmkmnn.github.io/tools/win/
- 下载：https://askmkmnn.github.io/tools/win/todo/Todo.zip
