package router

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListModelsSupportsOpenAIAndGeminiAuthentication(t *testing.T) {
	setupRelayRouterTestDB(t)

	user := model.User{
		Username: "models-user",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    100,
	}
	require.NoError(t, model.DB.Create(&user).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId:         user.Id,
		Key:            "modelstestkey",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)

	tests := []struct {
		name           string
		path           string
		headerName     string
		expectedObject string
		expectedField  string
	}{
		{
			name:           "OpenAI bearer token",
			path:           "/v1/models",
			headerName:     "Authorization",
			expectedObject: "list",
			expectedField:  "data",
		},
		{
			name:          "Gemini API key header",
			path:          "/v1/models",
			headerName:    "x-goog-api-key",
			expectedField: "models",
		},
		{
			name:          "Gemini API key query",
			path:          "/v1/models?key=modelstestkey",
			expectedField: "models",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			if test.headerName != "" {
				value := "modelstestkey"
				if test.headerName == "Authorization" {
					value = "Bearer " + value
				}
				request.Header.Set(test.headerName, value)
			}

			engine.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusOK, recorder.Code)
			var payload map[string]any
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
			assert.Contains(t, payload, test.expectedField)
			assert.NotContains(t, payload, "error")
			if test.expectedObject != "" {
				assert.Equal(t, test.expectedObject, payload["object"])
			}
		})
	}
}

func TestPlaygroundImagePluginAndFallback(t *testing.T) {
	setupRelayRouterTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Task{}, &model.Log{}, &model.UserSession{}))

	oldMemory, oldBatch, oldConsume, oldExport := common.MemoryCacheEnabled, common.BatchUpdateEnabled, common.LogConsumeEnabled, common.DataExportEnabled
	oldSecret, oldErrorLog := common.CryptoSecret, constant.ErrorLogEnabled
	oldFetch := *system_setting.GetFetchSetting()
	oldGroups, oldRatios := setting.UserUsableGroups2JSONString(), ratio_setting.GroupRatio2JSONString()
	common.MemoryCacheEnabled, common.BatchUpdateEnabled, common.LogConsumeEnabled, common.DataExportEnabled = false, false, true, false
	common.CryptoSecret, constant.ErrorLogEnabled = "playground-image-test-secret", false
	system_setting.GetFetchSetting().AllowPrivateIp = true
	system_setting.GetFetchSetting().AllowedPorts = []string{"1-65535"}
	service.InitHttpClient()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","pg-images":"Images"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"pg-images":2}`))
	t.Cleanup(func() {
		common.MemoryCacheEnabled, common.BatchUpdateEnabled, common.LogConsumeEnabled, common.DataExportEnabled = oldMemory, oldBatch, oldConsume, oldExport
		common.CryptoSecret, constant.ErrorLogEnabled = oldSecret, oldErrorLog
		*system_setting.GetFetchSetting() = oldFetch
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(oldGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(oldRatios))
	})

	savedBilling := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		if strings.HasPrefix(key, "billing_setting.") {
			savedBilling[key] = value
		}
		return nil
	}))
	t.Cleanup(func() { require.NoError(t, config.GlobalConfig.LoadFromDB(savedBilling)) })
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode":        `{"pg-plugin-image":"tiered_expr","pg-ordinary-image":"tiered_expr"}`,
		"billing_setting.billing_expr":        `{"pg-plugin-image":"tier(\"images\", u(\"image_count\") * 0.01)","pg-ordinary-image":"tier(\"images\", fixed(0.01)) * image_count"}`,
		"billing_setting.plugin_billing_expr": `{}`,
	}))

	const pluginSource = `
export const meta = {
  apiVersion: 1, key: "pg-image-test", name: "Playground image test", version: "1.0.0",
  author: {name: "Test"}, models: ["pg-plugin-image"], fetchMode: "per_task",
  protocols: ["openai_image"],
  usageSchema: {image_count: {type: "number", unit: "count", description: {en: "Image generation unit price", zh: "图片生成单价"}}}
};
export const protocols = {openai_image: {
  decodeRequest(ctx) {
    const body = ctx.body.value;
    if (!body.prompt) throw new Error("Prompt is required");
    return {kind: "submit", model: ctx.model, requestBody: body};
  },
  render(ctx, task) {return {created: 123, data: task.data.data};}
}};
export function buildSubmitRequest(ctx) {return {url: ctx.baseUrl + "/vendor/images", method: "POST", body: ctx.requestBody};}
export function parseSubmitResponse(ctx, response) {return {taskId: "vendor-image", taskData: response.body, immediate: {status: "SUCCESS"}};}
export function extractUsage(ctx) {return {image_count: ctx.requestBody.n};}
export function extractUsageOnComplete(ctx, result, body) {return {image_count: body.image_count};}
export function buildQueryRequest() {throw new Error("Immediate image must not poll");}
export function parseTaskResult() {throw new Error("Immediate image must not poll");}
`
	_, err := jsplugin.DefaultRegistry.Register(pluginSource, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, jsplugin.DefaultRegistry.Unregister("pg-image-test")) })

	for _, tc := range []struct {
		name, model, prompt, upstreamPath string
		channelType                       int
		status, wantQuota, wantCalls      int
	}{
		{"plugin settles actual images", "pg-plugin-image", "paint a cat", "/vendor/images", constant.ChannelTypeTaskPlugin, http.StatusOK, 10000, 1},
		{"ordinary image fallback preserves body and group", "pg-ordinary-image", "paint a cat", "/v1/images/generations", constant.ChannelTypeOpenAI, http.StatusOK, 10000, 1},
		{"invalid plugin input is not submitted or charged", "pg-plugin-image", "", "/vendor/images", constant.ChannelTypeTaskPlugin, http.StatusBadRequest, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				assert.Equal(t, http.MethodPost, r.Method)
				assert.Equal(t, tc.upstreamPath, r.URL.Path)
				body, readErr := io.ReadAll(r.Body)
				assert.NoError(t, readErr)
				var payload map[string]any
				if assert.NoError(t, common.Unmarshal(body, &payload)) {
					assert.Equal(t, tc.model, payload["model"])
					assert.Equal(t, tc.prompt, payload["prompt"])
					assert.Equal(t, float64(3), payload["n"])
					assert.Equal(t, "1024x1024", payload["size"])
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"created":123,"image_count":1,"data":[{"url":"https://images.example/cat.png"}]}`)
			}))
			defer upstream.Close()
			initialQuota := int(common.QuotaPerUnit)
			user := model.User{Username: "pg-" + tc.model + fmt.Sprint(tc.status), AffCode: fmt.Sprint(tc.channelType, tc.status), Status: common.UserStatusEnabled, Role: common.RoleCommonUser, Group: "default", Quota: initialQuota, AuthVersion: 1, Setting: `{"billing_preference":"wallet_only"}`}
			require.NoError(t, model.DB.Create(&user).Error)
			login, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "router-test")
			require.NoError(t, err)
			channel := model.Channel{Name: tc.name, Type: tc.channelType, Key: "upstream-test-key", BaseURL: &upstream.URL, Status: common.ChannelStatusEnabled, Models: tc.model, Group: "pg-images"}
			if tc.channelType == constant.ChannelTypeTaskPlugin {
				channel.SetSetting(dto.ChannelSettings{TaskPluginKey: "pg-image-test"})
			}
			require.NoError(t, model.DB.Create(&channel).Error)
			require.NoError(t, model.DB.Create(&model.Ability{Group: "pg-images", Model: tc.model, ChannelId: channel.Id, Enabled: true}).Error)
			t.Cleanup(func() {
				require.NoError(t, model.DB.Where("channel_id = ?", channel.Id).Delete(&model.Ability{}).Error)
			})

			engine := gin.New()
			SetRelayRouter(engine)
			body, err := common.Marshal(map[string]any{"model": tc.model, "prompt": tc.prompt, "n": 3, "size": "1024x1024", "response_format": "url", "group": "pg-images"})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(string(body)))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer "+login.AccessToken)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)
			require.Equal(t, tc.status, response.Code, response.Body.String())
			assert.EqualValues(t, tc.wantCalls, calls.Load())
			var envelope struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
				Data    *struct {
					Created int `json:"created"`
					Data    []struct {
						URL string `json:"url"`
					} `json:"data"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &envelope))
			if tc.status == http.StatusOK {
				assert.True(t, envelope.Success)
				assert.Empty(t, envelope.Message)
				require.NotNil(t, envelope.Data)
				assert.Equal(t, 123, envelope.Data.Created)
				require.Len(t, envelope.Data.Data, 1)
				assert.Equal(t, "https://images.example/cat.png", envelope.Data.Data[0].URL)
			} else {
				assert.False(t, envelope.Success)
				assert.Contains(t, envelope.Message, "Prompt is required")
				assert.Nil(t, envelope.Data)
			}
			var updated model.User
			require.NoError(t, model.DB.First(&updated, user.Id).Error)
			assert.Equal(t, initialQuota-tc.wantQuota, updated.Quota)
			assert.Equal(t, tc.wantQuota, updated.UsedQuota)
			var logs []model.Log
			require.NoError(t, model.DB.Where("user_id = ? AND type = ?", user.Id, model.LogTypeConsume).Find(&logs).Error)
			require.Len(t, logs, tc.wantCalls)
			if len(logs) > 0 {
				assert.Equal(t, "pg-images", logs[0].Group)
				assert.Equal(t, tc.wantQuota, logs[0].Quota)
			}
			var tasks []model.Task
			require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&tasks).Error)
			if tc.channelType == constant.ChannelTypeTaskPlugin && tc.status == http.StatusOK {
				require.Len(t, tasks, 1)
				assert.Equal(t, model.TaskStatus(model.TaskStatusSuccess), tasks[0].Status)
				assert.Equal(t, tc.wantQuota, tasks[0].Quota)
			} else {
				assert.Empty(t, tasks)
			}
		})
	}
}

func TestPlaygroundSubmitResponseEnvelope(t *testing.T) {
	const image = `{"created":9007199254740993,"data":[{"url":"https://example.com/image.png"}],"extra":{"retained":true}}`
	const videoSubmit = `{"id":"task_x","task_id":"task_x","status":"queued","model":"sora-2","created_at":1763100000}`
	tests := []struct {
		name, path, body, expected string
		status                     int
		writeString                bool
	}{
		{"success", "/pg/images/generations", image, `{"data":` + image + `,"message":"","success":true}`, 200, false},
		{"string writer and status", "/pg/images/generations", image, `{"data":` + image + `,"message":"","success":true}`, 201, true},
		{"relay error", "/pg/images/generations", `{"error":{"message":"upstream unavailable"}}`, `{"data":null,"message":"upstream unavailable","success":false}`, 502, false},
		{"auth error", "/pg/images/generations", `{"success":false,"message":"not logged in"}`, `{"data":null,"message":"not logged in","success":false}`, 401, false},
		{"business failure", "/pg/images/generations", `{"success":false,"message":"disabled"}`, `{"data":null,"message":"disabled","success":false}`, 200, false},
		{"plain failure", "/pg/images/generations", `busy`, `{"data":null,"message":"busy","success":false}`, 503, true},
		{"video submit", "/pg/videos", videoSubmit, `{"data":` + videoSubmit + `,"message":"","success":true}`, 200, false},
		{"video session error", "/pg/videos", `{"success":false,"message":"not logged in"}`, `{"data":null,"message":"not logged in","success":false}`, 401, false},
		{"video task error", "/pg/videos", `{"code":"fail_to_fetch_task","message":"upstream busy","data":null}`, `{"data":null,"message":"upstream busy","success":false}`, 502, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine := gin.New()
			engine.Use(middleware.PlaygroundSubmitResponse())
			// An abort in an earlier middleware must still get the envelope.
			engine.Use(func(c *gin.Context) {
				c.Header("Content-Length", fmt.Sprint(len(tt.body)))
				c.Header("Content-Type", "text/plain")
				c.Writer.WriteHeader(tt.status)
				c.Writer.WriteHeaderNow()
				if tt.writeString {
					_, _ = c.Writer.WriteString(tt.body)
				} else {
					_, _ = c.Writer.Write([]byte(tt.body))
				}
				c.Abort()
			})
			engine.POST(tt.path, func(c *gin.Context) { t.Fatal("abort did not stop dispatch") })
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, tt.path, nil))
			assert.Equal(t, tt.status, recorder.Code)
			assert.JSONEq(t, tt.expected, recorder.Body.String())
			assert.Contains(t, recorder.Header().Get("Content-Type"), "application/json")
			assert.Empty(t, recorder.Header().Get("Content-Length"))
			if tt.status < 300 && strings.Contains(tt.body, "9007199254740993") {
				assert.Contains(t, recorder.Body.String(), "9007199254740993")
			}
		})
	}
}

func TestPlaygroundVideoFetchResponseEnvelope(t *testing.T) {
	const task = `{"task_id":"task_x","status":"IN_PROGRESS","progress":"50%","data":{"seed":9007199254740993}}`
	const result = `{"code":"success","message":"","data":` + task + `}`
	for _, tt := range []struct {
		name, body, expected string
		status               int
	}{
		{"fetch success", result, `{"success":true,"message":"","data":` + task + `}`, 200},
		{"failed task is still a successful query", `{"code":"success","data":{"task_id":"task_x","status":"FAILURE","fail_reason":"generation failed"}}`, `{"success":true,"message":"","data":{"task_id":"task_x","status":"FAILURE","fail_reason":"generation failed"}}`, 200},
		{"null result", `{"code":"success","data":null}`, `{"success":true,"message":"","data":null}`, 200},
		{"missing task", `{"code":"task_not_exist","message":"task_not_exist"}`, `{"success":false,"message":"task_not_exist","data":null}`, 400},
		{"server error", `{"code":"get_task_failed","message":"lookup failed"}`, `{"success":false,"message":"lookup failed","data":null}`, 500},
		{"session error", `{"success":false,"message":"not logged in"}`, `{"success":false,"message":"not logged in","data":null}`, 401},
		{"business error", `{"code":"failed","message":"unavailable","data":null}`, `{"success":false,"message":"unavailable","data":null}`, 200},
	} {
		t.Run(tt.name, func(t *testing.T) {
			engine := gin.New()
			engine.Use(middleware.PlaygroundSubmitResponse())
			engine.Use(func(c *gin.Context) {
				c.AbortWithStatusJSON(tt.status, common.RawMessage(tt.body))
			})
			engine.GET("/pg/videos/:task_id", func(c *gin.Context) { t.Fatal("abort did not stop dispatch") })
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/pg/videos/task_x?poll=1", nil))
			assert.Equal(t, tt.status, recorder.Code)
			assert.JSONEq(t, tt.expected, recorder.Body.String())
			if tt.body == result {
				assert.Contains(t, recorder.Body.String(), "9007199254740993")
			}
		})
	}

	for _, path := range []string{"/v1/videos/:task_id", "/pg/videos/:task_id/content"} {
		t.Run(path, func(t *testing.T) {
			engine := gin.New()
			engine.Use(middleware.PlaygroundSubmitResponse())
			engine.GET(path, func(c *gin.Context) { c.Data(200, "application/json", []byte(result)) })
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, strings.ReplaceAll(path, ":task_id", "task_x"), nil))
			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.JSONEq(t, result, recorder.Body.String())
		})
	}
}

func TestPlaygroundImageNonStreamingAndIsolation(t *testing.T) {
	for _, tt := range []struct {
		name, method, path, body string
		blocked                  bool
	}{
		{"stream rejected", "POST", "/pg/images/generations", `{"stream":true}`, true},
		{"invalid JSON", "POST", "/pg/images/generations", `{`, true},
		{"request replay", "POST", "/pg/images/generations", `{"model":"image","stream":false}`, false},
		{"v1 unchanged", "POST", "/v1/images/generations", `{"stream":true}`, false},
		{"chat unchanged", "POST", "/pg/chat/completions", `{"stream":true}`, false},
		{"video submit wrapped", "POST", "/pg/videos", `{"stream":true}`, false},
		{"other method unchanged", "GET", "/pg/images/generations", `{"stream":true}`, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			engine := gin.New()
			engine.Use(middleware.PlaygroundSubmitResponse(), middleware.BodyStorageCleanup(), middleware.PlaygroundImageNonStreaming())
			called := false
			engine.Handle(tt.method, tt.path, func(c *gin.Context) {
				called = true
				body, err := io.ReadAll(c.Request.Body)
				require.NoError(t, err)
				assert.Equal(t, tt.body, string(body))
				c.Data(200, "application/json", []byte(`{"created":1,"data":[]}`))
			})
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body)))
			assert.Equal(t, !tt.blocked, called)
			if tt.blocked {
				assert.Equal(t, 400, recorder.Code)
				var result map[string]any
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &result))
				assert.Equal(t, false, result["success"])
				assert.Nil(t, result["data"])
				assert.NotEmpty(t, result["message"])
			} else if tt.method != "POST" || (tt.path != "/pg/images/generations" && tt.path != "/pg/videos") {
				assert.JSONEq(t, `{"created":1,"data":[]}`, recorder.Body.String())
			} else {
				assert.JSONEq(t, `{"data":{"created":1,"data":[]},"message":"","success":true}`, recorder.Body.String())
			}
		})
	}
}

func setupRelayRouterTestDB(t *testing.T) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	originalIsMasterNode := common.IsMasterNode
	originalRedisEnabled := common.RedisEnabled
	originalSQLitePath := common.SQLitePath
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")

	common.IsMasterNode = false
	common.RedisEnabled = false
	common.SQLitePath = fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, os.Setenv("SQL_DSN", "local"))
	require.NoError(t, model.InitDB())
	model.LOG_DB = model.DB
	require.NoError(t, model.DB.AutoMigrate(&model.User{}, &model.Token{}, &model.Ability{}))

	t.Cleanup(func() {
		if sqlDB, err := model.DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
		common.IsMasterNode = originalIsMasterNode
		common.RedisEnabled = originalRedisEnabled
		common.SQLitePath = originalSQLitePath
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", originalSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
	})
}
