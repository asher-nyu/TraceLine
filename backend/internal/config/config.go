package config

import (
	"log/slog"
	"os"
	"strings"
)

type Config struct {
	Addr     string
	LogLevel slog.Level
}

func Load() Config {
	addr := getenv("TRACELINE_ADDR", ":8080")
	return Config{
		Addr:     addr,
		LogLevel: parseLogLevel(getenv("TRACELINE_LOG_LEVEL", "info")),
	}
}

func getenv(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func parseLogLevel(value string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
