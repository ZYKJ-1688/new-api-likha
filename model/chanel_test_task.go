package model

import "time"

// 测试任务类型
const (
	TestTaskTypeSequential = 1 // 顺序测试：逐题串行请求，测普通响应速度
	TestTaskTypeConcurrent = 2 // 并发测试：每题一轮并发请求，测并发能力
	TestTaskTypeVerify     = 3
)

// 测试任务状态
const (
	TestTaskStatusPending  = 0 // 待执行
	TestTaskStatusRunning  = 1 // 执行中
	TestTaskStatusFinished = 2 // 已完成
)

// 测试任务明细执行结果
const (
	TestTaskDetailStatusSuccess = 1 // 成功
	TestTaskDetailStatusFailed  = 2 // 失败
)

type TestTask struct {
	Id                      int    `json:"id" gorm:"primaryKey"`
	Type                    int    `json:"type"`
	ChannelId               int    `json:"channel_id" gorm:"index"`
	Model                   string `json:"model" gorm:"type:text"` // 逗号分隔的多个模型名
	QuestionGroupId         int    `json:"question_group_id" gorm:"index"`
	ConsecutiveRequestCount int    `json:"consecutive_request_count"`
	Concurrent              int    `json:"concurrent"` // 并发模式下每轮的并发数，顺序模式忽略
	Status                  int    `json:"status"`
	TotalTime               int    `json:"total_time"`
	TotalCount              int    `json:"total_count"`
	SuccessCount            int    `json:"success_count"`
	FailCount               int    `json:"fail_count"`
	CreatedTime             int64  `json:"created_time"`
	CreatedTimeText         string `json:"created_time_text" gorm:"-"`
}

func (TestTask) TableName() string {
	return "channel_test_task"
}

func SaveTestTask(task *TestTask) error {
	if task == nil {
		return nil
	}
	// 业务默认值在代码层归一化：连发次数至少 1，不依赖数据库 default
	if task.ConsecutiveRequestCount <= 0 {
		task.ConsecutiveRequestCount = 1
	}
	if task.Id == 0 && task.CreatedTime == 0 {
		task.CreatedTime = time.Now().Unix()
	}
	return DB.Save(task).Error
}

func ExistsTestTask(id int) (bool, error) {
	var count int64
	err := DB.Model(&TestTask{}).Where("id = ?", id).Count(&count).Error
	return count > 0, err
}

// TestTaskInfo 任务列表行：任务本身 + 连表带出的渠道名称与问题分组名称，
// 仅用于查询展示，不参与落库
type TestTaskInfo struct {
	TestTask
	ChannelName       string `json:"channel_name"`
	QuestionGroupName string `json:"question_group_name"`
}

// GetTestTasks 按 id 查单个（id > 0），按 groupId 过滤分组（groupId > 0），
// 按 channelId 过滤渠道（channelId > 0），按 taskType 过滤测试类型（taskType > 0）；
// LEFT JOIN 带出渠道/分组名称（渠道或分组被删后名称为空字符串，任务记录仍完整）；
// pageSize > 0 时分页并返回总数，否则返回全部
func GetTestTasks(id int, groupId int, channelId int, taskType int, page int, pageSize int) ([]TestTaskInfo, int64, error) {
	var tasks []TestTaskInfo
	var total int64
	query := DB.Model(&TestTask{})
	if id > 0 {
		query = query.Where("channel_test_task.id = ?", id)
	}
	if groupId > 0 {
		query = query.Where("channel_test_task.question_group_id = ?", groupId)
	}
	if channelId > 0 {
		query = query.Where("channel_test_task.channel_id = ?", channelId)
	}
	if taskType > 0 {
		query = query.Where("channel_test_task.type = ?", taskType)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	// 任务类列表按项目惯例倒序（最新在前）；join 后 id 等列名多表重名，
	// 条件与排序必须显式限定主表前缀，否则三库都会报 column ambiguous
	query = query.
		Select("channel_test_task.*, channels.name AS channel_name, question_groups.name AS question_group_name").
		Joins("LEFT JOIN channels ON channels.id = channel_test_task.channel_id").
		Joins("LEFT JOIN question_groups ON question_groups.id = channel_test_task.question_group_id").
		Order("channel_test_task.id DESC")
	if pageSize > 0 {
		query = query.Limit(pageSize).Offset((page - 1) * pageSize)
	}
	err := query.Find(&tasks).Error
	if err != nil {
		return nil, 0, err
	}
	for i := range tasks {
		tasks[i].CreatedTimeText = time.Unix(tasks[i].CreatedTime, 0).Format("2006-01-02 15:04:05")
	}
	return tasks, total, nil
}
