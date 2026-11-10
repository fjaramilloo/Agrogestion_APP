#!/bin/bash
# Script para ejecución programada del backup de AgroGestión
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "/Users/fedejaramilloo/Documents/App Web" || exit 1
/usr/local/bin/node scripts/backup.mjs >> backups/backup_cron.log 2>&1
