FROM node:20-alpine

WORKDIR /app

# 安装构建依赖 (better-sqlite3 需要)
RUN apk add --no-cache python3 make g++

# 安装后端依赖
COPY package.json package-lock.json* ./
RUN npm install --production

# 安装前端依赖并构建
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# 复制服务端代码
COPY server/ ./server/
COPY .env.example ./.env.example

# 创建数据目录
RUN mkdir -p /app/data

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/database.db

EXPOSE 3000

CMD ["node", "server/index.js"]
