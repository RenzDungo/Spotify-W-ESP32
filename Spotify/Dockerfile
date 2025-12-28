# Spotify/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install

# Copy source
COPY . .
# Expose Vite port
EXPOSE 5501

# Run Vite on all interfaces
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5500"]
