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

# Run with tsx (TypeScript loader for Node.js)
CMD ["npx", "tsx", "src/server.ts"]
