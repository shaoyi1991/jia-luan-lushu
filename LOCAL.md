# 本地运行

当前状态见 [PROJECT.md](PROJECT.md)；同步和导入的完整步骤见 [维护手册](docs/MAINTENANCE.md)。本文件只负责启动与预览，避免维护两套更新流程。

## 正式前端

```bash
npm ci
npm run dev
```

打开 [http://127.0.0.1:4721/](http://127.0.0.1:4721/)。首页可直接向下滚动浏览。明细在页脚，也可直接打开 [记录内页](http://127.0.0.1:4721/?view=journal)。

前端从 `src/static/activities.json` 读取导出，默认只统计 `Run` 与 `VirtualRun`。当前已有真实数据，不是空模板。地图使用 `summary_polyline`；截至 2026-11-03 盘点，本目录没有 GPX 实体文件。

## 独立概念稿

开发服务器运行时，打开 [黎明的人](http://127.0.0.1:4721/dawn-concept.html)。它目前内嵌一份独立统计快照，尚未与正式前端统一；不会随 `activities.json` 自动更新，也未配置为生产构建入口。

## 构建结果预览

```bash
npm run build
npm run preview
```

同样使用 4721 端口；先结束占用该端口的开发服务器，再启动预览。构建产物在 `dist/`，只生成本地产物，不表示已经发布。

## 只读数据核对

```bash
python3 scripts/data_snapshot.py
```

只用 Python 标准库，不登录 Keep、不修改数据。要更新数据时，先按维护手册备份，再选择同步或离线导入，并追加数据更新日志。
