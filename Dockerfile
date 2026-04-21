# Use a imagem oficial do Node.js
FROM node:22-slim

# Instalar dependências necessárias para o Chrome rodar no Linux
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    google-chrome-stable \
    --no-install-recommends \
    || apt-get install -y google-chrome-stable || true \
    && rm -rf /var/lib/apt/lists/*

# Se o google-chrome-stable não estiver no repo padrão, instalar manualmente
RUN if ! command -v google-chrome-stable > /dev/null; then \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*; \
    fi

# Configurar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências do projeto
# SKIP_CHROMIUM_DOWNLOAD evita baixar o chrome inútil de novo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

RUN npm install

# Copiar o resto do código
COPY . .

# Construir o frontend
RUN npm run build

# Expor a porta que o Railway usa (normalmente 8080 ou fornecida via env)
EXPOSE 8080

# Comando para iniciar o servidor e o robô
CMD ["npm", "start"]
