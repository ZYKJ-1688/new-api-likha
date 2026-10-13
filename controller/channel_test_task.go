package controller

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetTestTasks 获取测试任务列表，支持分页 ?p=页码&page_size=每页条数（上限 100），
// 可组合 ?id=xxx 查单个、?question_group_id=xxx 按问题分组过滤、?channel_id=xxx 按渠道过滤、
// ?type=xxx 按测试类型过滤（1 顺序测试 2 并发测试）
func GetTestTasks(c *gin.Context) {
	id := 0
	if idStr := c.Query("id"); idStr != "" {
		var err error
		if id, err = strconv.Atoi(idStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	groupId := 0
	if groupStr := c.Query("question_group_id"); groupStr != "" {
		var err error
		if groupId, err = strconv.Atoi(groupStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	channelId := 0
	if channelStr := c.Query("channel_id"); channelStr != "" {
		var err error
		if channelId, err = strconv.Atoi(channelStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	taskType := 0
	if typeStr := c.Query("type"); typeStr != "" {
		var err error
		if taskType, err = strconv.Atoi(typeStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	pageInfo := common.GetPageQuery(c)
	tasks, total, err := model.GetTestTasks(id, groupId, channelId, taskType, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     tasks,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

// CreateTestTaskRequest 创建测试任务的固定入参
type CreateTestTaskRequest struct {
	Type                    int      `json:"type"` // 1 顺序测试 2 并发测试
	ChannelId               int      `json:"channel_id"`
	Models                  []string `json:"models"`
	QuestionGroupId         int      `json:"question_group_id"`
	ConsecutiveRequestCount int      `json:"consecutive_request_count"`
	Concurrent              int      `json:"concurrent"` // 并发测试每轮并发数，顺序测试忽略
	TotalCount              int      `json:"total_count"`
}

// maxTestTaskConcurrent 并发测试单轮并发数上限，防止打爆渠道与本机资源
// （每次请求都会真实消耗测试账号配额，大并发即大账单）
const maxTestTaskConcurrent = 50

// CreateTestTask 新增测试任务：对指定渠道 + 一组模型，测试某个问题分组下的全部问题。
// 一个任务内依次执行：每个模型 × 每道题 各测一次，明细行各自记录模型。
func CreateTestTask(c *gin.Context) {
	var request CreateTestTaskRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	if request.Concurrent > maxTestTaskConcurrent {
		common.ApiErrorMsg(c, fmt.Sprintf("并发数不能超过 %d", maxTestTaskConcurrent))
		return
	}
	if request.Type == model.TestTaskTypeConcurrent && request.Concurrent < 1 {
		common.ApiErrorMsg(c, "并发测试必须指定并发数（concurrent >= 1）")
		return
	}
	if request.ChannelId == 0 {
		common.ApiErrorMsg(c, "缺少渠道 ID")
		return
	}
	if request.ChannelId > 0 {
		if _, err := model.CacheGetChannel(request.ChannelId); err != nil {
			common.ApiErrorMsg(c, "渠道不存在")
			return
		}
	}
	if request.ConsecutiveRequestCount < 1 {
		request.ConsecutiveRequestCount = 1
	}

	models := make([]string, 0, len(request.Models))
	for _, m := range request.Models {
		if m = strings.TrimSpace(m); m != "" && !slices.Contains(models, m) {
			models = append(models, m)
		}
	}
	if len(models) == 0 {
		common.ApiErrorMsg(c, "缺少模型名称")
		return
	}
	if request.QuestionGroupId == 0 {
		common.ApiErrorMsg(c, "缺少分组 ID")
		return
	}
	exists, err := model.ExistsQuestionGroup(request.QuestionGroupId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists {
		common.ApiErrorMsg(c, "分组不存在")
		return
	}
	questionCount, err := model.CountQuestionsByGroup(request.QuestionGroupId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totalCount := int(questionCount) * request.ConsecutiveRequestCount

	if request.TotalCount > 0 {
		totalCount = request.TotalCount
	}

	var task *model.TestTask
	for _, m := range models {
		task = &model.TestTask{
			Type:                    request.Type,
			ChannelId:               request.ChannelId,
			Model:                   m,
			QuestionGroupId:         request.QuestionGroupId,
			Concurrent:              request.Concurrent,
			ConsecutiveRequestCount: request.ConsecutiveRequestCount,
			TotalCount:              totalCount,
		}
		task.CreatedTimeText = time.Unix(task.CreatedTime, 0).Format("2006-01-02 15:04:05")
		if err := model.SaveTestTask(task); err != nil {
			common.ApiError(c, err)
			return
		}
	}

	common.ApiSuccess(c, task)
}
