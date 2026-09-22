#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微网通联 Logo 下载审计服务
- 提供静态资源托管
- 提供 /api/client-info 接口 (返回公网/客户端出口 IP、User-Agent 等)
- 提供 /api/log-download 接口 (记录下载日志到 download_audit.log)
- 启动命令: python3 server.py [端口号，默认 8080]
"""

import http.server
import socketserver
import json
import urllib.parse
import os
import datetime
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
LOG_FILE = "download_audit.log"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_client_ip(handler):
    """从请求头提取客户端出口 IP，支持反向代理头 (X-Forwarded-For / X-Real-IP)"""
    forwarded = handler.headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip()
    real_ip = handler.headers.get('X-Real-IP')
    if real_ip:
        return real_ip.strip()
    return handler.client_address[0]

class AuditHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 接口: 获取客户端网络与环境信息
        if parsed.path == "/api/client-info":
            client_ip = get_client_ip(self)
            user_agent = self.headers.get('User-Agent', 'Unknown')
            data = {
                "client_ip": client_ip,
                "user_agent": user_agent,
                "server_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            return
            
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 接口: 记录下载合规审计日志
        if parsed.path == "/api/log-download":
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8', errors='ignore')
            client_ip = get_client_ip(self)
            ua = self.headers.get('User-Agent', 'Unknown')
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            payload = {}
            try:
                payload = json.loads(body) if body else {}
            except Exception:
                pass
                
            filename = payload.get('file', 'Unknown')
            local_ip = payload.get('local_ip', '浏览器安全限制未暴露')
            public_ip = payload.get('public_ip') or client_ip
            user_declared = payload.get('user', '匿名')
            screen = payload.get('screen', 'Unknown')
            platform = payload.get('platform', 'Unknown')
            
            # 构建日志条目 (含说明 Mac 地址为何受沙箱保护)
            log_entry = (
                f"[{now_str}] DOWNLOAD_AUDIT | "
                f"文件: {filename} | "
                f"出口/公网IP: {public_ip} | "
                f"内网IP探测: {local_ip} | "
                f"MAC地址: [浏览器沙箱阻止采集] | "
                f"平台: {platform} | "
                f"分辨率: {screen} | "
                f"User-Agent: {ua}\n"
            )
            
            # 追加写日志
            log_path = os.path.join(BASE_DIR, LOG_FILE)
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(log_entry)
                print(f"[AUDIT LOG] {log_entry.strip()}")
            except Exception as e:
                print(f"[ERROR writing log] {e}")

            resp = {"status": "ok", "recorded_at": now_str}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode('utf-8'))
            return
            
        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), AuditHandler) as httpd:
        print(f"==================================================")
        print(f"微网通联 Logo 资源站 (带审计日志) 已启动!")
        print(f"服务地址: http://localhost:{PORT}")
        print(f"审计日志路径: {os.path.join(BASE_DIR, LOG_FILE)}")
        print(f"按 Ctrl+C 停止服务")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已平稳停止。")
