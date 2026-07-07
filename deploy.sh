#!/bin/bash
# ============================================================
#  Déploiement AUTOMATIQUE d'OPTIPUB (serveur DietPi4)
#  Lancé toutes les 2 min par cron.
#  - ne déploie que s'il y a un commit non encore déployé
#  - réessaie tant que le déploiement n'a pas réussi
#  - garde le .env.production (non suivi par git, donc préservé)
#  - écrit un "battement de coeur" à chaque passage
# ============================================================
set -uo pipefail

REPO=/home/hugue/optipub
LOG=/home/hugue/optipub-deploy.log
HEARTBEAT=/home/hugue/optipub-deploy.last     # preuve que le cron tourne
DEPLOYED=/home/hugue/optipub-deployed.sha     # dernier commit DÉPLOYÉ AVEC SUCCÈS
LOCK=/tmp/optipub-deploy.lock

# Empêche deux déploiements simultanés
exec 9>"$LOCK"
flock -n 9 || { echo "$(date) : deploiement deja en cours, on saute" >> "$LOG"; exit 0; }

# Battement de coeur (prouve que le script est bien exécuté par cron)
date -u '+%Y-%m-%d %H:%M:%S UTC' > "$HEARTBEAT"

cd "$REPO" || { echo "$(date) : REPO introuvable ($REPO)" >> "$LOG"; exit 1; }

# Récupère l'état distant ; si le fetch échoue, on LOGUE (au lieu de sortir en silence)
if ! git fetch --quiet origin main 2>>"$LOG"; then
  echo "$(date) : git fetch ECHEC (reseau ?) — on reessaiera" >> "$LOG"
  exit 1
fi

REMOTE=$(git rev-parse origin/main)
LAST=$(cat "$DEPLOYED" 2>/dev/null || echo "none")
[ "$REMOTE" = "$LAST" ] && exit 0   # déjà déployé avec succès -> rien à faire

echo "==================================================" >> "$LOG"
echo "$(date) : nouveau code $REMOTE (dernier deploye: $LAST)" >> "$LOG"
# reset --hard ne touche PAS .env.production (non suivi par git) -> secrets préservés
git reset --hard --quiet "$REMOTE" >> "$LOG" 2>&1

# Construction + redémarrage via docker compose
if ! docker compose up -d --build >> "$LOG" 2>&1; then
  echo "$(date) : ECHEC du build/deploiement — nouvelle tentative au prochain cycle" >> "$LOG"
  exit 1
fi

# Vérifie que le conteneur tourne
sleep 8
if [ "$(docker inspect -f '{{.State.Running}}' optipub 2>/dev/null)" != "true" ]; then
  echo "$(date) : le conteneur optipub n'a pas demarre" >> "$LOG"
  exit 1
fi

# Succès : on mémorise le commit déployé
echo "$REMOTE" > "$DEPLOYED"
echo "$(date) : deploiement OPTIPUB reussi ($REMOTE)" >> "$LOG"
