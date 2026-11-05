# Life Log · App

读写 `life-log` 数据仓库的网页前端（PWA）。纯静态、无后端：浏览器直接用你自己的 GitHub 令牌读写仓库里的 Markdown。网页本身不包含任何日记数据。

## 四个页面

| 页面 | 做什么 | 写到哪 |
|---|---|---|
| 今天 | 情绪 / 精力打分、日记、速记（可翻到任意一天） | `days/YYYY/YYYY-MM-DD.md` |
| 待办 | 现在 / 之后 / 完成，勾选、移动、删除 | `todo.md` |
| 思想 | 卡片列表与编辑；速记旁的 ↗ 可一键提炼 | `thoughts/<标题>.md` |
| 回看 | 年度热力图、近 30 天曲线、全文搜索、复盘、我是谁 | 只读（`me.md` 可编辑） |

底部的速记框在任何页面都能用（桌面按 `/` 聚焦）：回车记入今天；以 `[]` 开头则加入待办。

## 同步是怎么做的

每次修改都是一个**可重放的操作**（追加一条速记、把 mood 设为 7、勾选某条待办……），先存进本机队列，再在联网时：取远端最新版本 → 重放 → 提交。所以：

- **离线可记**：没网时照常写，联网（或回到页面）后自动提交。
- **多设备不覆盖**：手机和电脑同时改同一天，两边的内容都会保留。
- 内容按 git sha 缓存在 IndexedDB，打开即显示，只下载变化的文件。

## 部署到 GitHub Pages

免费账号的 Pages 需要公开仓库，而你的数据仓库应保持私有，所以把 app 放进一个**单独的公开仓库**（里面只有代码，没有任何记录）：

1. 在 GitHub 新建公开仓库，例如 `life-log-app`。
2. 把本目录 `app/` 下的所有文件（含 `.github/`）放到新仓库根目录，推送到 `main`。
3. 新仓库 → Settings → Pages → Source 选 **GitHub Actions**。
4. 推送后约 1 分钟，访问 `https://<用户名>.github.io/life-log-app/`。

## 首次使用

1. 打开 [新建 fine-grained token](https://github.com/settings/personal-access-tokens/new)：
   - Repository access → **Only select repositories** → 选 `life-log`
   - Permissions → Repository → **Contents: Read and write**
   - 过期时间按需设置（过期后在「回看 → 设置」里换新的即可）
2. 打开网页，填用户名、仓库名 `life-log`、令牌。令牌只存在这台设备的浏览器里。
3. 手机上：Safari 分享 → **添加到主屏幕**（Android Chrome：菜单 → 安装应用），之后就像原生 App 一样全屏打开。

## 开发

```bash
npm install
npm run dev        # 本地开发
npm test           # Markdown 解析单元测试（会读取仓库里的真实文件）
npm run build
npm run e2e        # 端到端测试：真实浏览器 + 内存版假 GitHub（需全局安装 playwright）
npm run e2e -- --shots   # 同时生成亮/暗、桌面/手机截图到 tests/shots/
```

代码结构：`src/lib/md.ts`（Markdown 约定的纯函数读写）、`src/lib/store.ts`（操作队列与同步）、`src/lib/github.ts`（四个 REST 端点）、`src/views/*`（各页面）。
