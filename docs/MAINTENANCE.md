# 数据更新与长期维护

本手册记录现有能力和操作顺序。制定于 2026-11-03；未来接手时先检查脚本、依赖和 Keep 接口是否变化。命令在项目根目录执行。

## 1. 先辨认三条内容链

```text
Keep / 外部 SQLite + GPX
  → run_page/data.db（工作副本）
  → src/static/activities.json（正式前端数据）
  → src/lib/stats.ts / 页面 / public/totals.svg

用户确认的生活经历 → docs/STORY.md → 构建时读取标记为“页面展示：是”的故事 → 页面叙事

dawn-concept.html → 设计参考（内嵌快照，不会随上述数据自动更新）
```

导入器会复制源库到工作副本，写出 JSON 和 SVG；源库本身只读打开。源库与工作副本是同一个文件时不重复复制。GPX 以符号链接接入，不等于已复制备份。

## 2. 环境准备

CI 当前使用 Python 3.12、Node.js 22；优先使用已验证环境，不因时间过去就批量升级依赖。

```bash
python3 --version
node --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
```

若已有可用虚拟环境，只激活即可。Python 依赖目前不是完整锁定版本；长期更新先验证兼容性。`npm ci` 使用已有 `package-lock.json`，不能悄悄重写锁文件。

只读检查当前导出不需要安装上述依赖：

```bash
python3 scripts/data_snapshot.py
```

输出包含来源 SHA-256、数据截至日期、类型条数、跑步里程与连续天数；它不请求 Keep，也不写源文件。它不判定跨设备重复、不验证轨迹质量、不证明记录在 Keep 中完整。

## 3. 每次同步/导入前备份

停止其他同步、导入和数据库写入。先保存代码/叙事的工作版本；若已经启用 Git，检查工作区，避免覆盖别人的修改。原始数据另行备份，Git 不能替代它。

以下命令建立本地数据备份，不包含 `.env`；GPX / TCX 链接会复制实际内容。若有失效链接导致失败，先找回源文件再继续。

```bash
export RUN_BACKUP="backups/$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)"
python3 - <<'PY'
import os
from pathlib import Path
import shutil
import sqlite3

target = Path(os.environ['RUN_BACKUP'])
target.mkdir(parents=True, exist_ok=False)
db = Path('run_page/data.db')
if db.exists():
    (target / 'run_page').mkdir()
    with sqlite3.connect(db.resolve().as_uri() + '?mode=ro', uri=True) as src:
        with sqlite3.connect(target / 'run_page/data.db') as dst:
            src.backup(dst)
for name in ['src/static/activities.json', 'public/totals.svg', 'docs/STORY.md']:
    source = Path(name)
    if source.exists():
        dest = target / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
for name in ['GPX_OUT', 'TCX_OUT']:
    if Path(name).exists():
        shutil.copytree(name, target / name, symlinks=False)
print(target.resolve())
PY
python3 scripts/data_snapshot.py > "$RUN_BACKUP/before.json"
```

快照失败时先排查，不把空数据或损坏文件当作正常基线继续覆盖。`backups/` 只是同机恢复点；重要原始数据还需保存到用户选择的外部介质或私有备份位置，确认能实际读取后再视为完成备份。

## 4. 选择一种更新来源

### A. 已有其他机器同步好的数据库

优先使用 CLI 显式参数，避免误选旧 `import/` 库。先只读预检，再导入：

```bash
python3 run_page/import_dump.py --db /absolute/path/activities.db --dry-run
python3 run_page/import_dump.py --db /absolute/path/activities.db
```

有轨迹文件则两条命令都加 `--gpx /absolute/path/GPX_OUT`。只有本地工作库需要重新导出时，显式使用 `--db run_page/data.db`。

注意：这是替换工作副本及导出，**不是两个库的增量合并**。若新库只有部分历史，先停下来核对，不能覆盖完整档案。

### B. 从 Keep 同步

激活虚拟环境，凭据以环境变量 `KEEP_MOBILE`、`KEEP_PASSWORD` 或根目录 `.env` 提供。不要把值放进命令参数、截图和日志。然后运行：

```bash
./scripts/sync_keep.sh
```

脚本读取 `.env`，请求 running / cycling / hiking 历史列表，按已有 ID 跳过已存记录，下载可用 GPX，写数据库、JSON 与累计海报。已存记录通常不重新下载，不能用它修复旧记录或保证发现上游删除。

`npm run sync` 当前只运行 Python 同步程序，不等同于上面完整流程：不会由 shell 加载 `.env`，也不生成海报。维护时优先用上面的脚本。

Keep 使用非官方接口，不能保证几年后仍可用。本轮没有进行线上登录或同步验证。若认证/接口失败，保留现有数据，检查失败类型；不要先删库或盲目从头重拉。部分请求失败也可能留下部分新增数据，退出状态为零不能代替完整性核对。

### 轨迹显示设置

现有导出支持 `IGNORE_START_END_RANGE` 等环境变量。离线导入器不会自动加载 `.env`；若需要一致的轨迹裁剪，应显式设置并在数据更新日志记录配置。原始 GPX 与导出的轨迹不是同一个隐私范围，不能假设裁剪后的页面意味着 GPX 已裁剪。

## 5. 更新后核对

```bash
python3 scripts/data_snapshot.py > "$RUN_BACKUP/after.json"
```

- 比较前后条数、运动类型、起止日期、跑步里程、轨迹覆盖数和最长连续；解释所有减少或异常跳变。
- 比较字符串 `run_id` 集合，尤其检查历史记录是否丢失。相同 ID 的距离、类型、时间发生变化也要说明。
- 抽查最早记录、最近新增、一个跨年节点和一条特殊长距离记录。
- 若新增去重规则，保留原始记录，并记录版本、候选/保留/排除 ID 及理由。不能按同一天简单去重。
- 各年份、运动类型的分项应与总体对得上；页面、图表、海报的口径一致。
- Keep 的全运动导出 `streak` 不能直接用作连续跑步指标。地点覆盖按真实标签分类，不把省/州全称作“城市”。

可用下面的只读对比快速定位历史内容变化：

```bash
python3 - <<'PY'
import json, os
from pathlib import Path
before = json.loads((Path(os.environ['RUN_BACKUP']) / 'src/static/activities.json').read_text())
after = json.loads(Path('src/static/activities.json').read_text())
a = {r['run_id']: r for r in before}
b = {r['run_id']: r for r in after}
fields = ('distance', 'type', 'start_date_local', 'moving_time', 'elapsed_time')
changed = [k for k in a.keys() & b.keys() if any(a[k].get(f) != b[k].get(f) for f in fields)]
print('新增 ID', sorted(b.keys() - a.keys()))
print('丢失 ID', sorted(a.keys() - b.keys()))
print('核心字段变化 ID', sorted(changed))
PY
```

将结果摘要追加到 [DATA_UPDATES.md](DATA_UPDATES.md)。检查失败则记录“失败/部分完成”，不要写成“同步成功”。本地日志可保存完整输出，但对外日志不要包含凭据或精确位置。

## 6. 同步页面与人工背景

正式 React 页面使用新的 JSON；生产站点还需要重新构建并按实际托管方式发布。仅更新本地文件不会刷新已部署页面。

当前 `dawn-concept.html` 内嵌数据，不会自动刷新；这是下一轮需处理的维护缺口，不能每次靠手改两份统计长期维持。

核对新数据是否影响叙事中的“最高”“首次”“最近”“连续”等结论；用数据截至日期代替固定的“本周”“九天前”。已有历史事件保留，不随最新成绩改写。新生活背景写入 `STORY.md`，再更新对应页面。

## 7. 验证与记录

按改动范围运行；只改文档不必安装依赖和跑整套构建：

```bash
python -m unittest discover -s tests -v
node --experimental-strip-types --test tests/stats.test.ts
npm test
npm run build
```

当前 CI 使用以上测试方式。页面变更还要实际检查桌面、手机、详情查看、年份切换、空/缺失数据与减少动效。构建通过不代表这些已验收。

- 数据操作 → `docs/DATA_UPDATES.md`。
- 代码、设计、口径、规则或叙事改动 → `CHANGELOG.md`。
- 当前阶段、入口与下一步改变 → `PROJECT.md`。
- 正式发布时记录代码版本（若有）、数据快照、页面地址、发布日期和线上回读结果。

## 8. 恢复与发布

更新异常时先停止继续写入，保留失败后的文件供排查。从选定备份恢复 `run_page/data.db`、`src/static/activities.json`、`public/totals.svg`；若修改了轨迹资产，恢复配套的 GPX / TCX。不要用删除全部历史再重拉替代恢复。用备份 JSON 的 SHA-256 和快照检查恢复结果；SQLite 通过 backup API 复制后文件哈希不一定相同，应核对内容。

发布沿用用户确认的托管入口。仓库现有 `.github/workflows/pages.yml` 会在 `main` 推送或手动触发时构建并部署，且不登录 Keep。建立远端前确认实际托管方式与数据公开范围，不能因为 workflow 存在就假定线上已更新。原始资产备份、Git 版本和发布产物分别维护。

## 9. 新旧叙事页并行预览

运行 `npm run dev` 后，`/` 是原版首页，`/new.html` 是新版试读，`/?view=journal` 是共用运动档案。运行 `npm run build` 会同时生成两个 HTML 入口，生产预览按既有 `VITE_BASE` 配置。

新版图表使用同一份活动导出。目标从 2024 年 11 月生效，进行中的月份不计入达成率。育儿局部图、两次东营赛前 56 天、2021/2025/2026 的同期比较是固定历史窗口。新增数据会更新累计、年度和月度进度。需要修订回忆时，在 [STORY.md](STORY.md) 的公开事件内写新版字段，旧版字段继续服务原版。

维护滚动场景时，先检查完整静态图，再检查开始、过渡和定格画面。可见场景只自动播放一轮，检查重播入口与暂停后完整定格；重新滚入不自动循环。检查窄屏、暂停动效和系统减少动效，并从轨迹卡打开原始记录。
