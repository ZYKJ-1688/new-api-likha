# deploy/gitops —— GitOps 开发流水线（说明文档）

本目录**只有这份说明**，没有脚本，也没有 manifest：

- **部署清单**的真源在私有仓 [`ZYKJ-1688/new-api-likha-ops`](https://github.com/ZYKJ-1688/new-api-likha-ops)
- **运维脚本**（装 ArgoCD / 注入凭据 / 验收体检）也在那个仓的 `argocd/bootstrap/`

> **为什么脚本不放在本仓**：本仓是 **public** 仓库，而 bootstrap 脚本里有集群 ID、
> 节点选取逻辑、ALB/证书细节、`--insecure` 之类的实现。放进私有 ops 仓：
> 团队共享 + 有版本管理，又不对公网暴露。本文件只留「链路怎么走、红线是什么」。

## 链路

```
push development
  → .github/workflows/dev-build.yml
      ├─ 构建镜像 → 推 ACR   newapi-dev/newapi-likha:dev-<yyyymmdd>-<sha7>
      └─ 回写 ops 仓         overlays/jkt-dev/kustomization.yaml 的 images.digest
  → ArgoCD（ACK 雅加达 dev 集群，Application `jkt-dev`）≤3 min 拉取
  → 滚动发布 newapi-dev 命名空间
  → 线上 /api/status 的 version = 本次 CI 的 tag
```

CI **不碰集群**（没有 kubeconfig），集群**不碰镜像构建**（没有 ACR 密码）。两边只通过
「Git 里的一次 commit」耦合。

## 现状（2026-10-27）

| 项 | 状态 |
|---|---|
| 集群 | ACK 雅加达 `cb0abf5bc06034f7bbdb991752f6f3e62`（`ap-southeast-5`） |
| 命名空间 | `newapi-dev`（与测试仓 `new-api-yxw` **共用**同一批资源对象名） |
| ArgoCD | v3.5.6，`argocd` ns，UI `https://argocd.likha.hk` |
| Application | `jkt-dev` → `ZYKJ-1688/new-api-likha-ops` / `overlays/jkt-dev` |
| 域名 | `dev.likha.hk`（复用，未新增） |
| 镜像 | 马尼拉 ACR EE `newapi-dev/newapi-likha`（跨区公网拉取，SA 免密） |
| Secret | `new-api-secrets` 手工注入，**不在 GitOps 范围** |
| 同步策略 | `selfHeal=true` / `prune=false`（手工改集群 ≤3 min 被打回；孤儿资源暂不清理） |

## 日常

```bash
# 发版：只做这一件事
git switch development && git pull --ff-only
# ...改代码 → PR → 合并回 development → 等 8 分钟

# 验收（任何时间，脚本在 ops 仓）
cd ../new-api-likha-ops && bash argocd/bootstrap/verify-e2e.sh

# 回滚（<3 min）
cd ../new-api-likha-ops && git revert <bump commit> && git push
```

## 红线

1. **不要在集群里 `kubectl set image` 改 `new-api-dev*`** —— `selfHeal` 已开，≤3 min 被打回。
   手工止血请改 Git（revert commit），别直接改集群。
2. `Secret new-api-secrets` 不进 Git，轮换走运维脚本。
3. `AlbConfig jkt-alb` / `IngressClass alb` **不在 ops 仓**：它们带 finalizer，被 ArgoCD prune
   会级联删除云上 ALB。
4. 镜像只写 digest，禁 `latest`。
5. 同一集群里**只能有一个 Application 管 `newapi-dev`**。测试仓 `new-api-yxw` 的自动构建已停用。

## 待办

- [ ] `prune → true`（开之前先 `argocd app diff` 逐条确认）
- [ ] Trivy `exit-code → 1`（CRITICAL 阻断）
- [ ] `OPS_REPO_TOKEN` 换成只对 ops 仓有 `Contents: write` 的细粒度 PAT
- [ ] 多环境：`overlays/jkt-pre|test|prod` 目前是占位
