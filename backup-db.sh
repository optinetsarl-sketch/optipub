#!/bin/bash
# ============================================================
#  Sauvegarde hebdomadaire OPTINET (serveur DietPi4)
#  Lancé chaque vendredi soir par cron :
#  0 21 * * 5 bash /home/hugue/optipub/backup-db.sh # optinet-backup
#
#  Produit dans /home/hugue/backups :
#    - site-postgres_AAAA-MM-JJ.sql.gz   (base du site)
#    - site-medias_AAAA-MM-JJ.tar.gz     (photos du site)
#  Le PC de bureau les télécharge via OPTIPUB (/api/backup,
#  jeton BACKUP_TOKEN) puis les SUPPRIME du serveur.
#  Ici on ne garde jamais plus d'une copie de chaque type.
# ============================================================
set -uo pipefail

DEST=/home/hugue/backups
MEDIA=/home/hugue/optinet_media
PG_CONTAINER=kinera_db
LOG=/home/hugue/optinet-backup.log
JOUR=$(date +%F)

mkdir -p "$DEST"
echo "==================================================" >> "$LOG"
echo "$(date) : début de la sauvegarde" >> "$LOG"

# ── 1) Base PostgreSQL du site ──
PGUSER=$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo postgres)
PGDB=$(docker exec "$PG_CONTAINER" printenv POSTGRES_DB 2>/dev/null || echo "$PGUSER")
if docker exec "$PG_CONTAINER" pg_dump -U "$PGUSER" "$PGDB" 2>>"$LOG" | gzip > "$DEST/site-postgres_${JOUR}.sql.gz"; then
  echo "$(date) : ✅ base postgres sauvegardée ($(du -h "$DEST/site-postgres_${JOUR}.sql.gz" | cut -f1))" >> "$LOG"
else
  echo "$(date) : ❌ ECHEC sauvegarde postgres" >> "$LOG"
  rm -f "$DEST/site-postgres_${JOUR}.sql.gz"
fi

# ── 2) Médias du site (photos produits, journal, galerie) ──
if [ -d "$MEDIA" ]; then
  if tar -czf "$DEST/site-medias_${JOUR}.tar.gz" -C "$(dirname "$MEDIA")" "$(basename "$MEDIA")" 2>>"$LOG"; then
    echo "$(date) : ✅ médias sauvegardés ($(du -h "$DEST/site-medias_${JOUR}.tar.gz" | cut -f1))" >> "$LOG"
  else
    echo "$(date) : ❌ ECHEC sauvegarde médias" >> "$LOG"
    rm -f "$DEST/site-medias_${JOUR}.tar.gz"
  fi
else
  echo "$(date) : ⚠️ dossier médias introuvable ($MEDIA)" >> "$LOG"
fi

# ── 3) Rotation : ne garder QUE le plus récent de chaque type ──
# (le serveur n'est qu'une zone de transit : le PC télécharge puis supprime ;
#  s'il rate un vendredi, seule la copie la plus fraîche attend ici)
for prefixe in site-postgres site-medias; do
  ls -1t "$DEST/${prefixe}"_*.gz 2>/dev/null | tail -n +2 | xargs -r rm -f
done

echo "$(date) : sauvegarde terminée" >> "$LOG"
