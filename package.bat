@echo off
echo ================================================================
echo              家庭任务管理系统打包程序 v2.0.1
echo ================================================================
echo.

set VERSION=v2.0.1
set PACKAGE_NAME=家庭任务管理系统_%VERSION%
set TEMP_DIR=%TEMP%\%PACKAGE_NAME%
set OUTPUT_DIR=%~dp0release

echo [1/6] 准备打包环境...
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo [2/6] 复制核心文件...
copy "index.html" "%TEMP_DIR%\"
copy "styles.css" "%TEMP_DIR%\"
copy "script.js" "%TEMP_DIR%\"
copy "server.py" "%TEMP_DIR%\"
copy "start_server.bat" "%TEMP_DIR%\"

echo [3/6] 复制数据文件...
copy "shared_data.json" "%TEMP_DIR%\"

echo [4/6] 复制文档文件...
copy "README.md" "%TEMP_DIR%\"
copy "WIKI.md" "%TEMP_DIR%\"
copy "QUICK_REFERENCE.md" "%TEMP_DIR%\"
copy "VERSION.md" "%TEMP_DIR%\"

echo [5/6] 复制安装程序...
copy "install.bat" "%TEMP_DIR%\"
copy "uninstall.bat" "%TEMP_DIR%\"
copy "package.bat" "%TEMP_DIR%\"
copy "使用说明.txt" "%TEMP_DIR%\"

echo [6/6] 创建说明文件...
(
echo 家庭任务管理系统 %VERSION%
echo ================================
echo.
echo 这是一个简洁清爽的家庭任务管理系统，支持多设备实时同步。
echo.
echo 安装方法：
echo 1. 双击 install.bat 运行安装程序
echo 2. 按照提示完成安装
echo 3. 使用桌面快捷方式启动系统
echo.
echo 直接运行方法：
echo 1. 双击 start_server.bat 启动服务器
echo 2. 在浏览器中访问显示的地址
echo.
echo 卸载方法：
echo 1. 双击安装目录中的 uninstall.bat
echo 2. 确认卸载操作
echo.
echo 系统要求：
echo - Windows 10/11
echo - Python 3.7+
echo - 现代浏览器（Chrome/Firefox/Safari/Edge）
echo.
echo 功能特色：
echo - 简洁清爽的界面设计
echo - 家庭成员协作管理
echo - 任务优先级和状态管理
echo - 日历任务规划和重复功能
echo - 任务完成统计分析
echo - 多设备实时同步
echo.
echo 技术支持：
echo - 详细文档：WIKI.md
echo - 快速参考：QUICK_REFERENCE.md
echo - 使用说明：README.md
echo.
echo 版本：%VERSION%
echo 发布日期：%date%
) > "%TEMP_DIR%\使用说明.txt"

echo.
echo [打包] 创建压缩包...
powershell -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%OUTPUT_DIR%\%PACKAGE_NAME%.zip' -Force"

echo [清理] 删除临时文件...
rmdir /s /q "%TEMP_DIR%"

echo.
echo ================================================================
echo                         打包完成！
echo ================================================================
echo.
echo 输出文件：%OUTPUT_DIR%\%PACKAGE_NAME%.zip
echo 文件大小：
dir "%OUTPUT_DIR%\%PACKAGE_NAME%.zip" | findstr ".zip"
echo.
echo 包含文件：
echo - 核心程序文件（5个）
echo - 数据文件（1个）
echo - 文档文件（4个）
echo - 安装/卸载程序（3个）
echo - 使用说明（1个）
echo.
echo 总计：14个文件
echo.
pause