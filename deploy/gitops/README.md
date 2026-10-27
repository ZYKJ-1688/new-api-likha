# deploy/gitops —— GitOps 开发流水线

本目录只放**运维工具**（bootstrap / 验收脚本）。**部署清单的真源在独立仓库**
[`ZYKJ-1688/new-api-likha-ops`](https://github.com/ZYKJ-1688/new-api-likha-ops)，
不要在本仓写 manifest。

## 链路

```
push development
  → .github/workflows/dev-build.yml
      ├─ 构建镜像 → 推 ACR   newapi-dev/newapi-likha:dev-<yyyymmdd>-<sha7>
      └─ 回写 ops 仓         overlays/jkt-dev/kustomization.yaml 的 images.digest
  → ArgoCD（ACK 雅加达 dev 集群，Application `jkt-dev`）3 min 内拉取
  → 滚动发布 newapi-dev 命名空间
  → 线上 /api/status 的 version = 本次 CI 的 tag
```

CI **不碰集群**（没有 kubeconfig），集群**不碰镜像构建**（没有 ACR 密码）。两边只通过
「Git 里的一次 commit」耦合。

## 现状（2026-10-27）

| 项 | 状态 |
|---|---|
| 集群 | ACK 雅加达 `cb0abf5bc06034f7bbdb991752f6f3e62`（`ap-southeast-5`） |
| 命名空间 | `newapi-dev`（与 `new-api-yxw` **共用**同一批资源对象） |
| ArgoCD | v3.5.6，`argocd` ns，UI `https://argocd.likha.hk` |
| Application | `jkt-dev` → `ZYKJ-1688/new-api-likha-ops` / `overlays/jkt-dev` |
| 域名 | `dev.likha.hk`（复用，未新增） |
| 镜像 | 马尼拉 ACR EE `newapi-dev/newapi-likha`（跨区公网拉取，SA 免密） |
| Secret | `new-api-secrets` 手工注入，**不在 GitOps 范围** |
| 同步策略 | `selfHeal=false` / `prune=false`（保守档，见下方待办） |

> **与 `new-api-yxw` 的关系**：`new-api-yxw` 是个人测试仓，那套 GitOps 是原型。
> 本仓接管同一个 ns 与同一批资源对象后，ArgoCD 的 `jkt-dev` 已把源切到本仓。
> **同一个集群只能有一个 Application 管 `newapi-dev`**，两边不要同时启用。

## 本目录文件

| 脚本 | 用途 | 是否需在本集群重跑 |
|---|---|---|
| `bootstrap/install-argocd.sh` | 装 ArgoCD（非 HA）+ 压 requests + `--insecure` | ❌ 已装（重跑会重启 ArgoCD） |
| `bootstrap/add-repo-secret.sh` | 注入 ops 仓凭据 | ❌ 已注入 |
| `bootstrap/apply-app.sh` | apply AppProject + Application | ❌ 已应用 |
| `bootstrap/expose-ui.sh` | 建 `argocd.likha.hk` Ingress | ❌ 已存在 |
| `bootstrap/set-secrets.sh` | 批量写 GitHub Actions Secrets | 换 token 时用 |
| `bootstrap/verify.sh` | ArgoCD + app 只读体检 | 随时可跑 |
| `bootstrap/verify-e2e.sh` | 端到端验收（CI → ops → ArgoCD → 线上 version） | 随时可跑 |
| `../lib/ack_remote_jkt_dev.sh` | 云助手通道（节点内 kubectl，15 min 临时凭据） | 基础设施 |

## 日常

```bash
# 正常发版：只做这一件事
git switch development && git pull --ff-only
# ...改代码 → PR → 合并回 development → 等 8 分钟

# 验收（任何时候）
bash deploy/gitops/bootstrap/verify-e2e.sh

# 回滚（<3 min）
cd ../new-api-likha-ops && git revert <bump commit> && git push
```

**红线**：

1. 不要在集群里 `kubectl set image` 改 `new-api-dev*` —— `selfHeal` 打开后会被打回（现在还是 false，
   但请按「Git 是真源」来操作）。
2. `Secret new-api-secrets` 不进 Git，轮换走运维脚本。
3. `AlbConfig jkt-alb` / `IngressClass alb` **不在 ops 仓**：它们带 finalizer，被 ArgoCD prune
   会级联删除云上 ALB。
4. 镜像只写 digest，禁 `latest`。

## 首次 bootstrap（换集群时照此执行）

```bash
# 1) 装 ArgoCD
bash deploy/lib/ack_remote_jkt_dev.sh deploy/gitops/bootstrap/install-argocd.sh
# 2) 注入 ops 仓凭据（本组织禁用 deploy key，只能 HTTPS+PAT）
OPS_PAT=ghp_xxx bash deploy/gitops/bootstrap/add-repo-secret.sh
# 3) 应用 AppProject + Application（清单来自 ops 仓的 argocd/ 目录）
bash deploy/gitops/bootstrap/apply-app.sh /path/to/new-api-likha-ops
# 4) 暴露 UI（需要 DNS 一条 CNAME → ALB）
sh deploy/gitops/bootstrap/expose-ui.sh
# 5) 业务仓配 4 个 Secrets
bash deploy/gitops/bootstrap/set-secrets.sh \
  ACR_REGISTRY=... ACR_USERNAME=... ACR_PASSWORD=... OPS_REPO_TOKEN=...
```

## 待办

- [ ] `selfHeal → true`（现在手工改集群不会被拉回）
- [ ] `prune → true`（开之前先 `argocd app diff` 逐条确认）
- [ ] Trivy `exit-code → 1`（CRITICAL 阻断）
- [ ] `OPS_REPO_TOKEN` 换成只对 ops 仓有 `Contents: write` 的细粒度 PAT
- [ ] 多环境：`overlays/jkt-pre|test|prod` 目前是占位
