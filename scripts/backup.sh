#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL:?DATABASE_URL não configurada}"
backup_dir="${BACKUP_DIR:-/data/backups}"
uploads_dir="${UPLOADS_DIR:-/data/uploads}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
work_dir="$(mktemp -d "$backup_dir/.backup-$stamp-XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$work_dir/database.dump"
if [ -d "$uploads_dir" ]; then
  tar -C "$uploads_dir" -czf "$work_dir/uploads.tar.gz" .
fi
(cd "$work_dir" && sha256sum database.dump > SHA256SUMS && if [ -f uploads.tar.gz ]; then sha256sum uploads.tar.gz >> SHA256SUMS; fi)
final_dir="$backup_dir/otimiza-crm-$stamp-$$"
mv "$work_dir" "$final_dir"
trap - EXIT HUP INT TERM
printf 'Backup criado em %s\n' "$final_dir"
