package diff

import "time"

type Mode string

const (
	ModeLine Mode = "line"
)

type Request struct {
	LeftText  string `json:"leftText"`
	RightText string `json:"rightText"`
}

type OperationType string

const (
	OperationEqual  OperationType = "equal"
	OperationAdd    OperationType = "added"
	OperationRemove OperationType = "removed"
	OperationChange OperationType = "changed"
)

type Operation struct {
	Type          OperationType `json:"type"`
	Left          string        `json:"left,omitempty"`
	Right         string        `json:"right,omitempty"`
	LeftSegments  []Segment     `json:"leftSegments,omitempty"`
	RightSegments []Segment     `json:"rightSegments,omitempty"`
	LeftIndex     int           `json:"leftIndex,omitempty"`
	RightIndex    int           `json:"rightIndex,omitempty"`
}

type Segment struct {
	Type OperationType `json:"type"`
	Text string        `json:"text"`
}

type Summary struct {
	SimilarityScore      float64       `json:"similarityScore"`
	AddedCount           int           `json:"addedCount"`
	RemovedCount         int           `json:"removedCount"`
	ChangedCount         int           `json:"changedCount"`
	TotalLines           int           `json:"totalLines"`
	AddedLines           int           `json:"addedLines"`
	RemovedLines         int           `json:"removedLines"`
	ChangedLines         int           `json:"changedLines"`
	TotalWords           int           `json:"totalWords"`
	ChangedWords         int           `json:"changedWords"`
	TotalCharacters      int           `json:"totalCharacters"`
	ChangedCharacters    int           `json:"changedCharacters"`
	ProcessingTime       time.Duration `json:"-"`
	ProcessingTimeMillis int64         `json:"processingTimeMillis"`
}

type Result struct {
	Mode       Mode        `json:"mode"`
	Operations []Operation `json:"operations"`
	Summary    Summary     `json:"summary"`
	LeftText   string      `json:"leftText"`
	RightText  string      `json:"rightText"`
}
