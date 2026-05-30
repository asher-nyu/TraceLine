package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/asher/traceline/backend/internal/diff"
	"github.com/asher/traceline/backend/internal/export"
)

const maxUploadBytes = 25 * 1024 * 1024

type handler struct {
	logger *slog.Logger
}

func NewRouter(logger *slog.Logger) http.Handler {
	h := handler{logger: logger}

	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(30 * time.Second))
	router.Use(cors)

	router.Get("/api/health", h.health)
	router.Post("/api/compare", h.compare)
	router.Post("/api/compare/files", h.compareFiles)
	router.Post("/api/export", h.export)

	fileServer := http.FileServer(http.Dir("public"))
	router.Handle("/*", spa(fileServer))

	return router
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func spa(fileServer http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeError(w, http.StatusNotFound, "endpoint not found")
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

func (h handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "traceline-api",
	})
}

func (h handler) compare(w http.ResponseWriter, r *http.Request) {
	var request diff.Request
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := runComparison(request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h handler) compareFiles(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadBytes * 2); err != nil {
		writeError(w, http.StatusBadRequest, "uploaded files are too large")
		return
	}

	leftText, err := readTextFile(r, "leftFile")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rightText, err := readTextFile(r, "rightFile")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := runComparison(diff.Request{
		LeftText:  leftText,
		RightText: rightText,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h handler) export(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Format string       `json:"format"`
		Result *diff.Result `json:"result"`
		Diff   diff.Request `json:"diff"`
	}
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result := diff.Result{}
	if request.Result != nil {
		result = *request.Result
	} else {
		var err error
		result, err = runComparison(request.Diff)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	response, err := export.Build(export.Format(request.Format), result)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func runComparison(request diff.Request) (diff.Result, error) {
	if strings.TrimSpace(request.LeftText) == "" && strings.TrimSpace(request.RightText) == "" {
		return diff.Result{}, errors.New("provide text on at least one side before comparing")
	}
	return diff.Compare(request.LeftText, request.RightText, diff.ModeLine), nil
}

func readTextFile(r *http.Request, fieldName string) (string, error) {
	file, header, err := r.FormFile(fieldName)
	if err != nil {
		return "", fmt.Errorf("%s is required", fieldName)
	}
	defer file.Close()

	if header.Size > maxUploadBytes {
		return "", fmt.Errorf("%s exceeds the 25 MB limit", header.Filename)
	}
	if !allowedExtension(header.Filename) {
		return "", fmt.Errorf("%s is not a supported text file", header.Filename)
	}

	content, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		return "", err
	}
	if len(content) > maxUploadBytes {
		return "", fmt.Errorf("%s exceeds the 25 MB limit", header.Filename)
	}
	return string(content), nil
}

func allowedExtension(filename string) bool {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".html", ".htm", ".xml", ".yaml", ".yml", ".log", ".sql", ".js", ".ts", ".css", ".scss", ".go", ".py", ".java", ".cs", ".cpp", ".c", ".rs", ".rb", ".php":
		return true
	default:
		return false
	}
}

func decodeJSON(r *http.Request, destination any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, maxUploadBytes*2))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
