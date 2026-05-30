package export

import (
	"bytes"
	"fmt"
	"html"
	"strconv"
	"strings"

	"github.com/asher/traceline/backend/internal/diff"
)

type Format string

const (
	FormatHTML Format = "html"
)

type Response struct {
	FileName    string `json:"fileName"`
	Content     string `json:"content"`
	ContentType string `json:"contentType"`
}

func Build(format Format, result diff.Result) (Response, error) {
	switch format {
	case "", FormatHTML:
		return Response{FileName: "traceline-comparison.html", ContentType: "text/html; charset=utf-8", Content: htmlDocument(result)}, nil
	default:
		return Response{}, fmt.Errorf("unsupported export format %q", format)
	}
}

func htmlDocument(result diff.Result) string {
	var buffer bytes.Buffer
	buffer.WriteString("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>TraceLine Comparison</title>")
	buffer.WriteString("<style>:root{--app-bg:#f5f7fb;--surface:#fff;--muted-surface:#eef3f7;--raised-surface:#f9fbfc;--ink:#172026;--muted-ink:#66737f;--outline:#d8e1e8;--added-bg:#c7e6ff;--added-ink:#003b73;--removed-bg:#ffe3a3;--removed-ink:#653600;--brand:#176b87;--brand-strong:#0b4d63;--accent:#5b6c2f;--shadow:0 18px 45px rgba(31,45,61,.12)}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,0)),var(--app-bg);color:var(--ink);font-family:Inter,Roboto,'Helvetica Neue',Arial,sans-serif}.topbar{border-bottom:1px solid var(--outline);background:rgba(255,255,255,.94)}.topbar-inner,.content{width:min(1500px,calc(100% - 2rem));margin:0 auto}.topbar-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 0}.brand{display:flex;align-items:center;gap:.8rem}.brand svg{width:44px;height:44px}.brand rect{fill:#f8fbfd;stroke:#b8ced9;stroke-width:1.5}.brand path{fill:none;stroke:var(--brand);stroke-linecap:round;stroke-linejoin:round;stroke-width:2.4}h1,h2,p{margin:0}.brand h1{color:var(--brand-strong);font-size:1.55rem;line-height:1.1}.brand p,.panel-header p{color:var(--muted-ink);font-size:.9rem}.content{display:grid;gap:1rem;padding:1rem 0 2rem}.workspace{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.editor-panel,.results,.empty-state{border:1px solid var(--outline);border-radius:8px;background:var(--surface)}.editor-panel,.results{display:grid;gap:.85rem;padding:1rem}.panel-header,.results-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.panel-header h2,.results-header h2{font-size:1rem;line-height:1.2}.source-box{min-height:220px;margin:0;padding:.8rem;border:1px solid var(--outline);border-radius:8px;background:var(--raised-surface);white-space:pre-wrap;overflow-wrap:anywhere;font-family:SFMono-Regular,Consolas,monospace;font-size:.86rem;line-height:1.45}.diff-table{display:grid;overflow:auto;border:1px solid var(--outline);border-radius:8px}.diff-table-head,.diff-row{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr))}.diff-table-head{position:sticky;top:0;background:var(--muted-surface);color:var(--muted-ink);font-size:.78rem;font-weight:800;text-transform:uppercase}.diff-table-head span{padding:.65rem .85rem}.diff-row{border-top:1px solid var(--outline)}.result-cell{display:grid;grid-template-columns:3.25rem minmax(0,1fr);min-width:0}.result-cell+.result-cell{border-left:1px solid var(--outline)}.result-line-number{display:flex;align-items:flex-start;justify-content:flex-end;min-height:2.35rem;padding:.7rem .7rem .7rem .5rem;background:var(--muted-surface);color:var(--muted-ink);font-family:SFMono-Regular,Consolas,monospace;font-size:.78rem;line-height:1.45;user-select:none}.diff-row pre{min-height:2.35rem;margin:0;padding:.7rem .85rem;overflow-wrap:anywhere;white-space:pre-wrap;font-family:SFMono-Regular,Consolas,monospace;font-size:.86rem;line-height:1.45}.word{border-radius:4px}.added{background:var(--added-bg);color:var(--added-ink)}.removed,.changed{background:var(--removed-bg);color:var(--removed-ink)}.empty-state{display:flex;align-items:center;justify-content:center;min-height:96px;padding:1rem;color:var(--brand-strong);font-weight:700;background:color-mix(in srgb,var(--brand) 8%,var(--surface))}@media(max-width:880px){.topbar-inner{align-items:flex-start;flex-direction:column}.workspace{grid-template-columns:1fr}.diff-table-head,.diff-row{grid-template-columns:minmax(220px,1fr) minmax(220px,1fr)}}</style>")
	buffer.WriteString("</head><body>")
	buffer.WriteString("<header class=\"topbar\"><div class=\"topbar-inner\"><div class=\"brand\">")
	buffer.WriteString(brandSVG())
	buffer.WriteString("<div><h1>TraceLine</h1><p>Compare text blocks line by line.</p></div></div></div></header>")
	buffer.WriteString("<main class=\"content\">")
	buffer.WriteString("<section class=\"workspace\" aria-label=\"Comparison workspace\">")
	buffer.WriteString(sourcePanel("Left", result.LeftText))
	buffer.WriteString(sourcePanel("Right", result.RightText))
	buffer.WriteString("</section>")
	buffer.WriteString("<section class=\"results\" aria-label=\"Comparison result\"><div class=\"results-header\"><h2>Comparison result</h2></div>")
	if identical(result) {
		buffer.WriteString("<div class=\"empty-state\">Texts are identical.</div>")
	} else {
		buffer.WriteString("<div class=\"diff-table\" role=\"table\" aria-label=\"Side-by-side comparison\"><div class=\"diff-table-head\" role=\"row\"><span role=\"columnheader\">Left text</span><span role=\"columnheader\">Right text</span></div>")
		leftLine := 1
		rightLine := 1
		for _, operation := range result.Operations {
			leftNumber := ""
			rightNumber := ""
			if operation.Type != diff.OperationAdd {
				leftNumber = strconv.Itoa(leftLine)
				leftLine++
			}
			if operation.Type != diff.OperationRemove {
				rightNumber = strconv.Itoa(rightLine)
				rightLine++
			}
			buffer.WriteString("<div class=\"diff-row\" role=\"row\">")
			buffer.WriteString(resultCell(leftNumber, htmlSegments(operation.LeftSegments, operation.Left)))
			buffer.WriteString(resultCell(rightNumber, htmlSegments(operation.RightSegments, operation.Right)))
			buffer.WriteString("</div>")
		}
		buffer.WriteString("</div>")
	}
	buffer.WriteString("</section></main>")
	buffer.WriteString("</body></html>")
	return buffer.String()
}

func resultCell(lineNumber string, content string) string {
	return "<div class=\"result-cell\" role=\"cell\"><span class=\"result-line-number\">" + html.EscapeString(lineNumber) + "</span><pre>" + content + "</pre></div>"
}

func brandSVG() string {
	return "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><rect x=\"5\" y=\"5\" width=\"38\" height=\"38\" rx=\"12\"></rect><path d=\"M16 17h16M16 24h10M16 31h16\"></path><path d=\"M31 13l5 5-5 5M17 35l-5-5 5-5\"></path></svg>"
}

func sourcePanel(title string, text string) string {
	return fmt.Sprintf("<article class=\"editor-panel\"><div class=\"panel-header\"><div><h2>%s</h2><p>%s</p></div></div><pre class=\"source-box\">%s</pre></article>", html.EscapeString(title), stats(text), html.EscapeString(text))
}

func stats(text string) string {
	trimmed := strings.TrimSpace(text)
	words := 0
	if trimmed != "" {
		words = len(strings.Fields(trimmed))
	}
	lines := 0
	if text != "" {
		lines = len(strings.Split(text, "\n"))
	}
	return fmt.Sprintf("%d lines · %d words · %d characters", lines, words, len([]rune(text)))
}

func identical(result diff.Result) bool {
	if len(result.Operations) == 0 {
		return false
	}
	for _, operation := range result.Operations {
		if operation.Type != diff.OperationEqual {
			return false
		}
	}
	return true
}

func htmlSegments(segments []diff.Segment, fallback string) string {
	if len(segments) == 0 {
		return html.EscapeString(fallback)
	}
	var builder strings.Builder
	for _, segment := range segments {
		className := ""
		if segment.Type == diff.OperationAdd {
			className = " added"
		}
		if segment.Type == diff.OperationRemove {
			className = " removed"
		}
		builder.WriteString(fmt.Sprintf("<span class=\"word%s\">%s</span>", className, html.EscapeString(segment.Text)))
	}
	return builder.String()
}
