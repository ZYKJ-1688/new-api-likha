package controller

import (
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetChannelTestTaskDetails 获取测试任务明细列表，支持分页 ?p=页码&page_size=每页条数（上限 100），
// 可组合 ?task_id=xxx 过滤所属任务
func GetChannelTestTaskDetails(c *gin.Context) {
	taskId := 0
	if taskStr := c.Query("task_id"); taskStr != "" {
		var err error
		if taskId, err = strconv.Atoi(taskStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	pageInfo := common.GetPageQuery(c)
	details, total, err := model.GetChannelTestTaskDetail(taskId, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     details,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

// testTaskModelStats 按模型维度聚合的测试结果统计（延迟指标以秒为单位，保留毫秒级精度）
type testTaskModelStats struct {
	Model       string  `json:"model"`
	Total       int     `json:"total"`
	Success     int     `json:"success"`
	Fail        int     `json:"fail"`
	Fastest     float64 `json:"fastest"`
	Slowest     float64 `json:"slowest"`
	Avg         float64 `json:"avg"`
	P50         float64 `json:"p50"`
	P90         float64 `json:"p90"`
	P99         float64 `json:"p99"`
	TotalToken  int     `json:"total_token"`
	InputToken  int     `json:"input_token"`
	OutputToken int     `json:"output_token"`
	CachedToken int     `json:"cached_token"`
}

// GetChannelTestTaskStats 按模型维度统计测试任务的响应质量：
// GET /api/test_task_detail/stats?task_id=xxx
// 延迟指标（最快/最慢/平均/P50/P90/P99）以秒为单位输出，只统计成功请求——
// 失败请求的耗时反映的是报错快慢而非模型响应速度；token 汇总统计全部请求。
// 顺序、并发两种模式的明细均可统计，并发模式更能体现 P99 尾部延迟。
func GetChannelTestTaskStats(c *gin.Context) {
	taskId, err := strconv.Atoi(c.Query("task_id"))
	if err != nil || taskId <= 0 {
		common.ApiErrorMsg(c, "缺少任务 ID")
		return
	}
	details, _, err := model.GetChannelTestTaskDetail(taskId, 0, 0)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	grouped := make(map[string][]model.TestTaskDetailInfo)
	for _, d := range details {
		grouped[d.Model] = append(grouped[d.Model], d)
	}
	items := make([]testTaskModelStats, 0, len(grouped))
	for modelName, rows := range grouped {
		stats := testTaskModelStats{Model: modelName, Total: len(rows)}
		latencies := make([]int, 0, len(rows))
		for _, row := range rows {
			if row.Status == model.TestTaskDetailStatusSuccess {
				stats.Success++
				latencies = append(latencies, row.TotalTime)
			} else {
				stats.Fail++
			}
			stats.TotalToken += row.TotalToken
			stats.InputToken += row.InputToken
			stats.OutputToken += row.OutputToken
			stats.CachedToken += row.CachedToken
		}
		if len(latencies) > 0 {
			slices.Sort(latencies)
			// 明细里的 TotalTime 存的是毫秒，统计输出统一换算成秒
			stats.Fastest = float64(latencies[0]) / 1000
			stats.Slowest = float64(latencies[len(latencies)-1]) / 1000
			totalMs := 0
			for _, v := range latencies {
				totalMs += v
			}
			stats.Avg = float64(totalMs) / float64(len(latencies)) / 1000
			stats.P50 = float64(latencyPercentile(latencies, 50)) / 1000
			stats.P90 = float64(latencyPercentile(latencies, 90)) / 1000
			stats.P99 = float64(latencyPercentile(latencies, 99)) / 1000
		}
		items = append(items, stats)
	}
	// map 遍历无序，按模型名排序保证响应稳定
	slices.SortFunc(items, func(a, b testTaskModelStats) int {
		return strings.Compare(a.Model, b.Model)
	})
	common.ApiSuccess(c, gin.H{
		"task_id": taskId,
		"items":   items,
	})
}

// latencyPercentile 从升序延迟切片取 nearest-rank 分位数：第 ceil(p*n) 个值（1 起算）
func latencyPercentile(sorted []int, p int) int {
	if len(sorted) == 0 {
		return 0
	}
	rank := (p*len(sorted) + 99) / 100
	return sorted[rank-1]
}
