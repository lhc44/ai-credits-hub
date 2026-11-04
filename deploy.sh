#!/bin/bash
# ==========================================
# AI Credits Hub 一键部署脚本
# 适用于 Ubuntu / Debian / CentOS 等 Linux 服务器
# ==========================================

set -e

echo "🚀 AI Credits Hub 部署脚本"
echo "=========================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 项目目录
PROJECT_DIR="/opt/ai-credits-hub"

# ==================== 检查 Docker ====================
check_docker() {
  if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker 未安装，正在安装...${NC}"
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker 安装完成！${NC}"
  else
    echo -e "${GREEN}Docker 已安装${NC}"
  fi

  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Docker Compose 未安装，正在安装...${NC}"
    apt-get update && apt-get install -y docker-compose-plugin || {
      curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      chmod +x /usr/local/bin/docker-compose
    }
    echo -e "${GREEN}Docker Compose 安装完成！${NC}"
  else
    echo -e "${GREEN}Docker Compose 已安装${NC}"
  fi
}

# ==================== 配置环境 ====================
setup_env() {
  cd "$PROJECT_DIR"

  if [ ! -f .env ]; then
    echo -e "${YELLOW}创建配置文件...${NC}"
    # 生成随机 JWT Secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)

    cat > .env << EOF
# 服务器配置
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# JWT密钥 (已自动生成)
JWT_SECRET=${JWT_SECRET}

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 定时签到时间 (每天早上8:05, Asia/Shanghai时区)
CRON_SCHEDULE=5 8 * * *

# 签到随机延迟 (秒)
CHECKIN_DELAY_MIN=10
CHECKIN_DELAY_MAX=120

# 数据库路径
DB_PATH=/app/data/database.db
EOF
    echo -e "${GREEN}配置文件已创建: .env${NC}"
    echo -e "${YELLOW}⚠️  请修改 .env 中的 ADMIN_PASSWORD！${NC}"
  else
    echo -e "${GREEN}配置文件已存在，跳过${NC}"
  fi
}

# ==================== 构建并启动 ====================
build_and_start() {
  cd "$PROJECT_DIR"

  echo -e "${YELLOW}构建 Docker 镜像...${NC}"
  if docker compose version &> /dev/null 2>&1; then
    docker compose build
    docker compose up -d
  else
    docker-compose build
    docker-compose up -d
  fi

  echo ""
  echo -e "${GREEN}===========================================${NC}"
  echo -e "${GREEN}  ✅ AI Credits Hub 部署成功！${NC}"
  echo -e "${GREEN}===========================================${NC}"
  echo ""
  echo -e "  🌐 访问地址: http://$(hostname -I | awk '{print $1}'):3000"
  echo -e "  👤 默认账号: admin"
  echo -e "  🔑 默认密码: admin123"
  echo ""
  echo -e "${YELLOW}  ⚠️  请务必修改默认密码！${NC}"
  echo ""
}

# ==================== 主流程 ====================
main() {
  check_docker
  mkdir -p "$PROJECT_DIR/data"
  setup_env
  build_and_start
}

main "$@"
