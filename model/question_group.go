package model

import (
	"fmt"
	"time"
)

type QuestionGroup struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	Name        string `json:"name" gorm:"size:128"`
	Description string `json:"description" gorm:"size:256"`
	CreatedTime int64  `json:"created_time"`
}

func (QuestionGroup) TableName() string {
	return "question_groups"
}

func SaveQuestionGroup(group *QuestionGroup) error {
	if group == nil {
		return nil
	}
	if group.Id == 0 {
		if group.CreatedTime == 0 {
			group.CreatedTime = time.Now().Unix()
		}
		return DB.Create(group).Error
	}
	// 更新只写非零字段：未传的参数保持库内原值；创建时间无论如何不可改
	exists, err := ExistsQuestionGroup(group.Id)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("分组 %d 不存在", group.Id)
	}
	return DB.Model(&QuestionGroup{}).Where("id = ?", group.Id).Omit("created_time").Updates(group).Error
}

func DeleteQuestionGroup(id int) error {
	count, err := CountQuestionsByGroup(id)
	if err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("该分组下仍有 %d 个问题，无法删除", count)
	}
	return DB.Delete(&QuestionGroup{}, id).Error
}

func ExistsQuestionGroup(id int) (bool, error) {
	var count int64
	err := DB.Model(&QuestionGroup{}).Where("id = ?", id).Count(&count).Error
	return count > 0, err
}

func GetQuestionGroup(id int) ([]QuestionGroup, error) {
	var group []QuestionGroup
	query := DB.Model(&QuestionGroup{})
	if id > 0 {
		query = query.Where(" id = ?", id)
	}
	err := query.Find(&group).Error
	return group, err
}
