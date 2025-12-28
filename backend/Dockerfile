# backend/Dockerfile
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .
# Expose backend port
EXPOSE 5100

# Run dev or prod (change if needed)
CMD ["npm", "run", "dev"]
