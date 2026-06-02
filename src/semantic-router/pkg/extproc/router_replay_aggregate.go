package extproc

import (
	"net/url"
	"sort"
	"time"

	ext_proc "github.com/envoyproxy/go-control-plane/envoy/service/ext_proc/v3"

	"github.com/vllm-project/semantic-router/src/semantic-router/pkg/routerreplay"
)

type routerReplayAggregateResponse struct {
	Object               string                            `json:"object"`
	RecordCount          int                               `json:"record_count"`
	Summary              routerReplayAggregateCostSummary  `json:"summary"`
	ModelSelection       []routerReplayAggregateValue      `json:"model_selection"`
	DecisionDistribution []routerReplayAggregateValue      `json:"decision_distribution"`
	SignalDistribution   []routerReplayAggregateValue      `json:"signal_distribution"`
	TokenVolume          routerReplayAggregateTokenVolume  `json:"token_volume"`
	TokenBreakdown       routerReplayAggregateTokenBuckets `json:"token_breakdown"`
	CostByModel          []routerReplayAggregateCostEntry  `json:"cost_by_model"`
	RequestTimeline      routerReplayRequestTimeline       `json:"request_timeline"`
	TokenTimeline        routerReplayTokenTimeline         `json:"token_timeline"`
	AvailableDecisions   []string                          `json:"available_decisions"`
	AvailableModels      []string                          `json:"available_models"`
}

type routerReplayAggregateCostEntry struct {
	Name         string  `json:"name"`
	ActualCost   float64 `json:"actual_cost"`
	BaselineCost float64 `json:"baseline_cost"`
}

type routerReplayRequestTimelinePoint struct {
	Timestamp string         `json:"timestamp"`
	Counts    map[string]int `json:"counts"`
}

type routerReplayRequestTimeline struct {
	BucketInterval string                             `json:"bucket_interval"`
	Models         []string                           `json:"models"`
	Points         []routerReplayRequestTimelinePoint `json:"points"`
}

type routerReplayTokenTimelinePoint struct {
	Timestamp    string `json:"timestamp"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
}

type routerReplayTokenTimeline struct {
	BucketInterval string                           `json:"bucket_interval"`
	Points         []routerReplayTokenTimelinePoint `json:"points"`
}

type routerReplayAggregateCostSummary struct {
	TotalSaved          float64 `json:"total_saved"`
	BaselineSpend       float64 `json:"baseline_spend"`
	ActualSpend         float64 `json:"actual_spend"`
	Currency            string  `json:"currency,omitempty"`
	CostRecordCount     int     `json:"cost_record_count"`
	ExcludedRecordCount int     `json:"excluded_record_count"`
}

type routerReplayAggregateValue struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type routerReplayAggregateTokenVolume struct {
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	TotalTokens         int `json:"total_tokens"`
	ExcludedRecordCount int `json:"excluded_record_count"`
}

type routerReplayAggregateTokenBuckets struct {
	ByDecision      []routerReplayAggregateTokenEntry `json:"by_decision"`
	BySelectedModel []routerReplayAggregateTokenEntry `json:"by_selected_model"`
}

type routerReplayAggregateTokenEntry struct {
	Name         string `json:"name"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
	TotalTokens  int    `json:"total_tokens"`
}

func (r *OpenAIRouter) handleRouterReplayAggregateAPI(
	method string,
	rawQuery string,
) *ext_proc.ProcessingResponse {
	if method != "GET" {
		return r.createErrorResponse(405, "method not allowed")
	}

	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return r.createErrorResponse(400, err.Error())
	}
	filters, err := parseRouterReplayFilters(values)
	if err != nil {
		return r.createErrorResponse(400, err.Error())
	}

	allRecords := r.collectRouterReplayRecords()
	filteredRecords := filterRouterReplayRecords(allRecords, filters)
	payload := buildRouterReplayAggregatePayload(allRecords, filteredRecords)
	return r.createRouterReplayJSONResponse(200, payload)
}

func buildRouterReplayAggregatePayload(
	allRecords []routerreplay.RoutingRecord,
	filteredRecords []routerreplay.RoutingRecord,
) routerReplayAggregateResponse {
	return routerReplayAggregateResponse{
		Object:               "router_replay.aggregate",
		RecordCount:          len(filteredRecords),
		Summary:              buildRouterReplayAggregateCostSummary(filteredRecords),
		ModelSelection:       buildRouterReplayModelSelection(filteredRecords),
		DecisionDistribution: buildRouterReplayDecisionDistribution(filteredRecords),
		SignalDistribution:   buildRouterReplaySignalDistribution(filteredRecords),
		TokenVolume:          buildRouterReplayTokenVolume(filteredRecords),
		TokenBreakdown:       buildRouterReplayTokenBreakdown(filteredRecords),
		CostByModel:          buildRouterReplayCostByModel(filteredRecords),
		RequestTimeline:      buildRouterReplayRequestTimeline(filteredRecords),
		TokenTimeline:        buildRouterReplayTokenTimeline(filteredRecords),
		AvailableDecisions:   collectRouterReplayDecisionOptions(allRecords),
		AvailableModels:      collectRouterReplayModelOptions(allRecords),
	}
}

func buildRouterReplayAggregateCostSummary(
	records []routerreplay.RoutingRecord,
) routerReplayAggregateCostSummary {
	summary := routerReplayAggregateCostSummary{}
	for _, record := range records {
		if record.ActualCost == nil || record.BaselineCost == nil || record.CostSavings == nil {
			continue
		}

		summary.TotalSaved += *record.CostSavings
		summary.BaselineSpend += *record.BaselineCost
		summary.ActualSpend += *record.ActualCost
		if summary.Currency == "" && record.Currency != nil {
			summary.Currency = *record.Currency
		}
		summary.CostRecordCount++
	}
	summary.ExcludedRecordCount = len(records) - summary.CostRecordCount
	return summary
}

func buildRouterReplayModelSelection(
	records []routerreplay.RoutingRecord,
) []routerReplayAggregateValue {
	counts := make(map[string]int)
	for _, record := range records {
		name := record.SelectedModel
		if name == "" {
			name = "Unknown"
		}
		counts[name]++
	}
	return sortRouterReplayAggregateValues(counts, 10)
}

func buildRouterReplayDecisionDistribution(
	records []routerreplay.RoutingRecord,
) []routerReplayAggregateValue {
	counts := make(map[string]int)
	for _, record := range records {
		name := record.Decision
		if name == "" {
			name = "Unknown"
		}
		counts[name]++
	}
	return sortRouterReplayAggregateValues(counts, 0)
}

func buildRouterReplaySignalDistribution(
	records []routerreplay.RoutingRecord,
) []routerReplayAggregateValue {
	counts := make(map[string]int)
	for _, record := range records {
		if n := len(record.Signals.Keyword); n > 0 {
			counts["keyword"] += n
		}
		if n := len(record.Signals.Embedding); n > 0 {
			counts["embedding"] += n
		}
		if n := len(record.Signals.Domain); n > 0 {
			counts["domain"] += n
		}
		if n := len(record.Signals.FactCheck); n > 0 {
			counts["fact_check"] += n
		}
		if n := len(record.Signals.UserFeedback); n > 0 {
			counts["user_feedback"] += n
		}
		if n := len(record.Signals.Reask); n > 0 {
			counts["reask"] += n
		}
		if n := len(record.Signals.Preference); n > 0 {
			counts["preference"] += n
		}
		if n := len(record.Signals.Language); n > 0 {
			counts["language"] += n
		}
		if n := len(record.Signals.Context); n > 0 {
			counts["context"] += n
		}
		if n := len(record.Signals.Complexity); n > 0 {
			counts["complexity"] += n
		}
	}
	return sortRouterReplayAggregateValues(counts, 0)
}

func buildRouterReplayTokenVolume(
	records []routerreplay.RoutingRecord,
) routerReplayAggregateTokenVolume {
	var volume routerReplayAggregateTokenVolume
	usageRecordCount := 0

	for _, record := range records {
		promptTokens, completionTokens, totalTokens, hasUsage := routerReplayUsageTriplet(record)
		if !hasUsage {
			continue
		}

		volume.InputTokens += promptTokens
		volume.OutputTokens += completionTokens
		volume.TotalTokens += totalTokens
		usageRecordCount++
	}

	volume.ExcludedRecordCount = len(records) - usageRecordCount
	return volume
}

func buildRouterReplayTokenBreakdown(
	records []routerreplay.RoutingRecord,
) routerReplayAggregateTokenBuckets {
	decisionBuckets := make(map[string]*routerReplayAggregateTokenEntry)
	modelBuckets := make(map[string]*routerReplayAggregateTokenEntry)

	for _, record := range records {
		promptTokens, completionTokens, totalTokens, hasUsage := routerReplayUsageTriplet(record)
		if !hasUsage {
			continue
		}

		accumulateRouterReplayTokenEntry(
			decisionBuckets,
			routerReplayFallbackName(record.Decision),
			promptTokens,
			completionTokens,
			totalTokens,
		)
		accumulateRouterReplayTokenEntry(
			modelBuckets,
			routerReplayFallbackName(record.SelectedModel),
			promptTokens,
			completionTokens,
			totalTokens,
		)
	}

	return routerReplayAggregateTokenBuckets{
		ByDecision:      sortRouterReplayTokenEntries(decisionBuckets, 8),
		BySelectedModel: sortRouterReplayTokenEntries(modelBuckets, 8),
	}
}

func buildRouterReplayCostByModel(records []routerreplay.RoutingRecord) []routerReplayAggregateCostEntry {
	type costAccum struct {
		actual   float64
		baseline float64
	}
	buckets := make(map[string]*costAccum)
	for _, record := range records {
		if record.ActualCost == nil || record.BaselineCost == nil {
			continue
		}
		name := routerReplayFallbackName(record.SelectedModel)
		entry, ok := buckets[name]
		if !ok {
			entry = &costAccum{}
			buckets[name] = entry
		}
		entry.actual += *record.ActualCost
		entry.baseline += *record.BaselineCost
	}

	result := make([]routerReplayAggregateCostEntry, 0, len(buckets))
	for name, entry := range buckets {
		result = append(result, routerReplayAggregateCostEntry{
			Name:         name,
			ActualCost:   entry.actual,
			BaselineCost: entry.baseline,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ActualCost == result[j].ActualCost {
			return result[i].Name < result[j].Name
		}
		return result[i].ActualCost > result[j].ActualCost
	})
	return result
}

func autoSelectBucketInterval(records []routerreplay.RoutingRecord) time.Duration {
	if len(records) < 2 {
		return 5 * time.Minute
	}
	oldest := records[len(records)-1].Timestamp
	newest := records[0].Timestamp
	span := newest.Sub(oldest)
	switch {
	case span < 30*time.Minute:
		return time.Minute
	case span < 4*time.Hour:
		return 5 * time.Minute
	case span < 24*time.Hour:
		return 15 * time.Minute
	case span < 3*24*time.Hour:
		return time.Hour
	default:
		return 6 * time.Hour
	}
}

func truncateTimeToBucket(t time.Time, interval time.Duration) time.Time {
	return t.Truncate(interval)
}

func buildRouterReplayRequestTimeline(records []routerreplay.RoutingRecord) routerReplayRequestTimeline {
	if len(records) == 0 {
		return routerReplayRequestTimeline{BucketInterval: "1h", Models: []string{}, Points: []routerReplayRequestTimelinePoint{}}
	}

	interval := autoSelectBucketInterval(records)

	// ordered bucket keys + per-bucket model counts
	type bucketKey = string
	bucketOrder := make([]bucketKey, 0)
	bucketData := make(map[bucketKey]map[string]int)
	modelSet := make(map[string]struct{})

	for i := len(records) - 1; i >= 0; i-- {
		record := records[i]
		key := truncateTimeToBucket(record.Timestamp, interval).UTC().Format(time.RFC3339)
		model := routerReplayFallbackName(record.SelectedModel)
		modelSet[model] = struct{}{}

		if _, exists := bucketData[key]; !exists {
			bucketData[key] = make(map[string]int)
			bucketOrder = append(bucketOrder, key)
		}
		bucketData[key][model]++
	}

	points := make([]routerReplayRequestTimelinePoint, 0, len(bucketOrder))
	for _, key := range bucketOrder {
		points = append(points, routerReplayRequestTimelinePoint{
			Timestamp: key,
			Counts:    bucketData[key],
		})
	}

	models := sortRouterReplayOptionSet(modelSet)

	intervalLabel := "1m"
	switch interval {
	case 5 * time.Minute:
		intervalLabel = "5m"
	case 15 * time.Minute:
		intervalLabel = "15m"
	case time.Hour:
		intervalLabel = "1h"
	case 6 * time.Hour:
		intervalLabel = "6h"
	case 24 * time.Hour:
		intervalLabel = "1d"
	}

	return routerReplayRequestTimeline{
		BucketInterval: intervalLabel,
		Models:         models,
		Points:         points,
	}
}

func buildRouterReplayTokenTimeline(records []routerreplay.RoutingRecord) routerReplayTokenTimeline {
	if len(records) == 0 {
		return routerReplayTokenTimeline{BucketInterval: "1h", Points: []routerReplayTokenTimelinePoint{}}
	}

	interval := autoSelectBucketInterval(records)

	type tokenAccum struct {
		input  int
		output int
	}
	bucketOrder := make([]string, 0)
	bucketData := make(map[string]*tokenAccum)

	for i := len(records) - 1; i >= 0; i-- {
		record := records[i]
		promptTokens, completionTokens, _, hasUsage := routerReplayUsageTriplet(record)
		if !hasUsage {
			continue
		}
		key := truncateTimeToBucket(record.Timestamp, interval).UTC().Format(time.RFC3339)
		if _, exists := bucketData[key]; !exists {
			bucketData[key] = &tokenAccum{}
			bucketOrder = append(bucketOrder, key)
		}
		bucketData[key].input += promptTokens
		bucketData[key].output += completionTokens
	}

	points := make([]routerReplayTokenTimelinePoint, 0, len(bucketOrder))
	for _, key := range bucketOrder {
		acc := bucketData[key]
		points = append(points, routerReplayTokenTimelinePoint{
			Timestamp:    key,
			InputTokens:  acc.input,
			OutputTokens: acc.output,
		})
	}

	intervalLabel := "1m"
	switch interval {
	case 5 * time.Minute:
		intervalLabel = "5m"
	case 15 * time.Minute:
		intervalLabel = "15m"
	case time.Hour:
		intervalLabel = "1h"
	case 6 * time.Hour:
		intervalLabel = "6h"
	case 24 * time.Hour:
		intervalLabel = "1d"
	}

	return routerReplayTokenTimeline{
		BucketInterval: intervalLabel,
		Points:         points,
	}
}

func routerReplayUsageTriplet(record routerreplay.RoutingRecord) (int, int, int, bool) {
	promptTokens := 0
	completionTokens := 0
	hasPrompt := record.PromptTokens != nil
	hasCompletion := record.CompletionTokens != nil
	if hasPrompt {
		promptTokens = *record.PromptTokens
	}
	if hasCompletion {
		completionTokens = *record.CompletionTokens
	}

	if record.TotalTokens != nil {
		return promptTokens, completionTokens, *record.TotalTokens, true
	}
	if hasPrompt || hasCompletion {
		return promptTokens, completionTokens, promptTokens + completionTokens, true
	}
	return 0, 0, 0, false
}

func accumulateRouterReplayTokenEntry(
	buckets map[string]*routerReplayAggregateTokenEntry,
	name string,
	inputTokens int,
	outputTokens int,
	totalTokens int,
) {
	entry, ok := buckets[name]
	if !ok {
		entry = &routerReplayAggregateTokenEntry{Name: name}
		buckets[name] = entry
	}
	entry.InputTokens += inputTokens
	entry.OutputTokens += outputTokens
	entry.TotalTokens += totalTokens
}

func sortRouterReplayAggregateValues(
	counts map[string]int,
	limit int,
) []routerReplayAggregateValue {
	values := make([]routerReplayAggregateValue, 0, len(counts))
	for name, value := range counts {
		values = append(values, routerReplayAggregateValue{Name: name, Value: value})
	}
	sort.Slice(values, func(i, j int) bool {
		if values[i].Value == values[j].Value {
			return values[i].Name < values[j].Name
		}
		return values[i].Value > values[j].Value
	})
	if limit > 0 && len(values) > limit {
		return values[:limit]
	}
	return values
}

func sortRouterReplayTokenEntries(
	buckets map[string]*routerReplayAggregateTokenEntry,
	limit int,
) []routerReplayAggregateTokenEntry {
	values := make([]routerReplayAggregateTokenEntry, 0, len(buckets))
	for _, entry := range buckets {
		values = append(values, *entry)
	}
	sort.Slice(values, func(i, j int) bool {
		if values[i].TotalTokens == values[j].TotalTokens {
			return values[i].Name < values[j].Name
		}
		return values[i].TotalTokens > values[j].TotalTokens
	})
	if limit > 0 && len(values) > limit {
		return values[:limit]
	}
	return values
}

func collectRouterReplayDecisionOptions(records []routerreplay.RoutingRecord) []string {
	values := make(map[string]struct{})
	for _, record := range records {
		if record.Decision != "" {
			values[record.Decision] = struct{}{}
		}
	}
	return sortRouterReplayOptionSet(values)
}

func collectRouterReplayModelOptions(records []routerreplay.RoutingRecord) []string {
	values := make(map[string]struct{})
	for _, record := range records {
		if record.SelectedModel != "" {
			values[record.SelectedModel] = struct{}{}
		}
		if record.OriginalModel != "" {
			values[record.OriginalModel] = struct{}{}
		}
	}
	return sortRouterReplayOptionSet(values)
}

func sortRouterReplayOptionSet(values map[string]struct{}) []string {
	options := make([]string, 0, len(values))
	for value := range values {
		options = append(options, value)
	}
	sort.Strings(options)
	return options
}

func routerReplayFallbackName(value string) string {
	if value == "" {
		return "Unknown"
	}
	return value
}
