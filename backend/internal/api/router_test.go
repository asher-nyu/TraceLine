package api

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/asher/traceline/backend/internal/diff"
)

func TestHealthCheckReturnsOK(t *testing.T) {
	router := NewRouter(slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}
}

func TestCompareReturnsDiff(t *testing.T) {
	router := NewRouter(slog.Default())
	body := bytes.NewBufferString(`{"leftText":"one\ntwo","rightText":"one\nthree"}`)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/compare", body)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var decoded struct {
		Summary struct {
			ChangedCount int `json:"changedCount"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if decoded.Summary.ChangedCount == 0 {
		t.Fatal("expected changed count")
	}
}

func TestCompareRejectsEmptyInput(t *testing.T) {
	router := NewRouter(slog.Default())
	body := bytes.NewBufferString(`{"leftText":"","rightText":""}`)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/compare", body)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}

func TestExportEndpointReturnsContent(t *testing.T) {
	router := NewRouter(slog.Default())
	body := bytes.NewBufferString(`{
		"result":{
			"mode":"line",
			"operations":[{"type":"changed","left":"old","right":"new"}],
			"summary":{"similarityScore":50,"changedCount":1}
		}
	}`)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/export", body)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("traceline-comparison.html")) {
		t.Fatalf("expected export file name: %s", response.Body.String())
	}
}

func TestCompareFilesEndpoint(t *testing.T) {
	router := NewRouter(slog.Default())
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	mustWriteFile(t, writer, "leftFile", "left.md", "alpha\nbeta")
	mustWriteFile(t, writer, "rightFile", "right.json", "alpha\ngamma")
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/compare/files", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
}

func TestCompareFilesRejectsUnsupportedExtension(t *testing.T) {
	router := NewRouter(slog.Default())
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	mustWriteFile(t, writer, "leftFile", "left.exe", "alpha")
	mustWriteFile(t, writer, "rightFile", "right.txt", "alpha")
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/compare/files", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}

func TestRunComparisonUsesRawText(t *testing.T) {
	result, err := runComparison(diff.Request{
		LeftText:  "Alpha",
		RightText: "alpha",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Summary.ChangedCount == 0 {
		t.Fatal("expected raw case difference")
	}
}

func TestCORSOptions(t *testing.T) {
	router := NewRouter(slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/compare", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", response.Code)
	}
}

func mustWriteFile(t *testing.T, writer *multipart.Writer, field string, filename string, content string) {
	t.Helper()
	part, err := writer.CreateFormFile(field, filename)
	if err != nil {
		t.Fatalf("create file %s: %v", filename, err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatalf("write file %s: %v", filename, err)
	}
}
