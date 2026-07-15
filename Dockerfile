FROM debian:bookworm-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Piper TTS
RUN pip3 install piper-tts --break-system-packages

# Download voices (errors ab nahi chhupengi)
RUN python3 -m piper.download_voices en_US-lessac-medium
RUN python3 -m piper.download_voices hi_IN-dhruva-medium
RUN python3 -m piper.download_voices es_ES-mls_10246-low
RUN python3 -m piper.download_voices fr_FR-mls_1840-low
RUN python3 -m piper.download_voices de_DE-thorsten-low
RUN python3 -m piper.download_voices ar_JO-kareem-low

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]
