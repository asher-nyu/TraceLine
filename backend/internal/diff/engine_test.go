package diff

import (
	"strings"
	"testing"
)

func TestCompareIdenticalTextReturnsFullSimilarity(t *testing.T) {
	result := Compare("alpha\nbeta", "alpha\nbeta", ModeLine)

	if result.Summary.SimilarityScore != 100 {
		t.Fatalf("expected 100 similarity, got %.2f", result.Summary.SimilarityScore)
	}
	if len(result.Operations) != 2 {
		t.Fatalf("expected two equal operations, got %d", len(result.Operations))
	}
}

func TestCompareDetectsAddedLine(t *testing.T) {
	result := Compare("alpha", "alpha\nbeta", ModeLine)

	if result.Summary.AddedCount == 0 {
		t.Fatal("expected added count")
	}
	if result.Operations[len(result.Operations)-1].Type != OperationAdd {
		t.Fatalf("expected final operation to be added, got %s", result.Operations[len(result.Operations)-1].Type)
	}
}

func TestCompareDetectsRemovedLine(t *testing.T) {
	result := Compare("alpha\nbeta", "alpha", ModeLine)

	if result.Summary.RemovedCount == 0 {
		t.Fatal("expected removed count")
	}
	if result.Operations[len(result.Operations)-1].Type != OperationRemove {
		t.Fatalf("expected final operation to be removed, got %s", result.Operations[len(result.Operations)-1].Type)
	}
}

func TestLineDiffPairsSimilarChangedLines(t *testing.T) {
	result := Compare("alpha\nbeta\ngamma", "alpha\nbetter\ngamma", ModeLine)

	if len(result.Operations) != 3 {
		t.Fatalf("expected three line operations, got %d: %#v", len(result.Operations), result.Operations)
	}
	if result.Operations[1].Type != OperationChange {
		t.Fatalf("expected middle line to be paired as changed, got %s", result.Operations[1].Type)
	}
	if result.Operations[1].Left != "beta" || result.Operations[1].Right != "better" {
		t.Fatalf("unexpected changed pair: %#v", result.Operations[1])
	}
}

func TestChangedLinesIncludeWordSegments(t *testing.T) {
	result := Compare("the blue line", "the green line", ModeLine)

	if len(result.Operations) != 1 {
		t.Fatalf("expected one operation, got %d", len(result.Operations))
	}
	operation := result.Operations[0]
	if operation.Type != OperationChange {
		t.Fatalf("expected changed operation, got %s", operation.Type)
	}
	if len(operation.LeftSegments) == 0 || len(operation.RightSegments) == 0 {
		t.Fatalf("expected changed operation to include word segments: %#v", operation)
	}

	leftHasRemoved := false
	rightHasAdded := false
	for _, segment := range operation.LeftSegments {
		if segment.Type == OperationRemove && segment.Text == "blue" {
			leftHasRemoved = true
		}
	}
	for _, segment := range operation.RightSegments {
		if segment.Type == OperationAdd && segment.Text == "green" {
			rightHasAdded = true
		}
	}
	if !leftHasRemoved || !rightHasAdded {
		t.Fatalf("expected word-level highlights, got left=%#v right=%#v", operation.LeftSegments, operation.RightSegments)
	}
}

func TestChangedLineSegmentsKeepSharedWordsUnhighlighted(t *testing.T) {
	result := Compare("Ship with confidence.", "Ship with confidence every time.", ModeLine)

	operation := result.Operations[0]
	for _, segment := range operation.LeftSegments {
		if segment.Type == OperationRemove && strings.Contains(segment.Text, "confidence") {
			t.Fatalf("confidence should remain equal on the left, got %#v", operation.LeftSegments)
		}
	}
	for _, segment := range operation.RightSegments {
		if segment.Type == OperationAdd && strings.Contains(segment.Text, "confidence") {
			t.Fatalf("confidence should remain equal on the right, got %#v", operation.RightSegments)
		}
	}
}

func TestChangedLineSegmentsKeepSharedPunctuationUnhighlighted(t *testing.T) {
	result := Compare("TraceLine shows every meaningful edit.", "TraceLine shows every meaningful change.", ModeLine)

	operation := result.Operations[0]
	rightSegments := operation.RightSegments
	if len(rightSegments) == 0 {
		t.Fatalf("expected right-side segments: %#v", operation)
	}
	for _, segment := range rightSegments {
		if segment.Type == OperationAdd && strings.Contains(segment.Text, ".") {
			t.Fatalf("shared punctuation should remain equal, got %#v", rightSegments)
		}
	}
	if rightSegments[len(rightSegments)-1].Type != OperationEqual || rightSegments[len(rightSegments)-1].Text != "." {
		t.Fatalf("expected final period to be equal, got %#v", rightSegments)
	}
}

func TestInsertedTrailingWordsKeepSharedPeriodUnhighlighted(t *testing.T) {
	result := Compare("Ship with confidence.", "Ship with confidence every time.", ModeLine)

	operation := result.Operations[0]
	rightSegments := operation.RightSegments
	if len(rightSegments) == 0 {
		t.Fatalf("expected right-side segments: %#v", operation)
	}
	for _, segment := range rightSegments {
		if segment.Type == OperationAdd && strings.Contains(segment.Text, ".") {
			t.Fatalf("inserted words should not absorb the shared period, got %#v", rightSegments)
		}
	}
	if rightSegments[len(rightSegments)-1].Type != OperationEqual || rightSegments[len(rightSegments)-1].Text != "." {
		t.Fatalf("expected final period to remain equal, got %#v", rightSegments)
	}
}

func TestRepeatedWordAfterInsertedPhraseKeepsNearestOriginalMatch(t *testing.T) {
	left := "● Cloud, Hosting & Deployment: Render, Railway, Fly.io, Vercel, Amazon Web Services (AWS), Cloudflare, web hosting, domain management, DNS configuration"
	right := "● Cloud, Hosting & Deployment: Render, Railway, Fly.io, Vercel, Amazon Web Services (AWS), Cloudflare, web hosting, domain management, DNS configuration, custom domain setup, SSL/TLS configuration"

	result := Compare(left, right, ModeLine)
	operation := result.Operations[0]
	if operation.Type != OperationChange {
		t.Fatalf("expected changed operation, got %s", operation.Type)
	}

	addedText := ""
	for _, segment := range operation.RightSegments {
		if segment.Type == OperationAdd {
			addedText += segment.Text
		}
	}
	if addedText != ", custom domain setup, SSL/TLS configuration" {
		t.Fatalf("expected only the inserted trailing phrase to be added, got %q in %#v", addedText, operation.RightSegments)
	}

	if strings.Contains(addedText, "DNS configuration,") {
		t.Fatalf("the original DNS configuration should stay equal, got added text %q", addedText)
	}
}

func TestValidMode(t *testing.T) {
	if !ValidMode(ModeLine) {
		t.Fatal("expected line mode to be valid")
	}
	if !ValidMode("") {
		t.Fatal("expected empty mode to default to line")
	}
	if ValidMode("word") {
		t.Fatal("expected word to be rejected as a diff mode")
	}
}

func TestCompareEmptyText(t *testing.T) {
	result := Compare("", "", ModeLine)

	if result.Summary.SimilarityScore != 100 {
		t.Fatalf("expected empty text to be identical, got %.2f", result.Summary.SimilarityScore)
	}
}
