@echo off
echo ================================================================
echo              家庭任务管理系统安装程序 v2.0.0
echo ================================================================
echo.

REM 检查Python是否已安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Python环境！
    echo.
    echo 请先安装Python 3.7或更高版本：
    echo 下载地址：https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [信息] Python环境检测通过
python --version

echo.
echo [1/4] 创建安装目录...
set INSTALL_DIR=%USERPROFILE%\家庭任务管理系统
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
)

echo [2/4] 复制程序文件...
copy "index.html" "%INSTALL_DIR%\"
copy "styles.css" "%INSTALL_DIR%\"
copy "script.js" "%INSTALL_DIR%\"
copy "server.py" "%INSTALL_DIR%\"
copy "README.md" "%INSTALL_DIR%\"
copy "WIKI.md" "%INSTALL_DIR%\"
copy "QUICK_REFERENCE.md" "%INSTALL_DIR%\"

echo [3/4] 创建桌面快捷方式...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\家庭任务管理系统.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\启动系统.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = 'shell32.dll,21'; $Shortcut.Description = '家庭任务管理系统 - 简洁清爽的多设备协作工具'; $Shortcut.Save()"

echo [4/4] 创建启动脚本...
(
echo @echo off
echo title 家庭任务管理系统 v2.0.0
echo echo ================================================
echo echo     家庭任务管理系统 - 多设备协作版
echo echo ================================================
echo echo.
echo echo 正在启动服务器...
echo echo.
echo cd /d "%%~dp0"
echo python server.py
echo.
echo echo 服务器已停止，按任意键退出...
echo pause ^>nul
) > "%INSTALL_DIR%\启动系统.bat"

echo.
echo ================================================================
echo                         安装完成！
echo ================================================================
echo.
echo 安装目录：%INSTALL_DIR%
echo 桌面快捷方式：家庭任务管理系统.lnk
echo.
echo 使用方法：
echo 1. 双击桌面快捷方式启动系统
echo 2. 在浏览器中访问显示的地址
echo 3. 其他设备使用显示的IP地址访问
echo.
echo 详细说明请查看安装目录中的文档文件
echo.
pause