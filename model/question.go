package model

import (
	"fmt"
	"time"
)

type Question struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	GroupId     int    `json:"group_id" gorm:"index"`
	Prompt      string `json:"prompt" gorm:"type:text"`
	CreatedTime int64  `json:"created_time"`
}

func (Question) TableName() string {
	return "questions"
}

func SaveQuestion(q *Question) error {
	if q == nil {
		return nil
	}
	if q.Id == 0 {
		if q.CreatedTime == 0 {
			q.CreatedTime = time.Now().Unix()
		}
		return DB.Create(q).Error
	}
	exists, err := ExistsQuestion(q.Id)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("问题 %d 不存在", q.Id)
	}
	// 更新只写非零字段：未传的参数保持库内原值；创建时间无论如何不可改
	return DB.Model(&Question{}).Where("id = ?", q.Id).Omit("created_time").Updates(q).Error
}

func ExistsQuestion(id int) (bool, error) {
	var count int64
	err := DB.Model(&Question{}).Where("id = ?", id).Count(&count).Error
	return count > 0, err
}

func DeleteQuestion(id int) error {
	return DB.Delete(&Question{}, id).Error
}

// GetQuestions 按 id 查单个（id > 0），按 groupId 过滤分组（groupId > 0）；
// pageSize > 0 时分页并返回总数，否则返回全部
func GetQuestions(id int, groupId int, page int, pageSize int) ([]Question, int64, error) {
	var questions []Question
	var total int64
	query := DB.Model(&Question{})
	if id > 0 {
		query = query.Where("id = ?", id)
	}
	if groupId > 0 {
		query = query.Where("group_id = ?", groupId)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	query = query.Order("id ASC")
	if pageSize > 0 {
		query = query.Limit(pageSize).Offset((page - 1) * pageSize)
	}
	err := query.Find(&questions).Error
	return questions, total, err
}

func CountQuestionsByGroup(groupId int) (int64, error) {
	var count int64
	err := DB.Model(&Question{}).Where("group_id = ?", groupId).Count(&count).Error
	return count, err
}
