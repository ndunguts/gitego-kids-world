#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  GITEGO KIDS WORLD — AWS EC2 Free Tier One-Command Setup"
echo "============================================================"

# 1. Add 2GB swap space (prevents OOM on 1GB RAM t2.micro / t3.micro)
if ! swapon --show | grep -q '/swapfile'; then
  echo "[1/5] Creating 2GB swap file for smooth Free Tier performance..."
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "[1/5] Swap already configured."
fi

# 2. Install Docker & Docker Compose plugin if missing
if ! command -v docker >/dev/null 2>&1; then
  echo "[2/5] Installing Docker..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
else
  echo "[2/5] Docker already installed."
fi

# 3. Generate secure production .env if it does not exist
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[3/5] Generating secure production .env with strong random secrets..."
  DB_PASS="$(openssl rand -hex 16)"
  JWT_SEC="$(openssl rand -hex 32)"
  JWT_REF="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
POSTGRES_USER=gitego
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=gitego_kids_world
JWT_SECRET_KEY=${JWT_SEC}
JWT_REFRESH_SECRET_KEY=${JWT_REF}
RATE_LIMIT_PER_MINUTE=240
MAX_UPLOAD_SIZE_BYTES=15728640
# Set to your domain (e.g. gitegokids.com) for automatic HTTPS, or leave :80 for IP access
SITE_ADDRESS=:80
EOF
  chmod 600 "$ENV_FILE"
  echo "    Created $ENV_FILE"
else
  echo "[3/5] Existing .env found — keeping your current configuration."
fi

# 4. Build and start containers
echo "[4/5] Building and starting GITEGO KIDS WORLD containers..."
cd "$ROOT_DIR"
sudo docker compose --env-file "$ENV_FILE" -f deploy/aws/docker-compose.aws.yml up -d --build

# 5. Print live status
echo "[5/5] Deployment complete!"
PUBLIC_IP="$(curl -s http://checkip.amazonaws.com || echo 'YOUR_EC2_PUBLIC_IP')"
echo ""
echo "✅ GITEGO KIDS WORLD is now LIVE!"
echo "   🌐 URL:      http://${PUBLIC_IP}/"
echo "   📘 API Docs: http://${PUBLIC_IP}/docs"
echo ""
echo "💡 When you connect a domain name later, set SITE_ADDRESS=yourdomain.com in .env"
echo "   and run: sudo docker compose --env-file .env -f deploy/aws/docker-compose.aws.yml up -d"
echo "   Caddy will automatically issue a FREE Let's Encrypt HTTPS certificate!"
