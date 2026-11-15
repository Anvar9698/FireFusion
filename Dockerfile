FROM node:22-alpine AS frontend-build
WORKDIR /workspace
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim
WORKDIR /workspace
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FIREFUSION_DATA_DIR=/workspace
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt
COPY api ./api
COPY Modis ./Modis
COPY viirs-20 ./viirs-20
COPY viirs-21 ./viirs-21
COPY --from=frontend-build /workspace/dist ./frontend-dist
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn api.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
