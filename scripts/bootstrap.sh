#!/usr/bin/env bash
set -euo pipefail

# MetaClaw VPS Bootstrap — Phase 1 (Hardening) + Phase 2 (Runtime)
# Run as root on fresh Ubuntu 24.04 VPS
# Usage: bash bootstrap.sh [username]

APP_USER="${1:-metaclaw}"

echo "MetaClaw VPS Bootstrap starting..."
echo "=================================="
echo "App user: ${APP_USER}"

# --- Phase 1: Hardening ---

echo ""
echo "Phase 1.1: System update & packages..."
apt update && apt upgrade -y
apt install -y curl git build-essential sqlite3 ufw fail2ban jq unzip

echo ""
echo "Phase 1.2: Creating ${APP_USER} user..."
if id "$APP_USER" &>/dev/null; then
    echo "   ${APP_USER} user already exists, skipping"
else
    useradd -m -s /bin/bash "$APP_USER"
    echo "${APP_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${APP_USER}"
    chmod 440 "/etc/sudoers.d/${APP_USER}"
fi

# Copy SSH keys
mkdir -p "/home/${APP_USER}/.ssh"
cp /root/.ssh/authorized_keys "/home/${APP_USER}/.ssh/" 2>/dev/null || echo "   No root SSH keys to copy"
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}/.ssh"
chmod 700 "/home/${APP_USER}/.ssh"
chmod 600 "/home/${APP_USER}/.ssh/authorized_keys" 2>/dev/null || true

echo ""
echo "Phase 1.3: SSH hardening..."
cat > /etc/ssh/sshd_config.d/hardened.conf << EOF
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 3
AllowUsers root ${APP_USER}
EOF
systemctl restart sshd

echo ""
echo "Phase 1.4: Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw --force enable

echo ""
echo "Phase 1.5: fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable --now fail2ban

echo ""
echo "Phase 1.6: Swap..."
if swapon --show | grep -q swapfile; then
    echo "   Swap already configured, skipping"
else
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ""
echo "Phase 1.7: Timezone..."
echo "   Set timezone with: timedatectl set-timezone <your-timezone>"

# --- Phase 2: Runtime ---

echo ""
echo "Phase 2.1: Node.js 22 LTS..."
if node --version 2>/dev/null | grep -q "v22"; then
    echo "   Node.js 22 already installed"
else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi
echo "   Node: $(node --version), npm: $(npm --version)"

echo ""
echo "Phase 2.2: Docker..."
if docker --version &>/dev/null; then
    echo "   Docker already installed"
else
    curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$APP_USER" 2>/dev/null || true
echo "   Docker: $(docker --version)"

echo ""
echo "Phase 2.3: Claude Code CLI..."
if claude --version &>/dev/null; then
    echo "   Claude CLI already installed"
else
    npm install -g @anthropic-ai/claude-code
fi
echo "   Claude: $(claude --version 2>&1 | head -1)"

# --- Verification ---

echo ""
echo "=================================="
echo "Bootstrap verification:"
echo "=================================="
ufw status | grep -q "Status: active" && echo "  UFW active" || echo "  UFW not active"
systemctl is-active --quiet fail2ban && echo "  fail2ban running" || echo "  fail2ban not running"
id "$APP_USER" &>/dev/null && echo "  ${APP_USER} user exists" || echo "  ${APP_USER} user missing"
swapon --show | grep -q swapfile && echo "  4GB swap" || echo "  swap not configured"
node --version | grep -q "v22" && echo "  Node.js 22" || echo "  Node.js missing"
docker --version &>/dev/null && echo "  Docker" || echo "  Docker missing"
claude --version &>/dev/null && echo "  Claude CLI" || echo "  Claude CLI missing"

echo ""
echo "=================================="
echo "Next steps:"
echo "  1. SSH as ${APP_USER}: ssh ${APP_USER}@<your-server-ip>"
echo "  2. Run: claude    (complete OAuth login)"
echo "  3. Run: cd ~ && git clone https://github.com/<your-org>/metaclaw.git && cd metaclaw && claude"
echo "  4. Inside Claude Code: /setup"
echo "=================================="
