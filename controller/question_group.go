package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetQuestionGroups 获取题目分组列表，可通过 ?id=xxx 查询单个
func GetQuestionGroups(c *gin.Context) {
	id := 0
	if idStr := c.Query("id"); idStr != "" {
		var err error
		if id, err = strconv.Atoi(idStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	groups, err := model.GetQuestionGroup(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, groups)
}

// CreateQuestionGroup 新增题目分组
func CreateQuestionGroup(c *gin.Context) {
	var group model.QuestionGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		common.ApiError(c, err)
		return
	}
	if group.Name == "" {
		common.ApiErrorMsg(c, "分组名称不能为空")
		return
	}
	if group.Id != 0 {
		common.ApiErrorMsg(c, "新增时不能指定 ID")
		return
	}
	if err := model.SaveQuestionGroup(&group); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &group)
}

// UpdateQuestionGroup 更新题目分组（只更新传入的非零字段，未传的保持原值，创建时间不可改；记录不存在时报错）
func UpdateQuestionGroup(c *gin.Context) {
	var group model.QuestionGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		common.ApiError(c, err)
		return
	}
	if group.Id == 0 {
		common.ApiErrorMsg(c, "缺少分组 ID")
		return
	}
	if group.Name == "" {
		common.ApiErrorMsg(c, "分组名称不能为空")
		return
	}
	if err := model.SaveQuestionGroup(&group); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &group)
}

// DeleteQuestionGroup 删除题目分组
func DeleteQuestionGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteQuestionGroup(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
