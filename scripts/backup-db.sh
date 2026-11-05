#!/usr/bin/env bash
# Encrypted PostgreSQL backup with rotation — ISO 27001 A.8.13 (information
# backup) and A.8.24 (cryptography). Schedule it nightly (cron / Task Scheduler)
# and before every migration deploy; restore steps: docs/OPERATIONS.md §4.
#
# Usage:
#   BACKUP_PASSPHRASE='…' scripts/backup-db.sh
#
# Environment:
#   BACKUP_PASSPHRASE   required — encrypts the dump (AES-256, PBKDF2). Store it
#                       apart from the backups and from .env (different trust domain).
#   BACKUP_DIR          default ./backups
#   BACKUP_KEEP_DAYS    default 30 — older encrypted dumps are deleted
#   BACKUP_DB_CONTAINER if set (e.g. bladna-db), dump through `docker exec` with
#                       BACKUP_DB_USER / BACKUP_DB_NAME (defaults bladna / bladna);
#                       otherwise pg_dump runs locally against $DATABASE_URL.
#
# Decrypt for a restore:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
#     -in backups/bladna-<stamp>.dump.enc -out bladna.dump
set -euo pipefail

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required (backups are always encrypted)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
out="${BACKUP_DIR}/bladna-${stamp}.dump.enc"

mkdir -p "$BACKUP_DIR"
umask 077

dump() {
  if [[ -n "${BACKUP_DB_CONTAINER:-}" ]]; then
    docker exec "$BACKUP_DB_CONTAINER" pg_dump --format=custom --no-owner \
      -U "${BACKUP_DB_USER:-bladna}" -d "${BACKUP_DB_NAME:-bladna}"
  else
    : "${DATABASE_URL:?DATABASE_URL is required when BACKUP_DB_CONTAINER is not set}"
    pg_dump --format=custom --no-owner --dbname="$DATABASE_URL"
  fi
}

# Stream dump → encryption so no plaintext copy ever touches the disk.
dump | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -out "$out"

if [[ ! -s "$out" ]]; then
  echo "backup failed: ${out} is empty" >&2
  rm -f "$out"
  exit 1
fi

# Integrity record, checked before any restore.
(cd "$BACKUP_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")

# Rotation: drop encrypted dumps (and their checksums) older than the window.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'bladna-*.dump.enc' -o -name 'bladna-*.dump.enc.sha256' \) \
  -mtime "+${BACKUP_KEEP_DAYS}" -delete

echo "backup written: ${out} ($(wc -c < "$out") bytes)"
