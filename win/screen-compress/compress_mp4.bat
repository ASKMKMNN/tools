@echo off
rem ============================================================================
rem  批量裁切 + 压缩 MP4 脚本（通用版，不用管源分辨率）
rem  作用：任意尺寸的录屏 -> 居中裁成 16:9 -> 缩到 1080p 上限 -> 压缩体积 -> 音量标准化
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
echo  目标输出 : %TARGETTXT%
echo  滤镜规则 : %VF%
echo  编码参数 : libx264   CRF=%CRF%   PRESET=%PRESET%   FPS=%FPS%   音频=%ABR%
echo  音量处理 : NORM=%NORM%（on = 统一到 -16 LUFS / off = 保持原音量）
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
"%FFMPEG%" -hide_banner -nostdin -loglevel %LOGLEVEL% -stats -y -i "%SRC%" -map 0:v:0 -map 0:a? -sn -dn -vf "%VF%" %AF% -c:v libx264 -preset %PRESET% -crf %CRF% -pix_fmt yuv420p -r %FPS% -c:a aac -b:a %ABR% -movflags +faststart -f mp4 "%TMP%"
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
