# 桌宠 DesktopPet

Windows 桌面宠物，附一个迷你聊天窗（PChat）。纯 PowerShell + WPF 实现，双击 `.vbs` 启动，不用装运行时、不改注册表、不需要管理员权限。

## 怎么用

1. 解压到任意位置（例如 `文档\Y_App\DesktopPet`）
2. 双击 `创建快捷方式.vbs`，桌面和开始菜单会出现「桌宠」和「PChat」
3. 以后点快捷方式即可；也可以直接双击 `Pet.vbs` 或 `PChat\StartChat.vbs`
4. 挪了文件夹？再双击一次 `创建快捷方式.vbs` 更新快捷方式

## 依赖

- Windows 10 / 11，用系统自带的 PowerShell 5.1 与 WPF，**无需额外安装**
- 聊天功能需要自备 API：编辑 `PChat/API.txt`，填 OpenAI 兼容的 `model` / `apiKey` / `apiBase`（可参考 `API.deepseek.example.txt`）

## 脱敏说明

本包已脱敏，可直接公开：

- `PChat/API.txt` 是占位模板（`YOUR_API_KEY`），**不含任何真实密钥**
- `Core/dpet.json` 已重置为默认值，不含使用者的屏幕坐标与角色选择
- 不含本机用户路径、公司资料、内网地址
- 不含聊天历史（`ChatHistory.json` 为空）

## 换角色 / 改点击动作

- **角色图**：把 gif / png / jpg 丢进 `Core\Assets`，重启后随机轮播
- **单击 / 双击 / 三击**：替换 `Core\Actions\Single`、`Double`、`Triple` 里的文件（每个目录放一个，可以是 vbs、bat 或快捷方式）
- **位置 / 大小 / 速度**：自动保存到 `Core\dpet.json`

## 入口

- 列表页：https://askmkmnn.github.io/tools/win/
- 直接下载：https://askmkmnn.github.io/tools/win/desktoppet/DesktopPet.zip

> 打包版只含 4 张示例角色图；完整素材在 OneDrive「Grok Bot / Tool bo / desktoppet」。
