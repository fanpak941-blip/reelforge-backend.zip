FROM node:20-slim

# Install Python + Piper TTS (self-hosted, 100% free neural voices, no API key ever needed)
RUN apt-get update && apt-get install -y python3 python3-pip curl && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages piper-tts

# Pre-download every voice model we use, so the running app never needs to
# reach the internet for TTS — this also makes the Docker image itself the
# only thing that needs to build successfully once.
RUN mkdir -p /app/voices && \
    for voice in \
      en_US-amy-medium \
      en_US-ryan-medium \
      en_US-lessac-medium \
      en_US-john-medium \
      en_US-hfc_female-medium \
      hi_IN-pratham-medium \
      hi_IN-priyamvada-medium \
      es_ES-davefx-medium \
      es_ES-sharvard-medium \
      fr_FR-tom-medium \
      fr_FR-siwis-medium \
      de_DE-thorsten-medium \
      de_DE-kerstin-low \
      ar_JO-kareem-medium \
    ; do \
      echo "warming up voice download" | piper --model "$voice" --data-dir /app/voices --download-dir /app/voices --output_file /tmp/_warm.wav || true; \
    done && rm -f /tmp/_warm.wav

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
