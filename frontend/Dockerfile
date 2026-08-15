# Stage 1: Compile the frontend build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Vite inlines VITE_* variables into the bundle at BUILD time — they are not read
# at runtime, so changing either one means rebuilding the image, not restarting
# the container. compose.yaml passes both via build.args.
#   VITE_API_BASE_URL   — empty means same-origin (/api, proxied by nginx below).
#                         Left unset entirely, the app falls back to
#                         http://127.0.0.1:8000 for local `npm run dev`.
#   VITE_GOOGLE_CLIENT_ID — public OAuth client ID, not a secret. Unset and the
#                         "Sign in with Google" button simply doesn't render.
ARG VITE_API_BASE_URL=""
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# Stage 2: Serve the compiled static files with Nginx
FROM nginx:stable-alpine
# SPA fallback + the /api proxy to the backend container. Without this the
# default config 404s on any client-side route refresh and knows nothing of /api.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
