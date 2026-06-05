package diff

import (
	"math"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

func Compare(leftText string, rightText string, mode Mode) Result {
	started := time.Now()
	mode = ModeLine

	leftTokens := tokenize(leftText, mode)
	rightTokens := tokenize(rightText, mode)
	operations := alignLines(leftTokens, rightTokens)

	summary := summarize(leftText, rightText, leftTokens, rightTokens, operations, mode, time.Since(started))
	return Result{
		Mode:       mode,
		Operations: operations,
		Summary:    summary,
		LeftText:   leftText,
		RightText:  rightText,
	}
}

func ValidMode(mode Mode) bool {
	return mode == "" || mode == ModeLine
}

func tokenize(input string, mode Mode) []string {
	if input == "" {
		return []string{}
	}
	return strings.Split(input, "\n")
}

func alignLines(leftLines []string, rightLines []string) []Operation {
	leftLength := len(leftLines)
	rightLength := len(rightLines)
	costs := make([][]float64, leftLength+1)
	steps := make([][]OperationType, leftLength+1)
	for index := range costs {
		costs[index] = make([]float64, rightLength+1)
		steps[index] = make([]OperationType, rightLength+1)
	}

	for i := 1; i <= leftLength; i++ {
		costs[i][0] = float64(i)
		steps[i][0] = OperationRemove
	}
	for j := 1; j <= rightLength; j++ {
		costs[0][j] = float64(j)
		steps[0][j] = OperationAdd
	}

	for i := 1; i <= leftLength; i++ {
		for j := 1; j <= rightLength; j++ {
			substitutionCost := lineSubstitutionCost(leftLines[i-1], rightLines[j-1])
			bestCost := costs[i-1][j-1] + substitutionCost
			bestStep := OperationChange
			if substitutionCost == 0 {
				bestStep = OperationEqual
			}

			removeCost := costs[i-1][j] + 1
			if removeCost < bestCost {
				bestCost = removeCost
				bestStep = OperationRemove
			}

			addCost := costs[i][j-1] + 1
			if addCost < bestCost {
				bestCost = addCost
				bestStep = OperationAdd
			}

			costs[i][j] = bestCost
			steps[i][j] = bestStep
		}
	}

	operations := make([]Operation, 0, leftLength+rightLength)
	for i, j := leftLength, rightLength; i > 0 || j > 0; {
		step := steps[i][j]
		switch {
		case i > 0 && j > 0 && (step == OperationEqual || step == OperationChange):
			operationType := OperationChange
			if leftLines[i-1] == rightLines[j-1] {
				operationType = OperationEqual
			}
			operations = append(operations, Operation{
				Type:          operationType,
				Left:          leftLines[i-1],
				Right:         rightLines[j-1],
				LeftSegments:  lineSegments(operationType, leftLines[i-1], true),
				RightSegments: lineSegments(operationType, rightLines[j-1], false),
				LeftIndex:     i - 1,
				RightIndex:    j - 1,
			})
			if operationType == OperationChange {
				operations[len(operations)-1].LeftSegments, operations[len(operations)-1].RightSegments = changedWordSegments(leftLines[i-1], rightLines[j-1])
			}
			i--
			j--
		case i > 0 && (j == 0 || step == OperationRemove):
			operations = append(operations, Operation{
				Type:         OperationRemove,
				Left:         leftLines[i-1],
				LeftSegments: lineSegments(OperationRemove, leftLines[i-1], true),
				LeftIndex:    i - 1,
			})
			i--
		default:
			operations = append(operations, Operation{
				Type:          OperationAdd,
				Right:         rightLines[j-1],
				RightSegments: lineSegments(OperationAdd, rightLines[j-1], false),
				RightIndex:    j - 1,
			})
			j--
		}
	}

	for left, right := 0, len(operations)-1; left < right; left, right = left+1, right-1 {
		operations[left], operations[right] = operations[right], operations[left]
	}
	return operations
}

func lineSubstitutionCost(left string, right string) float64 {
	if left == right {
		return 0
	}
	leftRunes := []rune(left)
	rightRunes := []rune(right)
	longest := max(len(leftRunes), len(rightRunes))
	if longest == 0 {
		return 0
	}
	return float64(levenshteinRunes(leftRunes, rightRunes)) / float64(longest)
}

func levenshteinRunes(left []rune, right []rune) int {
	if len(left) == 0 {
		return len(right)
	}
	if len(right) == 0 {
		return len(left)
	}

	previous := make([]int, len(right)+1)
	current := make([]int, len(right)+1)
	for j := range previous {
		previous[j] = j
	}

	for i := 1; i <= len(left); i++ {
		current[0] = i
		for j := 1; j <= len(right); j++ {
			cost := 0
			if left[i-1] != right[j-1] {
				cost = 1
			}
			current[j] = min(
				previous[j]+1,
				min(current[j-1]+1, previous[j-1]+cost),
			)
		}
		previous, current = current, previous
	}
	return previous[len(right)]
}

func lineSegments(operationType OperationType, text string, leftSide bool) []Segment {
	segmentType := operationType
	if operationType == OperationChange {
		if leftSide {
			segmentType = OperationRemove
		}
		if !leftSide {
			segmentType = OperationAdd
		}
	}
	if text == "" {
		return nil
	}
	return []Segment{{Type: segmentType, Text: text}}
}

func changedWordSegments(left string, right string) ([]Segment, []Segment) {
	leftTokens := textParts(left)
	rightTokens := textParts(right)
	operations := lcs(leftTokens, rightTokens)
	leftSegments := make([]Segment, 0, len(operations))
	rightSegments := make([]Segment, 0, len(operations))

	for _, operation := range operations {
		switch operation.Type {
		case OperationEqual:
			leftSegments = append(leftSegments, Segment{Type: OperationEqual, Text: operation.Left})
			rightSegments = append(rightSegments, Segment{Type: OperationEqual, Text: operation.Right})
		case OperationRemove:
			leftSegments = append(leftSegments, Segment{Type: OperationRemove, Text: operation.Left})
		case OperationAdd:
			rightSegments = append(rightSegments, Segment{Type: OperationAdd, Text: operation.Right})
		}
	}

	return mergeSegments(leftSegments), mergeSegments(rightSegments)
}

func textParts(input string) []string {
	if input == "" {
		return nil
	}
	parts := make([]string, 0)
	var builder strings.Builder
	previousClass := -1
	for _, value := range input {
		currentClass := runeClass(value)
		if previousClass != -1 && previousClass != currentClass {
			parts = append(parts, builder.String())
			builder.Reset()
		}
		builder.WriteRune(value)
		previousClass = currentClass
	}
	if builder.Len() > 0 {
		parts = append(parts, builder.String())
	}
	return parts
}

func runeClass(value rune) int {
	switch {
	case unicode.IsLetter(value) || unicode.IsNumber(value):
		return 0
	case unicode.IsSpace(value):
		return 1
	default:
		return 2
	}
}

func mergeSegments(segments []Segment) []Segment {
	if len(segments) == 0 {
		return nil
	}
	merged := []Segment{segments[0]}
	for _, segment := range segments[1:] {
		last := &merged[len(merged)-1]
		if last.Type == segment.Type {
			last.Text += segment.Text
			continue
		}
		merged = append(merged, segment)
	}
	return merged
}

func lcs(leftTokens []string, rightTokens []string) []Operation {
	leftLength := len(leftTokens)
	rightLength := len(rightTokens)
	dp := make([][]int, leftLength+1)
	for index := range dp {
		dp[index] = make([]int, rightLength+1)
	}

	for i := 1; i <= leftLength; i++ {
		for j := 1; j <= rightLength; j++ {
			if leftTokens[i-1] == rightTokens[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
				continue
			}
			dp[i][j] = max(dp[i-1][j], dp[i][j-1])
		}
	}

	operations := make([]Operation, 0, leftLength+rightLength)
	i, j := leftLength, rightLength
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && leftTokens[i-1] == rightTokens[j-1] {
			if dp[i][j-1] == dp[i][j] {
				operations = append(operations, Operation{
					Type:       OperationAdd,
					Right:      rightTokens[j-1],
					RightIndex: j - 1,
				})
				j--
				continue
			}
			if dp[i-1][j] == dp[i][j] {
				operations = append(operations, Operation{
					Type:      OperationRemove,
					Left:      leftTokens[i-1],
					LeftIndex: i - 1,
				})
				i--
				continue
			}
			operations = append(operations, Operation{
				Type:       OperationEqual,
				Left:       leftTokens[i-1],
				Right:      rightTokens[j-1],
				LeftIndex:  i - 1,
				RightIndex: j - 1,
			})
			i--
			j--
			continue
		}
		if j > 0 && (i == 0 || dp[i][j-1] >= dp[i-1][j]) {
			operations = append(operations, Operation{
				Type:       OperationAdd,
				Right:      rightTokens[j-1],
				RightIndex: j - 1,
			})
			j--
			continue
		}
		operations = append(operations, Operation{
			Type:      OperationRemove,
			Left:      leftTokens[i-1],
			LeftIndex: i - 1,
		})
		i--
	}

	for left, right := 0, len(operations)-1; left < right; left, right = left+1, right-1 {
		operations[left], operations[right] = operations[right], operations[left]
	}
	return operations
}

func summarize(leftText string, rightText string, leftTokens []string, rightTokens []string, operations []Operation, mode Mode, elapsed time.Duration) Summary {
	equalTokens := 0
	added := 0
	removed := 0
	changed := 0
	for _, operation := range operations {
		switch operation.Type {
		case OperationEqual:
			equalTokens += max(tokenWeight(operation.Left, mode), 1)
		case OperationAdd:
			added += max(tokenWeight(operation.Right, mode), 1)
		case OperationRemove:
			removed += max(tokenWeight(operation.Left, mode), 1)
		case OperationChange:
			changed += max(tokenWeight(operation.Left, mode), tokenWeight(operation.Right, mode))
		}
	}

	totalTokens := max(len(leftTokens), len(rightTokens))
	if totalTokens == 0 {
		equalTokens = 1
		totalTokens = 1
	}
	similarity := (float64(equalTokens) / float64(totalTokens)) * 100
	similarity = math.Max(0, math.Min(100, similarity))

	leftLines := lineCount(leftText)
	rightLines := lineCount(rightText)
	leftWords := len(strings.Fields(leftText))
	rightWords := len(strings.Fields(rightText))
	leftCharacters := utf8.RuneCountInString(leftText)
	rightCharacters := utf8.RuneCountInString(rightText)

	return Summary{
		SimilarityScore:      round(similarity),
		AddedCount:           added,
		RemovedCount:         removed,
		ChangedCount:         changed,
		TotalLines:           max(leftLines, rightLines),
		AddedLines:           max(0, rightLines-leftLines),
		RemovedLines:         max(0, leftLines-rightLines),
		ChangedLines:         changedLineEstimate(operations),
		TotalWords:           max(leftWords, rightWords),
		ChangedWords:         added + removed + changed,
		TotalCharacters:      max(leftCharacters, rightCharacters),
		ChangedCharacters:    changedCharacterEstimate(operations),
		ProcessingTime:       elapsed,
		ProcessingTimeMillis: elapsed.Milliseconds(),
	}
}

func tokenWeight(value string, mode Mode) int {
	if value == "" {
		return 0
	}
	return lineCount(value)
}

func lineCount(value string) int {
	if value == "" {
		return 0
	}
	return len(strings.Split(value, "\n"))
}

func changedLineEstimate(operations []Operation) int {
	count := 0
	for _, operation := range operations {
		if operation.Type != OperationChange {
			continue
		}
		count += max(lineCount(operation.Left), lineCount(operation.Right))
	}
	return count
}

func changedCharacterEstimate(operations []Operation) int {
	count := 0
	for _, operation := range operations {
		switch operation.Type {
		case OperationAdd:
			count += utf8.RuneCountInString(operation.Right)
		case OperationRemove:
			count += utf8.RuneCountInString(operation.Left)
		case OperationChange:
			count += max(utf8.RuneCountInString(operation.Left), utf8.RuneCountInString(operation.Right))
		}
	}
	return count
}

func round(value float64) float64 {
	return math.Round(value*100) / 100
}
