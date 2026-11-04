<!--
本仓（ZYKJ-1688/new-api-likha）自用 PR 模板，与上游模板并存：
  - 默认自动填充：.github/PULL_REQUEST_TEMPLATE.md（上游，勿改，避免同步上游时冲突）
  - 需要本模板时，在 compare 链接后加 ?template=internal.md 即可
    https://github.com/ZYKJ-1688/new-api-likha/compare/development...<branch>?template=internal.md
-->

## 📝 变更描述 / Description

（做了什么、为什么这样做。若由 AI 辅助生成，请人工精炼后只保留可复核的要点。）

## 🚀 变更类型 / Type of change

- [ ] 🐛 Bug 修复
- [ ] ✨ 新功能
- [ ] ⚡ 性能优化 / 重构
- [ ] 🧪 CI / 发布流水线
- [ ] 📝 文档 / 其他

## 🎯 影响范围 / Scope

- [ ] 后端（`relay/` `controller/` `model/` `service/`）
- [ ] 前端（`web/`）
- [ ] 发布链路（`.github/workflows/`、`Dockerfile`、ops 仓联动）
- [ ] 数据库 schema / 迁移（需说明已验证的数据库）

## 🔗 关联 Issue / Related Issue

- Closes #

## ✅ 验证 / Verification

（写明实际执行的命令与观察到的结果。"构建通过/测试通过"本身不构成有效证明；UI 改动请附截图或录屏。）

- 命令：
- 结果：

涉及以下情况时请补充：

- 数据库行为改动 → 实际跑过的方言与版本（SQLite / MySQL / PostgreSQL）
- 并发或加锁改动 → 并发场景下的实际表现
- `relaykit/` 或 `tokenkit/` 改动 → `GOWORK=off go build ./...` 结果

## 🚢 发布影响 / Release impact

- [ ] 合并到 `development` 后 `dev-build` 会构建镜像并回写 ops 仓 `jkt-dev`（预期行为）
- [ ] 仅文档 / workflow 语法改动，无需部署
- 需要同步的 ops 仓改动（若有）：

## ⏪ 回滚方案 / Rollback

（ops 仓 `git revert` 即可回退镜像 tag / 配置；或说明其他回滚路径。）

## ☑️ 提交前检查 / Checklist

- [ ] 已人工审阅并精炼本描述，未直接粘贴未经过滤的大段 AI 文本
- [ ] 改动聚焦，未夹带无关修改
- [ ] 无敏感凭据、token、内网地址
- [ ] 本地验证通过，且已在描述中写明命令与结果
- [ ] CI 绿（含 merge queue 的 `merge_group` 检查）
