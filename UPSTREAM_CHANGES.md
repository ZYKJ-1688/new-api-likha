# UPSTREAM_CHANGES.md — 我们对上游的定制清单

- 本仓库是 [`QuantumNous/new-api`](https://github.com/QuantumNous/new-api) 的二次开发分支
 （fork 至 `ZYKJ-1688/new-api-likha`）
- 本文件**逐条登记**我们改过上游的哪些文件、为什么改
- 对应哪次提交/PR，**每次同步上游（sync fork）前必须对照本清单逐条检查冲突点**

- 维护规则见 §「二次开发纪律」。**新增任何上游文件改动，必须同步在本表追加一行**，并在 `likha/ops/patches/` 下附可复现补丁 

---


## 二次开发纪律（全仓库适用）

> 本纪律与 `likha/docs/git开发-发布-值班规范.md §4.3「二次开发隔离原则」**同源**——
> 规范文档是**执行细则**（分支模型 / 发布流程 / 值班），本文件是**定制清单**（改了什么）。
> 二者口径必须一致：任何一条纪律变更，两处同时改（见本仓「口径同源连带扫」约定）。

1. **能扩展不改源码**：优先用插件 / hook / 配置覆盖方式实现定制，其次才是直接修改上游文件。
2. **定制清单**：仓库根目录维护 `UPSTREAM_CHANGES.md`，逐条记录「我们改了上游哪些文件、为什么、
   对应我们仓库的 PR 号」。**每次 sync 前对照该清单检查冲突点。**
3. **本地定制集中存放**：自研代码放独立目录 / 包（`likha/{code,ops,docs}`），与上游目录**物理隔离**。
4. **禁止无意义的格式化改动上游文件**（一次格式化 = 永久冲突源）。
5. **merge 冲突解决后必须跑全量测试**；sync PR 的 CI **不允许 skip 任何 job**。

### 同步上游的标准流程

```bash
# 1) 拉上游（本仓库 origin = fork；上游为 QuantumNous/new-api，需另配 upstream remote）
git fetch upstream
git checkout -b sync/upstream-$(date +%Y%m%d) origin/main

# 2) ★ 先跑定制项在位检查（对照本清单机械校验，见 verify 脚本）
bash likha/ops/verify-upstream-changes.sh

# 3) merge（有冲突则解决；本清单所列文件是**唯一预期冲突源**）
git merge upstream/main

# 4) 冲突解决后：重跑 verify + 全量测试（CI 不得 skip 任何 job）
bash likha/ops/verify-upstream-changes.sh
go run ./likha/code/cmd/logms-check   # 运行时证据，期望 RESULT=MS_CONFIRMED
make test && go vet ./... && go build ./...

# 5) 提 sync PR，CI 全绿后合并；更新本清单「我们的提交/PR」列
```

---

## 相关文档

- 自研目录说明：`likha/README.md`
- 复现补丁：`likha/ops/patches/`
- 在位校验脚本（静态）：`likha/ops/verify-upstream-changes.sh`
- 运行时自检（动态，期望 `RESULT=MS_CONFIRMED`）：`go run ./likha/code/cmd/logms-check`
- 部署侧背景（SLS 毫秒落地）：`deploy/docs/Day3任务26_SLS与可观测_执行报告.md`
