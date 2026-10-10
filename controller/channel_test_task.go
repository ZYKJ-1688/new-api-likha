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
	if request.ChannelId == 0 && request.Type != model.TestTaskTypeVerify {
		common.ApiErrorMsg(c, "缺少渠道 ID")
		return
	}
	if request.ChannelId > 0 {
		if _, err := model.CacheGetChannel(request.ChannelId); err != nil {
			common.ApiErrorMsg(c, "渠道不存在")
			return
		}
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
	totalCount := len(models) * int(questionCount)
	if request.Type == model.TestTaskTypeConcurrent {
		// 并发模式：每个 模型×问题 组合发 concurrent 个请求
		totalCount = request.TotalCount * len(models)
	}

	var task *model.TestTask
	if request.Type == model.TestTaskTypeVerify {
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
	} else {
		task = &model.TestTask{
			Type:                    request.Type,
			ChannelId:               request.ChannelId,
			Model:                   strings.Join(models, ","),
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

	// 后台异步执行具体测试，接口立即返回任务记录
	// go executeTestTask(task.Id)
	common.ApiSuccess(c, task)
}

// // executeTestTask 在后台 goroutine 中逐题执行渠道测试：
// // 每题调用 testChannel（与渠道测试接口同一链路），写入明细行并累计任务计数。
// // 不依赖请求生命周期（context 用 Background）；进程重启时未完成的任务会停留在执行中状态。
// func executeTestTask(taskId int) {
// 	defer func() {
// 		if r := recover(); r != nil {
// 			common.SysError(fmt.Sprintf("test task %d panicked: %v", taskId, r))
// 		}
// 	}()
// 	common.SysLog("异步执行任务开始")

// 	tasks, _, err := model.GetTestTasks(taskId, 0, 0, 0, 0, 0)
// 	if err != nil {
// 		common.SysError(fmt.Sprintf("load test task %d failed: %s", taskId, err.Error()))
// 		return
// 	}
// 	if len(tasks) == 0 {
// 		return
// 	}
// 	// 列表行带连表字段，执行只需要任务本体
// 	task := &tasks[0].TestTask

// 	channel, err := model.CacheGetChannel(task.ChannelId)
// 	if err != nil {
// 		common.SysError(fmt.Sprintf("load channel %d for test task %d failed: %s", task.ChannelId, taskId, err.Error()))
// 		return
// 	}
// 	testUserID, err := resolveChannelTestUserID(nil)
// 	if err != nil {
// 		common.SysError(fmt.Sprintf("resolve test user for test task %d failed: %s", taskId, err.Error()))
// 		return
// 	}
// 	questions, _, err := model.GetQuestions(0, task.QuestionGroupId, 0, 0)
// 	if err != nil {
// 		common.SysError(fmt.Sprintf("load questions for test task %d failed: %s", taskId, err.Error()))
// 		return
// 	}

// 	task.Status = model.TestTaskStatusRunning
// 	if err := model.SaveTestTask(task); err != nil {
// 		common.SysError(fmt.Sprintf("mark test task %d running failed: %s", taskId, err.Error()))
// 		return
// 	}
// 	ctx := context.Background()
// 	models := strings.Split(task.Model, ",")

// 	switch task.Type {
// 	case model.TestTaskTypeSequential:
// 		for _, testModel := range models {
// 			for _, question := range questions {
// 				detail := runOneTest(ctx, task, channel, testUserID, testModel, question)
// 				applyDetail(task, detail)
// 				task.TotalTime += detail.TotalTime
// 				if err := model.SaveChannelTestTaskDetail(detail); err != nil {
// 					common.SysError(fmt.Sprintf("save detail for test task %d failed: %s", taskId, err.Error()))
// 				}
// 				// 每题落盘一次，前端轮询任务即可看到实时进度
// 				if err := model.SaveTestTask(task); err != nil {
// 					common.SysError(fmt.Sprintf("update counters for test task %d failed: %s", taskId, err.Error()))
// 				}
// 			}
// 		}
// 	case model.TestTaskTypeConcurrent:
// 		concurrent := max(task.Concurrent, 1)
// 		for _, testModel := range models {
// 			for _, question := range questions {
// 				// 每个 模型×问题 起一轮并发：worker 只写自己独占的下标，
// 				// wg.Wait() 保证所有写入对返回后的读者可见，无需加锁
// 				details := make([]*model.TestTaskDetail, concurrent)
// 				roundStart := time.Now()
// 				var wg sync.WaitGroup
// 				for i := range concurrent {
// 					wg.Go(func() {
// 						details[i] = runOneTest(ctx, task, channel, testUserID, testModel, question)
// 					})
// 				}
// 				wg.Wait()
// 				// 并发能力看整轮墙钟耗时，而非单请求耗时之和
// 				task.TotalTime += int(time.Since(roundStart).Milliseconds())
// 				for _, detail := range details {
// 					applyDetail(task, detail)
// 					if err := model.SaveChannelTestTaskDetail(detail); err != nil {
// 						common.SysError(fmt.Sprintf("save detail for test task %d failed: %s", taskId, err.Error()))
// 					}
// 				}
// 				// 每轮落盘一次，前端轮询任务即可看到实时进度
// 				if err := model.SaveTestTask(task); err != nil {
// 					common.SysError(fmt.Sprintf("update counters for test task %d failed: %s", taskId, err.Error()))
// 				}
// 			}
// 		}
// 	default:
// 		common.SysError(fmt.Sprintf("test task %d has unknown type %d", taskId, task.Type))
// 	}

// 	task.Status = model.TestTaskStatusFinished
// 	if err := model.SaveTestTask(task); err != nil {
// 		common.SysError(fmt.Sprintf("finish test task %d failed: %s", taskId, err.Error()))
// 		return
// 	}
// 	common.SysLog(fmt.Sprintf("test task %d finished: %d success, %d fail", taskId, task.SuccessCount, task.FailCount))
// }

// // runOneTest 对单个 模型×问题 发起一次渠道测试并生成明细行（顺序/并发两种模式共用）。
// // 只读入参、不改任务计数，并发调用时各自构建独立 detail，无共享状态。
// func runOneTest(ctx context.Context, task *model.TestTask, channel *model.Channel, testUserID int, testModel string, question model.Question) *model.TestTaskDetail {
// 	start := time.Now()
// 	// 文本模型测试：用问题指定的 prompt 作为用户消息发送给渠道
// 	result := testChannel(ctx, channel, testUserID, testModel, "", true, question.Prompt)
// 	detail := &model.TestTaskDetail{
// 		TaskId:     task.Id,
// 		QuestionId: question.Id,
// 		ChannelId:  task.ChannelId,
// 		Model:      testModel,
// 		Prompt:     question.Prompt,
// 		TotalTime:  int(time.Since(start).Milliseconds()),
// 		Status:     model.TestTaskDetailStatusSuccess,
// 	}
// 	// 记录本次请求的 token 消耗（输入/输出/总/缓存命中）；失败行 usage 为 nil，保持 0
// 	if result.usage != nil {
// 		detail.InputToken = result.usage.PromptTokens
// 		detail.OutputToken = result.usage.CompletionTokens
// 		detail.TotalToken = result.usage.TotalTokens
// 		if detail.TotalToken == 0 {
// 			detail.TotalToken = detail.InputToken + detail.OutputToken
// 		}
// 		detail.CachedToken = result.usage.PromptTokensDetails.CachedTokens
// 		if detail.CachedToken == 0 {
// 			detail.CachedToken = result.usage.PromptCacheHitTokens
// 		}
// 	}
// 	switch {
// 	case result.localErr != nil:
// 		detail.Status = model.TestTaskDetailStatusFailed
// 		detail.Result = result.localErr.Error()
// 	case result.newAPIError != nil:
// 		detail.Status = model.TestTaskDetailStatusFailed
// 		detail.Result = result.newAPIError.Error()
// 	default:
// 		detail.Result = testResponseText(result)
// 	}
// 	return detail
// }

// applyDetail 把明细结果累计进任务计数（只在主 goroutine 串行调用，避免并发写计数）
// func applyDetail(task *model.TestTask, detail *model.TestTaskDetail) {
// 	if detail.Status == model.TestTaskDetailStatusSuccess {
// 		task.SuccessCount++
// 	} else {
// 		task.FailCount++
// 	}
// }

// // testResponseText 从渠道测试响应中提取模型回复文本（兼容 OpenAI 与 Claude 的响应形状），
// // 超长时按字符截断，仅用于测试任务明细展示。
// func testResponseText(result testResult) string {
// 	content := gjson.Get(result.responseBody, "choices.0.message.content").String()
// 	if content == "" {
// 		content = gjson.Get(result.responseBody, "content.0.text").String()
// 	}
// 	if runes := []rune(content); len(runes) > 5000 {
// 		return string(runes[:5000])
// 	}
// 	return content
// }
