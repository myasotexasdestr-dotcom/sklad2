#!/usr/bin/env bash
# Безпечний деплой «Мясо з техасу»: bash /opt/sklad-server/deploy.sh [коміт|гілка]   (за замовчуванням — main)
# Що робить: бере файли з GitHub за конкретним комітом → перевіряє цілісність (git-хеш) і синтаксис →
# робить копію поточної версії → встановлює → перезапускає сервер (лише якщо змінились серверні файли) →
# перевіряє, що він відповідає; якщо ні — сам повертає попередню версію.
set -euo pipefail

REPO="myasotexasdestr-dotcom/sklad2"
DIR="${SKLAD_DIR:-/opt/sklad-server}"
PORT="${PORT:-3000}"
REF="${1:-main}"
SERVER_FILES=(server.js digest.js package.json)
ALL_FILES=(server.js digest.js package.json public/sklad.html deploy.sh)

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mПОМИЛКА: %s\033[0m\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || die "потрібен curl"
command -v node >/dev/null || die "потрібен node"

say "Визначаю коміт для «$REF»…"
SHA=$(curl -fsSL -H "Accept: application/vnd.github.sha" "https://api.github.com/repos/$REPO/commits/$REF") || die "не вдалося отримати коміт (мережа або приватний репозиторій?)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "несподіана відповідь GitHub: ${SHA:0:80}"
say "Коміт: $SHA"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/public"

blob_sha() { { printf 'blob %s\0' "$(wc -c < "$1")"; cat "$1"; } | sha1sum | cut -d' ' -f1; }

for f in "${ALL_FILES[@]}"; do
  curl -fsSL "https://raw.githubusercontent.com/$REPO/$SHA/$f" -o "$TMP/$f" || die "не вдалося завантажити $f"
  want=$(curl -fsSL "https://api.github.com/repos/$REPO/contents/$f?ref=$SHA" | grep -m1 '"sha"' | sed 's/.*"sha": *"\([0-9a-f]*\)".*/\1/')
  have=$(blob_sha "$TMP/$f")
  [[ -n "$want" && "$want" == "$have" ]] || die "файл $f пошкоджений під час завантаження (хеш не збігся)"
  printf '  ✓ %s (%s байт)\n' "$f" "$(wc -c < "$TMP/$f")"
done

node --check "$TMP/server.js" || die "server.js має синтаксичну помилку"
node --check "$TMP/digest.js" || die "digest.js має синтаксичну помилку"

NEED_RESTART=0; NEED_NPM=0
for f in "${SERVER_FILES[@]}"; do
  cmp -s "$TMP/$f" "$DIR/$f" 2>/dev/null || NEED_RESTART=1
done
cmp -s "$TMP/package.json" "$DIR/package.json" 2>/dev/null || NEED_NPM=1
[[ -d "$DIR/node_modules" ]] || NEED_NPM=1

BK="$DIR/backups/deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK/public"
for f in "${ALL_FILES[@]}"; do [[ -f "$DIR/$f" ]] && cp "$DIR/$f" "$BK/$f"; done
say "Копія поточної версії: $BK"

mkdir -p "$DIR/public"
for f in "${ALL_FILES[@]}"; do cp "$TMP/$f" "$DIR/$f"; done
chmod +x "$DIR/deploy.sh" || true
[[ "$NEED_NPM" == 1 ]] && { say "Оновлюю залежності…"; (cd "$DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null) || die "npm install не вдався"; }

rollback() {
  printf '\033[31mСервер не відповідає — повертаю попередню версію…\033[0m\n' >&2
  for f in "${ALL_FILES[@]}"; do [[ -f "$BK/$f" ]] && cp "$BK/$f" "$DIR/$f"; done
  pm2 restart all >/dev/null 2>&1 || true
  die "деплой скасовано, відновлено попередню версію"
}

if [[ "$NEED_RESTART" == 1 ]]; then
  say "Серверні файли змінились — перезапускаю…"
  pm2 restart all --update-env >/dev/null || die "pm2 restart не вдався"
  ok=0
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  [[ "$ok" == 1 ]] || rollback
  say "Сервер відповідає ✓"
else
  say "Змінився лише клієнт — перезапуск не потрібен."
fi

echo "$SHA" > "$DIR/.deployed_sha"
VER=$(grep -o "APP_VERSION *= *'[^']*'" "$DIR/public/sklad.html" | head -1)
say "Готово: $VER · коміт ${SHA:0:7}"
