package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetQuestions 获取问题列表，支持分页 ?p=页码&page_size=每页条数（上限 100），
// 可组合 ?id=xxx 查单个、?group_id=xxx 按分组过滤
func GetQuestions(c *gin.Context) {
	id := 0
	if idStr := c.Query("id"); idStr != "" {
		var err error
		if id, err = strconv.Atoi(idStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	groupId := 0
	if groupStr := c.Query("group_id"); groupStr != "" {
		var err error
		if groupId, err = strconv.Atoi(groupStr); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	pageInfo := common.GetPageQuery(c)
	questions, total, err := model.GetQuestions(id, groupId, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     questions,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

// CreateQuestion 新增问题
func CreateQuestion(c *gin.Context) {
	var question model.Question
	if err := c.ShouldBindJSON(&question); err != nil {
		common.ApiError(c, err)
		return
	}
	if question.Prompt == "" {
		common.ApiErrorMsg(c, "问题内容不能为空")
		return
	}
	if question.Id != 0 {
		common.ApiErrorMsg(c, "新增时不能指定 ID")
		return
	}
	exists, err := model.ExistsQuestionGroup(question.GroupId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists {
		common.ApiErrorMsg(c, "分组不存在")
		return
	}
	if err := model.SaveQuestion(&question); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &question)
}

// UpdateQuestion 更新问题（只更新传入的非零字段，未传的保持原值，创建时间不可改；
// 记录不存在时报错）
func UpdateQuestion(c *gin.Context) {
	var question model.Question
	if err := c.ShouldBindJSON(&question); err != nil {
		common.ApiError(c, err)
		return
	}
	if question.Id == 0 {
		common.ApiErrorMsg(c, "缺少问题 ID")
		return
	}
	if question.Prompt == "" {
		common.ApiErrorMsg(c, "问题内容不能为空")
		return
	}
	if question.GroupId > 0 {
		exists, err := model.ExistsQuestionGroup(question.GroupId)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if !exists {
			common.ApiErrorMsg(c, "分组不存在")
			return
		}
	}
	if err := model.SaveQuestion(&question); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &question)
}

// DeleteQuestion 删除问题
func DeleteQuestion(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteQuestion(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
