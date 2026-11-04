# 贾栾的路书

长期维护的个人运动记录与数据叙事项目：持续更新 Keep 数据，保存真实生活背景，用可浏览的页面呈现习惯与人生阶段的变化。

当前正式前端为 React / Vite 路书。首页滚动展示出发时间、跑步节奏和常跑路线，统计范围为户外跑与室内跑。原始运动记录可从页脚进入。根目录 `dawn-concept.html` 是 Claude Code 制作的《黎明的人》独立概念稿，尚未接入正式构建或自动数据更新。最终标题、视觉和章节仍可迭代。

## 项目入口

| 要做什么 | 先读哪里 |
| --- | --- |
| AI / 人工协作修改 | [AGENTS.md](AGENTS.md)；Claude Code 入口为 [CLAUDE.md](CLAUDE.md) |
| 了解当前进度和下一步 | [PROJECT.md](PROJECT.md) |
| 安装与本地预览 | [LOCAL.md](LOCAL.md) |
| 同步、导入、备份、核验或恢复数据 | [维护手册](docs/MAINTENANCE.md) |
| 补充生活背景 | [叙事档案](docs/STORY.md) |
| 查看代码、设计、规则变更 | [CHANGELOG.md](CHANGELOG.md) |
| 查看数据更新历史 | [数据更新日志](docs/DATA_UPDATES.md) |

## 快速预览

项目 CI 使用 Node.js 22 与 Python 3.12。仅查看现有页面不需要登录 Keep：

```bash
npm ci
npm run dev
```

打开 [正式路书](http://127.0.0.1:4721/)；可直接进入[记录内页](http://127.0.0.1:4721/?view=journal)。开发服务器运行时也可查看[独立概念稿](http://127.0.0.1:4721/dawn-concept.html)。

```bash
npm run build
npm run preview
```

当前没有配置将概念稿作为额外构建入口，生产构建不能视为已经包含新概念稿。

## 数据现状与来源

2026-11-03 的只读基线：2,257 条运动记录，其中跑步（`Run` + `VirtualRun`）1,819 条，范围截至 2026-11-03。这是当时的基线，不应当作永远不变的实时数字；当前状态用下面的命令检查：

```bash
python3 scripts/data_snapshot.py
```

正式链路：`run_page/data.db` → `src/static/activities.json` → 页面及 `public/totals.svg`。原始数据库、GPX 和人工背景分别保存，不用修改导出成绩来修正展示。

已有外部数据库时优先离线导入；需要新增记录时使用 `scripts/sync_keep.sh`。两条路径都会写工作文件，操作前按[维护手册](docs/MAINTENANCE.md)备份并记录前后变化。Keep 非官方接口未来可能变化，现有历史数据应独立保留。

## 版本、备份与发布

2026-11-03 已建立本地 Git，分支为 `main`，初始基线为 `b22f57b`。按用户要求暂不配置远端；线上部署仍未核实。已有 GitHub CI / Pages 配置仅表示具备配置文件，不能证明正在自动部署。

代码版本、原始数据备份、生产发布分别管理。`.env`、SQLite、GPX、TCX、本地导入目录和 `backups/` 不提交；JSON 与页面可能含轨迹，按实际发布范围处理。真实凭据只填本机 `.env` 或环境变量，示例见 [.env.example](.env.example)。

## 来源与许可

同步代码改编自 [yihong0618/running_page](https://github.com/yihong0618/running_page)，保留 MIT 许可与来源说明，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。页面和个人叙事在此基础上独立迭代。
