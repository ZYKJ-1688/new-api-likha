package model

import "time"

type TestTaskDetail struct {
	Id                    int     `json:"id" gorm:"primaryKey"`
	TaskId                int     `json:"task_id" gorm:"index"`
	QuestionId            int     `json:"question_id"`
	ChannelId             int     `json:"channel_id"`
	Model                 string  `json:"model" gorm:"size:128"`
	Prompt                string  `json:"prompt" gorm:"type:text"`
	Result                string  `json:"result" gorm:"type:text"`
	TotalTime             int     `json:"total_time"`
	TotalToken            int     `json:"total_token"`
	InputToken            int     `json:"input_token"`
	CachedToken           int     `json:"cached_token"`
	OutputToken           int     `json:"output_token"`
	Ttft                  int     `json:"ttft"`
	OutputTokensPerSecond float64 `json:"output_tokens_per_second"`
	IsOfficial            int     `json:"is_official"`
	Status                int     `json:"status"`
	IsVerified            int     `json:"is_verified"`
	VerificationMessage   string  `json:"verification_message"`
	CreatedTime           int64   `json:"created_time"`
}

func (TestTaskDetail) TableName() string {
	return "channel_test_task_detail"
}

func SaveChannelTestTaskDetail(task *TestTaskDetail) error {
	if task == nil {
		return nil
	}
	if task.Id == 0 && task.CreatedTime == 0 {
		task.CreatedTime = time.Now().Unix()
	}
	return DB.Save(task).Error
}

// TestTaskDetailInfo 明细列表行：明细本身 + 连表带出的渠道名称与问题分组名称，
// 仅用于查询展示，不参与落库
type TestTaskDetailInfo struct {
	TestTaskDetail
	ChannelName       string `json:"channel_name"`
	QuestionGroupName string `json:"question_group_name"`
}

// GetChannelTestTaskDetail 按 task_id 过滤归属任务（task_id > 0）；
// LEFT JOIN 带出渠道名称；问题分组名称经所属任务连出（任务记录的是测试时的
// 分组，问题事后挪组不影响历史明细）；pageSize > 0 时分页并返回总数，否则返回全部
func GetChannelTestTaskDetail(task_id int, page int, pageSize int) ([]TestTaskDetailInfo, int64, error) {
	var tasks []TestTaskDetailInfo
	var total int64
	query := DB.Model(&TestTaskDetail{})
	if task_id > 0 {
		query = query.Where("channel_test_task_detail.task_id = ?", task_id)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	// 任务类列表按项目惯例倒序（最新在前）；join 后 id 等列名多表重名，
	// 条件与排序必须显式限定主表前缀，否则三库都会报 column ambiguous
	query = query.
		Select("channel_test_task_detail.*, channels.name AS channel_name, question_groups.name AS question_group_name").
		Joins("LEFT JOIN channels ON channels.id = channel_test_task_detail.channel_id").
		Joins("LEFT JOIN channel_test_task ON channel_test_task.id = channel_test_task_detail.task_id").
		Joins("LEFT JOIN question_groups ON question_groups.id = channel_test_task.question_group_id").
		Order("channel_test_task_detail.id DESC")
	if pageSize > 0 {
		query = query.Limit(pageSize).Offset((page - 1) * pageSize)
	}
	err := query.Find(&tasks).Error
	return tasks, total, err
}
