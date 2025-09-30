@echo off
echo ================================================================
echo              家庭任务管理系统卸载程序 v2.0.0
echo ================================================================
echo.

set INSTALL_DIR=%USERPROFILE%\家庭任务管理系统
set DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\家庭任务管理系统.lnk

echo 即将删除以下内容：
echo - 安装目录：%INSTALL_DIR%
echo - 桌面快捷方式：%DESKTOP_SHORTCUT%
echo.
echo 注意：这将删除所有数据文件（包括任务和成员数据）！
echo.
set /p confirm=确定要卸载吗？(y/N): 
if /i not "%confirm%"=="y" (
    echo 卸载已取消
    pause
    exit /b 0
)

echo.
echo [1/3] 删除桌面快捷方式...
if exist "%DESKTOP_SHORTCUT%" (
    del "%DESKTOP_SHORTCUT%"
    echo 桌面快捷方式已删除
) else (
    echo 未找到桌面快捷方式
)

echo [2/3] 删除安装目录...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
    echo 安装目录已删除
) else (
    echo 未找到安装目录
)

echo [3/3] 清理完成
echo.
echo ================================================================
echo                      卸载完成！
echo ================================================================
echo.
echo 家庭任务管理系统已从您的计算机中移除
echo 感谢您的使用！
echo.
pause