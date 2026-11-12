@echo off
rem ============================================================================
rem  批量裁切 + 压缩 MP4 脚本（通用版，不用管源分辨率）
rem  作用：任意尺寸的录屏 -> 居中裁成 16:9 -> 缩到 1080p 上限 -> 压缩体积 -> 音量标准化
rem  版本：v1.2（2026-11-10）
rem  新版：双击后先弹出选项窗口（裁切/分辨率/音频/颜色），选完才开始处理
rem  用法：把本文件放到【放视频的那个文件夹】里，双击运行。
rem        输出到 .\compressed\ ，原文件不会被改动或删除。
rem  容错：单个文件失败自动跳过并记录，不会中断整批任务。
rem
rem  自适应规则（不需要你手动算分辨率）：
rem    2160x1440 (3:2)  -> 1920x1080     4K 3840x2160   -> 1920x1080
rem    1080x1620 (2:3)  -> 1080x608      超宽 2560x1080 -> 1920x810（不拉伸变形）
rem    比 1080p 小的源一律不放大，保持原尺寸
rem
rem  每个文件处理完都会打印"输出 宽x高"，可以当场核对是不是 1920x1080。
rem
rem  本机实测（i5-6300U / 2160x1440 源 / 10 秒）：
rem    medium + 原宽 2160x1216 ........ 23.3 秒  4.59 MB  ← 旧配置
rem    veryfast + 1080p .............. 11.7 秒  2.36 MB  ← 现在用的
rem    veryfast + 720p ...............  4.4 秒  0.84 MB（嫌慢就把 MAXW 改 1280）
rem    ultrafast .................. 千万别用，体积反而大 3.8 倍
rem    QSV/NVENC 硬件编码 .......... 你这台机器上更慢或直接不支持，别折腾
rem ============================================================================
setlocal

rem ----------------------------【可调参数】------------------------------------
rem CRF = 画质/体积平衡，0-51，越小越清晰、体积越大。
rem       录屏画面平整、噪点少，比实拍更耐压：28 在 1080p 下足够看。
rem       18≈视觉无损 | 23≈x264默认 | 28≈本脚本 | 文字发虚就改 26 | 32+会出糊块
set "CRF=28"

rem PRESET = 编码速度/压缩效率的取舍，不改画质档位（同 CRF 下只影响压多小、多久）。
rem          ultrafast > superfast > veryfast > faster > fast > medium > slow > veryslow
rem          实测 veryfast 在 1080p 下比 medium 快 2 倍且体积更小，所以默认 veryfast。
set "PRESET=veryfast"

rem 输出帧率固定 30fps（你的录制是 30.04fps，这里统一成 30，兼容性最好）。
rem 源若是 60fps，这一步还能省近一半编码量。想保留 60fps 就填 60。
set "FPS=30"

rem 音频码率。你的源是 116kbps 立体声，转 128k 基本无损、体积也不涨。
rem 注意：码率管的是"音质清晰度"，跟"声音大小"完全无关，别混淆。
rem 想完全不重编音频可改 copy（但那样下面的音量标准化就不起作用了）。
set "ABR=128k"

rem ----------------【音量标准化：解决"录屏声音太小"】--------------------------
rem 录屏时系统音量滑块偏低，录进去的电平就永久偏小，转码救不回来 —— 只能靠重算响度。
rem on  = 把每个输出的平均响度统一拉到 -16 LUFS（视频平台通用标准），
rem       实测能把 -53dB 的小声素材拉到 -15dB，且 TP=-1.5 保证不爆音、不失真；
rem off = 原样保留输入音量（转码本身不改变音量，只是不帮你放大）。
set "NORM=on"
set "AF="
if /i "%NORM%"=="on" set "AF=-af loudnorm=I=-16:TP=-1.5:LRA=11"

rem 日志级别：error = 只打印错误，输出干净；排查怪文件时临时改成 warning 或 info。
set "LOGLEVEL=error"

rem --------【核心：裁切成 16:9 + 输出宽度上限（这一步是提速瘦身关键）】--------
rem 第一步 crop=iw:高:x:y  —— 只写宽高时 x/y 自动居中，不写就等于"上下居中不偏移"。
rem   宽 = iw（保留全宽）
rem   高 = min(ih, round(iw*9/16/2)*2)
rem        · iw*9/16 是按 16:9 反算该留多高；
rem        · ÷2 再 round 再 ×2 是为了凑偶数，libx264 + yuv420p 要求宽高都是偶数，
rem          否则报 "height not divisible by 2"（例如 2160*9/16=1215 是奇数，会被修正成 1216）；
rem        · 外面套 min(ih, ...) 是保险：万一源比 16:9 还宽（如超宽屏），
rem          就只裁到原高度、不报错。单引号是 ffmpeg 的表达式引用，用来保护里面的逗号。
rem 第二步 scale='min(1920,iw)':-2
rem   · 宽度取 min(1920, 当前宽)：大的缩到 1920，本来就小的不放大；
rem   · 高度 -2 = 按原比例自动算，并强制取偶数。
set "VF=crop=iw:'min(ih,round(iw*9/16/2)*2)'"

rem 输出宽度上限：1920 = 1080p（默认）；1280 = 720p（快 2.7 倍）；0 = 不缩放
set "MAXW=1920"
if not "%MAXW%"=="0" set "VF=%VF%,scale='min(%MAXW%,iw)':-2"

rem 目标分辨率的文字说明（只用于界面显示）
set "TARGETTXT="
if "%MAXW%"=="1920" set "TARGETTXT=1080p（长边上限 1920）"
if "%MAXW%"=="1280" set "TARGETTXT=720p（长边上限 1280）"
if "%MAXW%"=="0" set "TARGETTXT=原始尺寸（不缩放）"
if not defined TARGETTXT set "TARGETTXT=长边上限 %MAXW%"
rem ---------------- 选项窗口（图形界面，用系统自带 PowerShell） ----------------
rem 选项结果写进临时 .cmd，再 call 读回；点「取消」则不碰任何文件。
rem GUI 代码内嵌在本文件末尾的 "::PS " 注释行里，所以复制这一个 bat 到哪都能用。
set "CMP_BAT=%~f0"
set "CMP_OPTS=%TEMP%\_compress_ui_opts.cmd"
set "CMP_PS1=%TEMP%\_compress_ui.ps1"
if exist "%CMP_OPTS%" del /f /q "%CMP_OPTS%" >nul 2>nul
if exist "%CMP_PS1%" del /f /q "%CMP_PS1%" >nul 2>nul
rem 下面 5 个是「窗口打不开」时用的默认值，与旧版行为一致
set "OPT_CANCEL=1"
set "OPT_CROP=169"
set "OPT_MAXW=1920"
set "OPT_AUDIO=norm"
set "OPT_PIX=yuv420p"
where powershell >nul 2>nul
if errorlevel 1 goto :UI_TEXT
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllLines($env:CMP_BAT,[Text.Encoding]::GetEncoding(936)); $c=($s|Where-Object{$_.StartsWith('::PS ')}|ForEach-Object{$_.Substring(5)}) -join [char]10; [IO.File]::WriteAllText($env:CMP_PS1,$c,[Text.Encoding]::GetEncoding(936))"
if not exist "%CMP_PS1%" goto :UI_TEXT
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%CMP_PS1%"
if not exist "%CMP_OPTS%" goto :UI_TEXT
goto :UI_READ
:UI_TEXT
call :UI_TEXT_MENU
:UI_READ
if exist "%CMP_PS1%" del /f /q "%CMP_PS1%" >nul 2>nul
if exist "%CMP_OPTS%" call "%CMP_OPTS%"
if exist "%CMP_OPTS%" del /f /q "%CMP_OPTS%" >nul 2>nul
if /i not "%OPT_CANCEL%"=="1" goto :UI_GO
echo.
echo   已取消，没有处理任何文件。
echo.
pause
exit /b 0
:UI_GO
call :UI_APPLY
rem ---------------------------【参数结束，下面一般不用改】---------------------

rem 切到脚本所在目录；用 pushd 以兼容"从网络路径/快捷方式启动"的情况
pushd "%~dp0" || (echo [错误] 无法进入脚本所在目录 & pause & exit /b 1)
set "OUTDIR=%~dp0compressed"
set "FAILLOG=%OUTDIR%\_失败清单.txt"

rem ----------------------------【查找 ffmpeg】--------------------------------
set "FFMPEG=ffmpeg"
where ffmpeg >nul 2>nul
if not errorlevel 1 goto :FFMPEG_OK
if exist "%~dp0ffmpeg.exe" (set "FFMPEG=%~dp0ffmpeg.exe" & goto :FFMPEG_OK)
if exist "%~dp0ffmpeg\bin\ffmpeg.exe" (set "FFMPEG=%~dp0ffmpeg\bin\ffmpeg.exe" & goto :FFMPEG_OK)
if exist "%LOCALAPPDATA%\Programs\ffmpeg\bin\ffmpeg.exe" (set "FFMPEG=%LOCALAPPDATA%\Programs\ffmpeg\bin\ffmpeg.exe" & goto :FFMPEG_OK)
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (set "FFMPEG=%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" & goto :FFMPEG_OK)
if exist "C:\ffmpeg\bin\ffmpeg.exe" (set "FFMPEG=C:\ffmpeg\bin\ffmpeg.exe" & goto :FFMPEG_OK)
echo.
echo [错误] 没有找到 ffmpeg.exe
echo        解决办法（任选一个）：
echo        1) 把 ffmpeg 解压后的 bin 目录加入系统 PATH，然后重新打开窗口
echo        2) 直接把 ffmpeg.exe 复制到本脚本所在文件夹
echo        3) 把整个 ffmpeg 文件夹解压到本脚本旁边，保持 ffmpeg\bin\ffmpeg.exe 结构
echo.
pause
popd
exit /b 1
:FFMPEG_OK

rem 顺带定位 ffprobe（只用来事后读回成品分辨率，找不到也不影响处理）
set "FFPROBE=ffprobe"
if /i not "%FFMPEG%"=="ffmpeg" set "FFPROBE=%FFMPEG:ffmpeg.exe=ffprobe.exe%"

if not exist "%OUTDIR%" mkdir "%OUTDIR%" >nul 2>nul

rem ----------------------------【统计文件总数】--------------------------------
set /a TOTAL=0
for %%F in (*.mp4) do set /a TOTAL+=1
if %TOTAL%==0 (
  echo.
  echo [提示] 当前目录里没有找到 .mp4 文件：
  echo        %CD%
  echo        请把本 .bat 放到视频所在的那个文件夹里再运行。
  echo.
  pause
  popd
  exit /b 0
)

if exist "%OUTDIR%\*.mp4" (
  echo.
  echo [注意] compressed 里已经有成品文件，同名文件会被"已存在"跳过。
  echo        如果你刚换过参数（比如从 720p 改成 1080p），必须先把
  echo        compressed 文件夹删掉或改名，否则看到的还是旧的成品。
  echo.
)

echo ============================================================================
echo  找到 %TOTAL% 个 .mp4 文件，开始裁切 + 压缩
echo  输出目录 : %OUTDIR%
echo  脚本版本 : v1.2（图形选项窗口）
echo  目标输出 : %TARGETTXT%
echo  画面裁切 : %CROPTXT%
echo  音频处理 : %AUDIOTXT%
echo  像素格式 : %PIXTXT%
echo  编码参数 : libx264   CRF=%CRF%   PRESET=%PRESET%   FPS=%FPS%
echo  提示     : 中途可以按 Ctrl+C 停止，已完成的文件下次运行会自动跳过
echo ============================================================================

set /a IDX=0
set /a OKN=0
set /a FAILN=0
set /a TOTINKB=0
set /a TOTOUTKB=0
> "%FAILLOG%" echo 处理失败清单  时间：%DATE% %TIME%
>>"%FAILLOG%" echo --------------------------------------------------

rem ----------------------------【主循环】--------------------------------------
rem 注意：这里故意不开"延迟展开"（enabledelayedexpansion），
rem 否则文件名里带 ! 的文件会被 cmd 吃掉字符。计数一律用 set /a 完成。
for %%F in (*.mp4) do (
  set /a IDX+=1
  set "SRC=%%~fF"
  set "NAME=%%~nxF"
  set "BASE=%%~nF"
  call :DO_ONE
)

rem ----------------------------【全部结束】------------------------------------
set /a SAVEDKB=TOTINKB-TOTOUTKB
echo.
echo ============================================================================
echo                         所有任务处理完毕
echo ----------------------------------------------------------------------------
echo  共 %TOTAL% 个文件     成功 %OKN% 个     失败 %FAILN% 个
echo  总输入 %TOTINKB% KB  ^-^>  总输出 %TOTOUTKB% KB     共省下约 %SAVEDKB% KB
if not "%FAILN%"=="0" echo  失败记录见：%FAILLOG%
echo  处理结果都在：%OUTDIR%
echo ============================================================================
echo.
pause
popd
exit /b 0

rem ============================================================================
rem  子过程：处理单个文件
rem  说明：这里全部用 goto 分支，不用 if(...) 括号块。
rem        括号块里的 %变量% 会在整块解析时就展开，导致显示上一条文件的旧数据。
rem ============================================================================
:DO_ONE
set "DST=%OUTDIR%\%BASE%.mp4"
set "TMP=%OUTDIR%\%BASE%.__tmp.mp4"

if not exist "%DST%" goto :DO_REAL

rem ---- 分支一：成品已存在，直接跳过（断点续跑就靠它）----
set /a OKN+=1
for %%A in ("%SRC%") do set "INSZ=%%~zA"
for %%A in ("%DST%") do set "OUTSZ=%%~zA"
set /a INKB=INSZ/1024
set /a OUTKB=OUTSZ/1024
set /a TOTINKB+=INKB
set /a TOTOUTKB+=OUTKB
call :GETDIM "%DST%"
echo [%IDX%/%TOTAL%] 已存在，跳过: "%NAME%"   现有 %DIM%
goto :EOF

rem ---- 分支二：正式处理 ----
:DO_REAL
echo.
echo ----------------------------------------------------------------------------
echo [%IDX%/%TOTAL%] 正在处理: "%NAME%"
echo ----------------------------------------------------------------------------

rem 先写临时文件，成功后再改名；这样失败时不会在 compressed 里留下半截坏文件
"%FFMPEG%" -hide_banner -nostdin -loglevel %LOGLEVEL% -stats -y -i "%SRC%" -map 0:v:0 -map 0:a? -sn -dn -vf "%VF%" %AF% -c:v libx264 -preset %PRESET% -crf %CRF% %PIXARG% -r %FPS% %AARGS% -movflags +faststart -f mp4 "%TMP%"
if errorlevel 1 goto :DO_FAIL

move /y "%TMP%" "%DST%" >nul 2>nul
if errorlevel 1 goto :DO_FAIL

set /a OKN+=1
for %%A in ("%SRC%") do set "INSZ=%%~zA"
for %%A in ("%DST%") do set "OUTSZ=%%~zA"
set /a INKB=INSZ/1024
set /a OUTKB=OUTSZ/1024
set /a TOTINKB+=INKB
set /a TOTOUTKB+=OUTKB
call :GETDIM "%DST%"
echo   完成: %INKB% KB  ^-^>  %OUTKB% KB     输出 %DIM%     "%BASE%.mp4"
goto :EOF

rem ---- 分支三：失败 ----
:DO_FAIL
set /a FAILN+=1
echo   [失败] 已跳过: "%NAME%"
>>"%FAILLOG%" echo "%NAME%"
if exist "%TMP%" del /f /q "%TMP%" >nul 2>nul
goto :EOF

rem ============================================================================
rem  子过程：用 ffprobe 读回成品分辨率，结果放进变量 DIM（形如 1920x1080）
rem ============================================================================
:GETDIM
set "DIM=未知"
if not exist "%~1" goto :EOF
"%FFPROBE%" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "%~1" >"%TEMP%\_dim_tmp.txt" 2>nul
if not exist "%TEMP%\_dim_tmp.txt" goto :EOF
set /p DIM=<"%TEMP%\_dim_tmp.txt"
del /f /q "%TEMP%\_dim_tmp.txt" >nul 2>nul
if "%DIM%"=="" set "DIM=未知"
if not "%DIM%"=="未知" set "DIM=%DIM:,=x%"
goto :EOF

rem ============================================================================
rem  子过程：PowerShell 不可用时的文字菜单降级（5 秒不选自动用默认值）
rem ============================================================================
:UI_TEXT_MENU
where choice >nul 2>nul
if errorlevel 1 goto :EOF
echo.
echo   === 图形窗口打不开，改用文字菜单（5 秒不选自动用默认值）===
choice /c 12 /n /t 5 /d 2 /m "  1 画面裁切 [1=不变 / 2=16:9居中剪裁]: "
if errorlevel 2 (set "OPT_CROP=169") else (set "OPT_CROP=none")
choice /c 123 /n /t 5 /d 2 /m "  2 输出分辨率 [1=沿用 / 2=1080P / 3=720P]: "
if errorlevel 3 (set "OPT_MAXW=1280") else (if errorlevel 2 (set "OPT_MAXW=1920") else (set "OPT_MAXW=0"))
choice /c 12 /n /t 5 /d 2 /m "  3 音频 [1=沿用 / 2=标准化 -16LUFS]: "
if errorlevel 2 (set "OPT_AUDIO=norm") else (set "OPT_AUDIO=keep")
choice /c 123 /n /t 5 /d 2 /m "  4 颜色 [1=沿用 / 2=yuv420p / 3=其他 yuv444p]: "
if errorlevel 3 (set "OPT_PIX=yuv444p") else (if errorlevel 2 (set "OPT_PIX=yuv420p") else (set "OPT_PIX=keep"))
set "OPT_CANCEL=0"
goto :EOF

rem ============================================================================
rem  子过程：把 4 个选项翻译成 ffmpeg 参数
rem ============================================================================
:UI_APPLY
set "VF="
set "AF="
set "AARGS="
set "PIXARG="
set "CROPTXT=不变"
set "AUDIOTXT=沿用（直接复制原音轨）"
set "PIXTXT=沿用（跟随源文件）"
if /i not "%OPT_CROP%"=="169" goto :UI_CROP_DONE
set "VF=crop=iw:'min(ih,round(iw*9/16/2)*2)'"
set "CROPTXT=16:9 居中剪裁"
:UI_CROP_DONE
if "%OPT_MAXW%"=="0" goto :UI_SCALE_DONE
if not defined VF goto :UI_SCALE_ONLY
set "VF=%VF%,scale='min(%OPT_MAXW%,iw)':-2"
goto :UI_SCALE_DONE
:UI_SCALE_ONLY
set "VF=scale='min(%OPT_MAXW%,iw)':-2"
:UI_SCALE_DONE
rem 一个滤镜都不用时填 null（ffmpeg 的空操作滤镜），保证 -vf 参数始终合法
if not defined VF set "VF=null"
if /i not "%OPT_AUDIO%"=="norm" goto :UI_AUD_DONE
set "AF=-af loudnorm=I=-16:TP=-1.5:LRA=11"
set "AARGS=-c:a aac -b:a %ABR%"
set "AUDIOTXT=标准化 -16 LUFS（AAC %ABR%）"
:UI_AUD_DONE
if defined AARGS goto :UI_PIX
set "AARGS=-c:a copy"
:UI_PIX
if /i "%OPT_PIX%"=="keep" goto :UI_PIX_DONE
set "PIXARG=-pix_fmt %OPT_PIX%"
set "PIXTXT=%OPT_PIX%"
:UI_PIX_DONE
set "TARGETTXT=沿用原始尺寸（不缩放）"
if "%OPT_MAXW%"=="1920" set "TARGETTXT=1080p（长边上限 1920）"
if "%OPT_MAXW%"=="1280" set "TARGETTXT=720p（长边上限 1280）"
goto :EOF

rem ============================================================================
rem  以下 ::PS 开头的是选项窗口的 PowerShell 源码（cmd 当作注释整行跳过）。
rem  运行时由上面的 powershell -Command 抽取执行，不要删、不要改前缀。
rem ============================================================================
::PS Add-Type -AssemblyName System.Windows.Forms
::PS Add-Type -AssemblyName System.Drawing
::PS [System.Windows.Forms.Application]::EnableVisualStyles()
::PS #
::PS # ---------- 主题（高亮统一为中性灰，深/浅两套） ----------
::PS $script:dark = $true
::PS $darkTheme = @{
::PS   Bg='#12161B'; Card='#1C232B'; Line='#2A333D'; Text='#EAF0F5'; Sub='#9DABBA';
::PS   Accent='#A7B3BF'; AccentText='#111A21'; Seg='#252E38'; Hover='#3A4652'; Warn='#C9A47A'
::PS }
::PS $lightTheme = @{
::PS   Bg='#F4F6F8'; Card='#FFFFFF'; Line='#E1E7ED'; Text='#1B2530'; Sub='#69788A';
::PS   Accent='#8B98A6'; AccentText='#FFFFFF'; Seg='#EDF1F5'; Hover='#E2E9F0'; Warn='#A1662A'
::PS }
::PS function C([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
::PS function Get-Theme { if ($script:dark) { return $darkTheme } else { return $lightTheme } }
::PS #
::PS # ---------- 原生互操作：DPI 感知 + 深色标题栏 + 圆角 ----------
::PS $script:nativeOk = $false
::PS try {
::PS   $src = 'using System; using System.Runtime.InteropServices; public static class UiNative { [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s); [DllImport("gdi32.dll")] public static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int hh); [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr o); [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c); [DllImport("user32.dll")] public static extern uint GetDpiForSystem(); [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h); [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr h, int i); [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr d); }'
::PS   try { Add-Type -TypeDefinition $src } catch { }
::PS   if ('UiNative' -as [type]) { $script:nativeOk = $true }
::PS } catch { }
::PS #
::PS # ---------- 高 DPI：按真实 DPI 等比放大布局与字号，避免系统拉伸导致发虚 ----------
::PS $script:scale = 1.0
::PS if ($script:nativeOk) {
::PS   try { [void][UiNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { }
::PS   $d = 96
::PS   try { $d = [int][UiNative]::GetDpiForSystem() } catch {
::PS     try {
::PS       $hdc = [UiNative]::GetDC([IntPtr]::Zero)
::PS       $d = [int][UiNative]::GetDeviceCaps($hdc, 88)
::PS       [void][UiNative]::ReleaseDC([IntPtr]::Zero, $hdc)
::PS     } catch { $d = 96 }
::PS   }
::PS   if ($d -lt 96) { $d = 96 }
::PS   $script:scale = [double]$d / 96.0
::PS }
::PS if ($script:scale -lt 1.0) { $script:scale = 1.0 }
::PS if ($script:scale -gt 2.5) { $script:scale = 2.5 }
::PS # 缩放后不能高过工作区，否则小屏上底部按钮会被截掉
::PS try {
::PS   $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
::PS   $capH = ($wa.Height - 80) / 612.0
::PS   $capW = ($wa.Width - 80) / 568.0
::PS   if ($script:scale -gt $capH) { $script:scale = $capH }
::PS   if ($script:scale -gt $capW) { $script:scale = $capW }
::PS } catch { }
::PS if ($script:scale -lt 1.0) { $script:scale = 1.0 }
::PS function S([int]$v) { return [int][math]::Round($v * $script:scale) }
::PS # 字体用「点」作单位，系统本身会按 DPI 换算成物理像素；这里不能再乘 scale，
::PS # 否则等于放大两次，文字会比按钮还高、被上下裁掉。
::PS function FS([double]$v) { return [single]$v }
::PS function Bounds($ctrl, [int]$x, [int]$y, [int]$w, [int]$h) {
::PS   $ctrl.SetBounds((S $x), (S $y), (S $w), (S $h))
::PS }
::PS function Set-TitleDark([bool]$on) {
::PS   if (-not $script:nativeOk) { return }
::PS   try {
::PS     $h = $f.Handle
::PS     if ($null -eq $h -or $h -eq [IntPtr]::Zero) { return }
::PS     $v = 0; if ($on) { $v = 1 }
::PS     [void][UiNative]::DwmSetWindowAttribute($h, 20, [ref]$v, 4)
::PS     [void][UiNative]::DwmSetWindowAttribute($h, 19, [ref]$v, 4)
::PS   } catch { }
::PS }
::PS function Set-Round($ctrl, [int]$radius) {
::PS   if (-not $script:nativeOk) { return }
::PS   try {
::PS     $hr = [UiNative]::CreateRoundRectRgn(0, 0, $ctrl.Width, $ctrl.Height, (S $radius), (S $radius))
::PS     $ctrl.Region = [System.Drawing.Region]::FromHrgn($hr)
::PS     [void][UiNative]::DeleteObject($hr)
::PS   } catch { }
::PS }
::PS #
::PS # ---------- 窗体 ----------
::PS $f = New-Object System.Windows.Forms.Form
::PS $f.Text = '录屏压缩 - 处理选项  v1.2'
::PS $f.ClientSize = New-Object System.Drawing.Size((S 568), (S 612))
::PS $f.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
::PS $f.StartPosition = 'CenterScreen'
::PS $f.FormBorderStyle = 'FixedDialog'
::PS $f.MaximizeBox = $false
::PS $f.MinimizeBox = $false
::PS $f.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 10))
::PS $f.ForeColor = C((Get-Theme).Text)
::PS $f.BackColor = C((Get-Theme).Bg)
::PS #
::PS $lblTitle = New-Object System.Windows.Forms.Label
::PS $lblTitle.Text = '录屏压缩'
::PS $lblTitle.AutoSize = $false
::PS $lblTitle.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 16), [System.Drawing.FontStyle]::Bold)
::PS Bounds $lblTitle 24 16 320 34
::PS $f.Controls.Add($lblTitle)
::PS #
::PS $lblVer = New-Object System.Windows.Forms.Label
::PS $lblVer.Text = 'v1.2'
::PS $lblVer.AutoSize = $false
::PS $lblVer.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 9))
::PS Bounds $lblVer 130 24 70 20
::PS $f.Controls.Add($lblVer)
::PS $script:hintLabels = @($lblVer)
::PS #
::PS $lblSub = New-Object System.Windows.Forms.Label
::PS $lblSub.Text = '选好处理方式，成品放到 compressed\ 文件夹'
::PS $lblSub.AutoSize = $false
::PS $lblSub.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 9.5))
::PS Bounds $lblSub 24 52 420 22
::PS $f.Controls.Add($lblSub)
::PS #
::PS $btnTheme = New-Object System.Windows.Forms.Button
::PS $btnTheme.Text = '切浅色'
::PS $btnTheme.SetBounds((S 464), (S 20), (S 80), (S 32))
::PS $btnTheme.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
::PS $btnTheme.FlatAppearance.BorderSize = 0
::PS $btnTheme.Cursor = [System.Windows.Forms.Cursors]::Hand
::PS $f.Controls.Add($btnTheme)
::PS #
::PS $line = New-Object System.Windows.Forms.Panel
::PS Bounds $line 24 88 520 1
::PS $f.Controls.Add($line)
::PS #
::PS # ---------- 控件工厂 ----------
::PS $script:cards = @()
::PS $script:groupLabels = @()
::PS $script:segments = @()
::PS $script:roundTargets = @()
::PS #
::PS function New-Card([string]$title, [string]$hint, [int]$y) {
::PS   $p = New-Object System.Windows.Forms.Panel
::PS   Bounds $p 24 $y 520 92
::PS   $f.Controls.Add($p)
::PS   $script:cards += $p
::PS   $l = New-Object System.Windows.Forms.Label
::PS   $l.Text = $title
::PS   $l.AutoSize = $false
::PS   $l.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 10), [System.Drawing.FontStyle]::Bold)
::PS   Bounds $l 16 9 480 22
::PS   $p.Controls.Add($l)
::PS   $script:groupLabels += $l
::PS   $h = New-Object System.Windows.Forms.Label
::PS   $h.Text = $hint
::PS   $h.AutoSize = $false
::PS   $h.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 8.5))
::PS   Bounds $h 16 74 488 18
::PS   $p.Controls.Add($h)
::PS   $script:hintLabels += $h
::PS   return $p
::PS }
::PS function New-Segment($parent, [string]$text, [int]$x, [int]$w, [bool]$on) {
::PS   $r = New-Object System.Windows.Forms.RadioButton
::PS   $r.Text = $text
::PS   $r.Appearance = [System.Windows.Forms.Appearance]::Button
::PS   $r.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
::PS   $r.FlatAppearance.BorderSize = 0
::PS   $r.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
::PS   $r.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 10))
::PS   $r.Checked = $on
::PS   Bounds $r $x 36 $w 34
::PS   $r.Cursor = [System.Windows.Forms.Cursors]::Hand
::PS   $parent.Controls.Add($r)
::PS   $script:segments += $r
::PS   $script:roundTargets += $r
::PS   return $r
::PS }
::PS #
::PS # ---------- 1 画面裁切 ----------
::PS $c1 = New-Card '画面裁切' '不变 = 保留原始比例；16:9 = 从画面中央裁掉多余部分' 100
::PS $rCropNone = New-Segment $c1 '不变' 16 240 $false
::PS $rCrop169  = New-Segment $c1 '16:9 居中剪裁' 264 240 $true
::PS #
::PS # ---------- 2 输出分辨率（短文案，绝不换行） ----------
::PS $c2 = New-Card '输出分辨率' '1080P = 长边上限 1920；720P = 1280；原片更小不会放大' 200
::PS $rResKeep = New-Segment $c2 '沿用' 16 157 $false
::PS $rRes1080 = New-Segment $c2 '1080P' 181 157 $true
::PS $rRes720  = New-Segment $c2 '720P' 346 157 $false
::PS #
::PS # ---------- 3 音频 ----------
::PS $c3 = New-Card '音频' '沿用 = 原样复制音轨；标准化 = -16 LUFS，AAC 128k' 300
::PS $rAudKeep = New-Segment $c3 '沿用' 16 240 $false
::PS $rAudNorm = New-Segment $c3 '标准化' 264 240 $true
::PS #
::PS # ---------- 4 颜色 / 像素格式 ----------
::PS $c4 = New-Card '颜色 / 像素格式' '其它格式仅在明确需要时选' 400
::PS $cmbPix = New-Object System.Windows.Forms.ComboBox
::PS $cmbPix.SetBounds((S 16), (S 36), (S 320), (S 34))
::PS $cmbPix.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
::PS $cmbPix.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
::PS $cmbPix.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 10))
::PS $cmbPix.DrawMode = [System.Windows.Forms.DrawMode]::OwnerDrawFixed
::PS $cmbPix.ItemHeight = (S 26)
::PS $cmbPix.Add_DrawItem({
::PS   param($sender, $e)
::PS   if ($e.Index -lt 0) { return }
::PS   $t = Get-Theme
::PS   $bg = New-Object System.Drawing.SolidBrush (C($t.Seg))
::PS   $fg = New-Object System.Drawing.SolidBrush (C($t.Text))
::PS   $e.Graphics.FillRectangle($bg, $e.Bounds)
::PS   $e.Graphics.DrawString([string]$cmbPix.Items[$e.Index], $cmbPix.Font, $fg,
::PS                          [single]($e.Bounds.Left + (S 6)), [single]($e.Bounds.Top + (S 3)))
::PS   $bg.Dispose(); $fg.Dispose()
::PS })
::PS $cmbPix.Items.AddRange(@('沿用（跟随源文件）','yuv420p（推荐，兼容性最好）','yuv444p','yuv422p','yuvj420p','yuv420p10le','yuv444p10le'))
::PS $cmbPix.SelectedIndex = 1
::PS $c4.Controls.Add($cmbPix)
::PS $pixVals = @('keep','yuv420p','yuv444p','yuv422p','yuvj420p','yuv420p10le','yuv444p10le')
::PS #
::PS # ---------- 底部说明 ----------
::PS $info = New-Object System.Windows.Forms.Label
::PS $info.Text = '固定参数  libx264 / CRF 28 / veryfast / 30fps / +faststart        v1.2'
::PS $info.AutoSize = $false
::PS $info.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 9))
::PS Bounds $info 24 508 520 20
::PS $f.Controls.Add($info)
::PS $script:hintLabels += $info
::PS #
::PS $warn = New-Object System.Windows.Forms.Label
::PS $warn.Text = '4:2:2 / 4:4:4 / 10bit 在微信、浏览器、手机、QuickTime 上可能放不了'
::PS $warn.AutoSize = $false
::PS $warn.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 9))
::PS Bounds $warn 24 530 520 20
::PS $f.Controls.Add($warn)
::PS #
::PS $btnCancel = New-Object System.Windows.Forms.Button
::PS $btnCancel.Text = '取消'
::PS $btnCancel.SetBounds((S 352), (S 558), (S 88), (S 36))
::PS $btnCancel.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
::PS $btnCancel.FlatAppearance.BorderSize = 0
::PS $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
::PS $btnCancel.Cursor = [System.Windows.Forms.Cursors]::Hand
::PS $f.Controls.Add($btnCancel)
::PS $f.CancelButton = $btnCancel
::PS $script:roundTargets += $btnCancel
::PS #
::PS $btnOK = New-Object System.Windows.Forms.Button
::PS $btnOK.Text = '开始压缩'
::PS $btnOK.SetBounds((S 448), (S 558), (S 96), (S 36))
::PS $btnOK.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', (FS 10.5), [System.Drawing.FontStyle]::Bold)
::PS $btnOK.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
::PS $btnOK.FlatAppearance.BorderSize = 0
::PS $btnOK.DialogResult = [System.Windows.Forms.DialogResult]::OK
::PS $btnOK.Cursor = [System.Windows.Forms.Cursors]::Hand
::PS $f.Controls.Add($btnOK)
::PS $f.AcceptButton = $btnOK
::PS $script:roundTargets += $btnOK
::PS $script:roundTargets += $btnTheme
::PS #
::PS # ---------- 换肤 ----------
::PS function Apply-Theme {
::PS   $t = Get-Theme
::PS   $f.BackColor = C($t.Bg)
::PS   $f.ForeColor = C($t.Text)
::PS   foreach ($p in $script:cards) { $p.BackColor = C($t.Card) }
::PS   $line.BackColor = C($t.Line)
::PS   $lblTitle.ForeColor = C($t.Text)
::PS   $lblSub.ForeColor = C($t.Sub)
::PS   foreach ($l in $script:groupLabels) { $l.ForeColor = C($t.Text) }
::PS   foreach ($l in $script:hintLabels) { $l.ForeColor = C($t.Sub) }
::PS   $warn.ForeColor = C($t.Warn)
::PS   foreach ($r in $script:segments) {
::PS     $r.BackColor = C($t.Seg)
::PS     $r.FlatAppearance.CheckedBackColor = C($t.Accent)
::PS     $r.FlatAppearance.MouseOverBackColor = C($t.Hover)
::PS     $r.FlatAppearance.MouseDownBackColor = C($t.Accent)
::PS     if ($r.Checked) { $r.ForeColor = C($t.AccentText) } else { $r.ForeColor = C($t.Sub) }
::PS   }
::PS   $cmbPix.BackColor = C($t.Seg)
::PS   $cmbPix.ForeColor = C($t.Text)
::PS   $btnOK.BackColor = C($t.Accent)
::PS   $btnOK.ForeColor = C($t.AccentText)
::PS   $btnOK.FlatAppearance.MouseOverBackColor = C($t.Accent)
::PS   $btnCancel.BackColor = C($t.Seg)
::PS   $btnCancel.ForeColor = C($t.Sub)
::PS   $btnCancel.FlatAppearance.MouseOverBackColor = C($t.Hover)
::PS   $btnTheme.BackColor = C($t.Seg)
::PS   $btnTheme.ForeColor = C($t.Sub)
::PS   $btnTheme.FlatAppearance.MouseOverBackColor = C($t.Hover)
::PS   if ($script:dark) { $btnTheme.Text = '切浅色' } else { $btnTheme.Text = '切深色' }
::PS   [void]$f.Invalidate()
::PS }
::PS foreach ($r in $script:segments) { $r.Add_CheckedChanged({ Apply-Theme }) }
::PS $btnTheme.Add_Click({ $script:dark = -not $script:dark; Apply-Theme; Set-TitleDark $script:dark })
::PS #
::PS # ---------- 写出选项 ----------
::PS function Write-Options([bool]$cancelled) {
::PS   if ($cancelled) {
::PS     $lines = @('set "OPT_CANCEL=1"')
::PS   } else {
::PS     $crop = 'none'; if ($rCrop169.Checked) { $crop = '169' }
::PS     $maxw = '0'; if ($rRes1080.Checked) { $maxw = '1920' }; if ($rRes720.Checked) { $maxw = '1280' }
::PS     $audio = 'keep'; if ($rAudNorm.Checked) { $audio = 'norm' }
::PS     $pix = $pixVals[$cmbPix.SelectedIndex]
::PS     $lines = @(
::PS       ('set "OPT_CANCEL=0"'),
::PS       ('set "OPT_CROP={0}"' -f $crop),
::PS       ('set "OPT_MAXW={0}"' -f $maxw),
::PS       ('set "OPT_AUDIO={0}"' -f $audio),
::PS       ('set "OPT_PIX={0}"' -f $pix)
::PS     )
::PS   }
::PS   [System.IO.File]::WriteAllLines($env:CMP_OPTS, [string[]]$lines, [System.Text.Encoding]::ASCII)
::PS }
::PS #
::PS foreach ($c in $script:roundTargets) { Set-Round $c 9 }
::PS Apply-Theme
::PS Set-TitleDark $script:dark
::PS $result = $f.ShowDialog()
::PS Write-Options ($result -ne [System.Windows.Forms.DialogResult]::OK)
::PS $f.Dispose()
