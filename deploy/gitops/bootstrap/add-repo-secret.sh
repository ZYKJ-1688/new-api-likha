#!/usr/bin/env bash
# add-repo-secret.sh —— 把 ops 仓凭据注入 ArgoCD（**本地执行**）
#
# ⚠️ 本组织（ZYKJ-1688）**禁用了 Deploy keys**（API 返回
#    `Deploy keys are disabled for this repository`），所以这里走 **HTTPS + PAT**：
#      username: x-access-token
#      password: <PAT，需该 ops 仓的 Contents: Read>
#
# 用 SSH deploy key 的版本在个人仓 `new-api-yxw` 那边，本仓不适用。
#
# usage:
#   OPS_PAT=ghp_xxx bash deploy/gitops/bootstrap/add-repo-secret.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
OPS_URL="${OPS_URL:-https://github.com/ZYKJ-1688/new-api-likha-ops.git}"
SECRET_NAME="repo-new-api-likha-ops"
: "${OPS_PAT:?需要 OPS_PAT（对 new-api-likha-ops 有读权限的 PAT）}"

TMP="$(mktemp /tmp/add-repo-secret.XXXXXX.sh)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

{
  echo 'set -uo pipefail'
  echo "cat <<'__YAML__' | kubectl apply -f -"
  cat <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: ${OPS_URL}
  username: x-access-token
  password: ${OPS_PAT}
YAML
  echo '__YAML__'
  echo "echo '--- 结果'"
  echo "kubectl -n argocd get secret ${SECRET_NAME} -o name"
  echo "echo '--- repo-server 最近日志'"
  echo "kubectl -n argocd logs deploy/argocd-repo-server --tail=6 2>&1 | sed 's/^/  /'"
} > "$TMP"

echo "[i] 注入 ops 仓凭据（HTTPS+PAT）: $OPS_URL"
bash "${REPO_ROOT}/deploy/lib/ack_remote_jkt_dev.sh" "$TMP"
