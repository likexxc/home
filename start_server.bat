@echo off
chcp 65001 >nul
title 家庭任务管理系统 v2.0.0
color 0B

echo ================================================================
echo              家庭任务管理系统 - 多设备协作版
echo                        v2.0.0
echo ================================================================
echo.
echo 特色功能：
echo  ✓ 简洁清爽的界面设计
echo  ✓ 家庭成员协作管理  
echo  ✓ 任务优先级管理
echo  ✓ 日历任务规划
echo  ✓ 多设备实时同步
echo  ✓ 任务统计分析
echo.
echo 正在启动服务器...
echo.

REM 检查Python环境
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Python环境！
    echo 请先安装Python 3.7+：https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM 检查当前目录文件
if not exist "server.py" (
    echo [错误] 未找到server.py文件！
    echo 请确保在正确的目录中运行此脚本
    echo.
    pause
    exit /b 1
)

REM 启动服务器
cd /d "%~dp0"
python server.py

echo.
echo 服务器已停止
echo 按任意键退出...
pause >nul