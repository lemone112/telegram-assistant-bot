FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY supabase/migrations/ ./supabase/migrations/

# Typecheck at build time
RUN npx tsc --noEmit

EXPOSE 3000

# In Docker, env vars come from docker-compose env_file — no --env-file needed
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
