package export

import (
	"strings"
	"testing"

	"github.com/asher/traceline/backend/internal/diff"
)

func TestBuildHTMLExportMimicsFrontendShell(t *testing.T) {
	response, err := Build("", resultFixture())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if response.ContentType != "text/html; charset=utf-8" {
		t.Fatalf("unexpected content type %q", response.ContentType)
	}
	for _, expected := range []string{"class=\"topbar\"", "class=\"workspace\"", "TraceLine Comparison", "Side-by-side comparison", "Compare text blocks line by line."} {
		if !strings.Contains(response.Content, expected) {
			t.Fatalf("expected frontend shell marker %q in HTML export: %s", expected, response.Content)
		}
	}
}

func TestBuildHTMLExportEscapesContent(t *testing.T) {
	result := resultFixture()
	result.Operations = append(result.Operations, diff.Operation{Type: diff.OperationAdd, Right: "<script>alert(1)</script>"})

	response, err := Build(FormatHTML, result)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if strings.Contains(response.Content, "<script>alert") {
		t.Fatalf("expected HTML content to be escaped: %s", response.Content)
	}
	if !strings.Contains(response.Content, "&lt;script&gt;") {
		t.Fatalf("expected escaped script tag: %s", response.Content)
	}
}

func TestBuildRejectsUnknownFormat(t *testing.T) {
	if _, err := Build("pdf", resultFixture()); err == nil {
		t.Fatal("expected unsupported format error")
	}
}

func resultFixture() diff.Result {
	return diff.Result{
		Mode: diff.ModeLine,
		Operations: []diff.Operation{
			{Type: diff.OperationEqual, Left: "same", Right: "same"},
			{
				Type:          diff.OperationChange,
				Left:          "old",
				Right:         "new",
				LeftSegments:  []diff.Segment{{Type: diff.OperationRemove, Text: "old"}},
				RightSegments: []diff.Segment{{Type: diff.OperationAdd, Text: "new"}},
			},
		},
		Summary: diff.Summary{
			SimilarityScore: 75,
			AddedCount:      0,
			RemovedCount:    0,
			ChangedCount:    1,
		},
	}
}
