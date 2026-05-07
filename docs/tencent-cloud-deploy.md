# 腾讯云部署建议

这是 H5 第二阶段版本的部署建议：前端、API 和短链接都由同一个 Node.js 服务提供，数据先存到服务器本地 JSON 文件，适合 MVP 小规模验证。

## 推荐架构

- 腾讯云轻量应用服务器或 CVM：运行 Node.js 服务。
- Nginx：负责 HTTPS、域名访问和反向代理。
- Docker Compose：管理应用进程和数据卷。
- 数据目录：`./data/cards.json`，必须定期备份。

## 上线前准备

1. 准备一个域名，例如 `zuopin.example.com`。
2. 如果服务器在中国大陆地域，先完成域名备案。
3. 在腾讯云控制台把域名解析到服务器公网 IP。
4. 安全组/防火墙只开放 `80`、`443` 和必要的 `22`。
5. 申请 SSL 证书，并准备 Nginx 证书文件。

## 服务器部署步骤

在服务器安装 Git、Docker 和 Docker Compose 后：

```bash
git clone https://github.com/carlyang0/zuoppinmingpian.git
cd zuoppinmingpian
```

编辑 `docker-compose.yml`：

```yaml
BASE_URL: https://你的域名
```

启动服务：

```bash
docker compose up -d --build
```

检查服务：

```bash
curl http://127.0.0.1:8787/api/health
```

## Nginx 配置

复制 `deploy/nginx-zuoppinmingpian.conf.example`，替换：

- `your-domain.com`
- `ssl_certificate`
- `ssl_certificate_key`

然后测试并重载 Nginx：

```bash
nginx -t
systemctl reload nginx
```

## 验证清单

- 打开 `https://你的域名/h5/index.html` 可以进入编辑页。
- 填写作品后点击“发布并生成链接”，返回 `/c/短ID`。
- 手机打开 `/c/短ID` 时只看到作品名片，不显示编辑器。
- 点击“分享”可以看到二维码。
- 访问 `https://你的域名/server/data/cards.json` 应返回 404。
- 访问 `https://你的域名/api/health` 返回 `{"ok":true}`。

## 数据与备份

当前数据存储在服务器 `./data/cards.json`。建议每天备份一次：

```bash
mkdir -p backups
cp data/cards.json "backups/cards-$(date +%F).json"
```

当用户量上来后，建议把 JSON 文件替换为云数据库，并增加账号登录、作品管理、删除名片、访问统计和内容审核能力。

## 当前版本边界

- 没有登录系统，编辑权限保存在发布者浏览器本地。
- 没有内容审核，正式开放前建议加敏感词和投诉入口。
- JSON 文件适合 MVP 验证，不适合大量并发。
- 二维码已改为服务端本地生成，不再依赖海外公开二维码服务。

## 参考文档

- 腾讯云轻量应用服务器防火墙：https://cloud.tencent.cn/document/product/1207/44577
- 腾讯云 Nginx SSL 证书安装：https://cloud.tencent.com/document/product/400/35244
