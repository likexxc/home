#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单的HTTP服务器，支持跨设备实时数据同步
"""
import http.server
import socketserver
import json
import os
import urllib.parse
import threading
import time
from datetime import datetime
from queue import Queue

# 全局变量
connected_clients = []
data_update_queue = Queue()
data_lock = threading.Lock()

class SharedDataHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.data_file = 'shared_data.json'
        super().__init__(*args, **kwargs)
    
    def log_error(self, format, *args):
        # 忽略连接中断错误，减少日志噪音
        if 'ConnectionAbortedError' not in str(args):
            super().log_error(format, *args)
    
    def do_GET(self):
        try:
            if self.path.startswith('/api/data'):
                self.handle_get_data()
            elif self.path.startswith('/api/events'):
                self.handle_sse_connection()
            else:
                super().do_GET()
        except (ConnectionAbortedError, BrokenPipeError):
            # 客户端断开连接，静默处理
            pass
    
    def do_POST(self):
        try:
            if self.path.startswith('/api/data'):
                self.handle_save_data()
            else:
                self.send_error(404)
        except (ConnectionAbortedError, BrokenPipeError):
            pass
    
    def handle_get_data(self):
        try:
            with data_lock:
                if os.path.exists(self.data_file):
                    with open(self.data_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    data = {
                        'familyMembers': [],
                        'familyTasks': [],
                        'lastUpdated': datetime.now().isoformat()
                    }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            
            response = json.dumps(data, ensure_ascii=False, indent=2)
            self.wfile.write(response.encode('utf-8'))
            
        except Exception as e:
            if not isinstance(e, (ConnectionAbortedError, BrokenPipeError)):
                self.send_error(500, f'服务器错误: {str(e)}')
    
    def handle_save_data(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # 添加更新时间戳
            data['lastUpdated'] = datetime.now().isoformat()
            
            with data_lock:
                with open(self.data_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 通知所有连接的客户端有数据更新
            self.broadcast_update(data)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            
            response = json.dumps({'success': True, 'message': '数据保存成功', 'timestamp': data['lastUpdated']}, ensure_ascii=False)
            self.wfile.write(response.encode('utf-8'))
            
        except Exception as e:
            if not isinstance(e, (ConnectionAbortedError, BrokenPipeError)):
                self.send_error(500, f'保存失败: {str(e)}')
    
    def handle_sse_connection(self):
        """处理Server-Sent Events连接 - 简化版本"""
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Headers', 'Cache-Control')
            self.end_headers()
            
            # 发送连接确认
            message = 'data: {"type": "connected", "message": "连接成功"}\n\n'
            self.wfile.write(message.encode('utf-8'))
            self.wfile.flush()
            
            # 将客户端连接添加到列表
            client = {
                'handler': self,
                'connected_at': datetime.now()
            }
            connected_clients.append(client)
            
            # 简化的保持连接机制
            try:
                while True:
                    # 发送心跳，间隔更长以减少网络开销
                    heartbeat = 'data: {"type": "heartbeat"}\n\n'
                    self.wfile.write(heartbeat.encode('utf-8'))
                    self.wfile.flush()
                    time.sleep(60)  # 60秒心跳
            except (ConnectionAbortedError, BrokenPipeError, OSError):
                # 客户端断开连接
                if client in connected_clients:
                    connected_clients.remove(client)
        except (ConnectionAbortedError, BrokenPipeError, OSError):
            # 静默处理连接错误
            pass
    
    def broadcast_update(self, data):
        """向所有连接的客户端广播数据更新"""
        if not connected_clients:
            return
            
        message = json.dumps({
            'type': 'data_update',
            'data': data
        }, ensure_ascii=False)
        
        # 移除已断开的连接
        disconnected_clients = []
        
        for client in connected_clients[:]:
            try:
                sse_data = f'data: {message}\n\n'
                client['handler'].wfile.write(sse_data.encode('utf-8'))
                client['handler'].wfile.flush()
            except (ConnectionAbortedError, BrokenPipeError, OSError):
                disconnected_clients.append(client)
        
        # 清理断开的连接
        for client in disconnected_clients:
            if client in connected_clients:
                connected_clients.remove(client)
    
    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
        except (ConnectionAbortedError, BrokenPipeError):
            pass

def get_local_ip():
    import socket
    try:
        # 连接到一个外部地址来获取本地IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

if __name__ == "__main__":
    PORT = 8080
    local_ip = get_local_ip()
    
    with socketserver.TCPServer(("", PORT), SharedDataHandler) as httpd:
        print(f"🌐 家庭任务管理系统服务器已启动")
        print(f"📱 本设备访问: http://localhost:{PORT}")
        print(f"🔗 其他设备访问: http://{local_ip}:{PORT}")
        print(f"📡 数据API: http://{local_ip}:{PORT}/api/data")
        print(f"⚡ 实时同步: http://{local_ip}:{PORT}/api/events")
        print("按 Ctrl+C 停止服务器")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n✅ 服务器已停止")