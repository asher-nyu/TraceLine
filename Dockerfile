FROM node:24-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM golang:1.26.3-alpine AS backend
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /traceline ./cmd/server

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=backend /traceline /app/traceline
COPY --from=frontend /app/frontend/dist/frontend/browser /app/public
ENV TRACELINE_ADDR=:8080
EXPOSE 8080
ENTRYPOINT ["/app/traceline"]
