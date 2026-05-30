package config

import (
	"log/slog"
	"testing"
)

func TestLoadUsesEnvironment(t *testing.T) {
	t.Setenv("TRACELINE_ADDR", ":9090")
	t.Setenv("TRACELINE_LOG_LEVEL", "debug")

	cfg := Load()

	if cfg.Addr != ":9090" {
		t.Fatalf("expected custom address, got %q", cfg.Addr)
	}
	if cfg.LogLevel != slog.LevelDebug {
		t.Fatalf("expected debug log level, got %s", cfg.LogLevel)
	}
}

func TestParseLogLevelFallsBackToInfo(t *testing.T) {
	if got := parseLogLevel("surprise"); got != slog.LevelInfo {
		t.Fatalf("expected info fallback, got %s", got)
	}
}
