# 录屏批量压缩

把 Win+G 录的竖版/大尺寸录屏，批量居中裁成 16:9 → 缩到 1080p → 压体积 → 音量标准化。

## 怎么用

1. 本机先装好 [FFmpeg](https://www.gyan.dev/ffmpeg/builds/)（或把 `ffmpeg.exe` 放到本脚本同目录）
2. 把 `compress_mp4.bat` 放到**视频所在文件夹**
3. 双击运行；成品在同目录 `compressed\`，原文件不动

## 默认效果

- 输出上限 1080p（长边 1920），不放大本来就小的源
- CRF 28 / preset veryfast / 30fps
- 音量标准化到 -16 LUFS（`NORM=on`）
- 断点续跑：成品已存在会跳过；失败记在 `compressed\_失败清单.txt`

参数都在脚本开头「可调参数」区，改 `MAXW` / `CRF` / `NORM` 即可。

> 完整备忘（换机重装、实测数据、编码注意）留在 OneDrive `Grok Bot/Tool bo/录屏批量压缩/使用说明.md`，本仓库只放可运行脚本与这份简短说明。

## 注意

- `compress_mp4.bat` **必须用 GBK(ANSI) 保存**，不要存成 UTF-8
- 仅处理当前目录下的 `.mp4`
