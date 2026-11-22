# Etapa 1: Construcción
FROM node:26 AS builder

WORKDIR /app

# Argumento para la URL de la API
ARG VITE_API_URL=http://localhost:4000

COPY package*.json ./

# Instalación reproducible: versiones exactas del package-lock.json
# y sin ejecutar scripts de instalación de terceros
RUN npm ci --ignore-scripts

COPY . .

ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# Etapa 2: Producción (versión de Nginx fija)
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
