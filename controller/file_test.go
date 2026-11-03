package controller

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
)

var ossEnvNames = []string{
	"OSS_ACCESS_KEY_ID",
	"OSS_ACCESS_KEY_SECRET",
	"OSS_BUCKET",
	"OSS_REGION",
	"OSS_ENDPOINT",
	"OSS_PUBLIC_BASE_URL",
	"OSS_MAX_FILE_SIZE",
	"OSS_ALLOWED_EXTENSIONS",
}

// withOssEnv clears every OSS_* variable for the test and applies overrides,
// restoring the previous environment afterwards.
func withOssEnv(t *testing.T, overrides map[string]string) {
	t.Helper()
	for _, name := range ossEnvNames {
		if old, had := os.LookupEnv(name); had {
			os.Unsetenv(name)
			t.Cleanup(func() { os.Setenv(name, old) })
		}
	}
	for name, value := range overrides {
		os.Setenv(name, value)
		t.Cleanup(func() { os.Unsetenv(name) })
	}
}

func fakeOssEnv() map[string]string {
	return map[string]string{
		"OSS_ACCESS_KEY_ID":     "test-ak",
		"OSS_ACCESS_KEY_SECRET": "test-sk",
		"OSS_BUCKET":            "test-bucket",
		"OSS_REGION":            "cn-hangzhou",
	}
}

func newJSONTestContext(t *testing.T, request *http.Request) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	if request != nil {
		c.Request = request
	}
	return c, recorder
}

func decodeFileAPIResponse(t *testing.T, recorder *httptest.ResponseRecorder) (bool, string, map[string]any) {
	t.Helper()
	var parsed struct {
		Success bool
		Message string
		Data    map[string]any
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &parsed))
	return parsed.Success, parsed.Message, parsed.Data
}

func TestGetFileUploadPolicy(t *testing.T) {
	withOssEnv(t, nil)
	c, recorder := newJSONTestContext(t, nil)
	GetFileUploadPolicy(c)
	success, message, data := decodeFileAPIResponse(t, recorder)
	require.True(t, success, message)
	require.False(t, data["enabled"].(bool))
	assert.EqualValues(t, int64(20<<20), data["max_size"])
	assert.Contains(t, data["allowed_extensions"].([]any), "png")

	withOssEnv(t, map[string]string{
		"OSS_ACCESS_KEY_ID":      "ak",
		"OSS_ACCESS_KEY_SECRET":  "sk",
		"OSS_BUCKET":             "bucket",
		"OSS_REGION":             "cn-hangzhou",
		"OSS_MAX_FILE_SIZE":      "1024",
		"OSS_ALLOWED_EXTENSIONS": "png,pdf",
	})
	c, recorder = newJSONTestContext(t, nil)
	GetFileUploadPolicy(c)
	success, message, data = decodeFileAPIResponse(t, recorder)
	require.True(t, success, message)
	require.True(t, data["enabled"].(bool))
	assert.EqualValues(t, int64(1024), data["max_size"])
	assert.Equal(t, []any{"png", "pdf"}, data["allowed_extensions"])
}

func TestLoadOssSettings(t *testing.T) {
	withOssEnv(t, map[string]string{
		"OSS_ACCESS_KEY_ID":      "  ak  ",
		"OSS_BUCKET":             "bucket",
		"OSS_REGION":             "cn-hangzhou",
		"OSS_ALLOWED_EXTENSIONS": " PNG , .jpg ,mp4,,",
	})
	settings := service.LoadOssSettings()
	require.False(t, settings.Enabled()) // secret missing
	assert.Equal(t, "ak", settings.AccessKeyId)
	assert.Equal(t, []string{"png", "jpg", "mp4"}, settings.AllowedExtensions)
	assert.EqualValues(t, int64(20<<20), settings.MaxFileSize)
}

func TestOssSettingsAllowsExtension(t *testing.T) {
	withOssEnv(t, nil)
	settings := service.LoadOssSettings()
	assert.True(t, settings.AllowsExtension("PNG"))
	assert.True(t, settings.AllowsExtension("pdf"))
	assert.False(t, settings.AllowsExtension("exe"))
	assert.False(t, settings.AllowsExtension(""))
}

func TestOssSettingsObjectURL(t *testing.T) {
	settings := service.LoadOssSettings()
	settings.Bucket = "bucket"
	settings.Region = "cn-hangzhou"

	settings.PublicBaseURL = "https://cdn.example.com/"
	assert.Equal(t, "https://cdn.example.com/uploads/1/a.png", settings.ObjectURL("uploads/1/a.png"))

	settings.PublicBaseURL = ""
	settings.Endpoint = "https://oss-cn-beijing.aliyuncs.com"
	assert.Equal(t, "https://bucket.oss-cn-beijing.aliyuncs.com/uploads/1/a.png", settings.ObjectURL("uploads/1/a.png"))

	settings.Endpoint = "oss-cn-beijing.aliyuncs.com"
	assert.Equal(t, "https://bucket.oss-cn-beijing.aliyuncs.com/uploads/1/a.png", settings.ObjectURL("uploads/1/a.png"))

	settings.Endpoint = ""
	assert.Equal(t, "https://bucket.oss-cn-hangzhou.aliyuncs.com/uploads/1/a.png", settings.ObjectURL("uploads/1/a.png"))
}

func TestBuildOssObjectKey(t *testing.T) {
	key := service.BuildOssObjectKey(12, "png")
	pattern := regexp.MustCompile(`^uploads/12/\d{8}/[0-9a-f]{32}\.png$`)
	if !pattern.MatchString(key) {
		t.Fatalf("unexpected object key: %s", key)
	}
	assert.NotEqual(t, service.BuildOssObjectKey(12, "png"), key)
}

func multipartUploadRequest(t *testing.T, fileName string, content []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", fileName)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPost, "/api/file/upload", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestUploadFileRefusesWhenDisabled(t *testing.T) {
	withOssEnv(t, nil)
	c, recorder := newJSONTestContext(t, multipartUploadRequest(t, "a.png", []byte("x")))
	UploadFile(c)
	success, message, _ := decodeFileAPIResponse(t, recorder)
	assert.False(t, success)
	assert.Contains(t, message, "not enabled")
}

func TestUploadFileValidation(t *testing.T) {
	baseEnv := fakeOssEnv()
	smallLimitEnv := fakeOssEnv()
	smallLimitEnv["OSS_MAX_FILE_SIZE"] = "4"
	tests := []struct {
		name          string
		env           map[string]string
		fileName      string
		content       []byte
		wantInMessage string
	}{
		{
			name:          "extension not whitelisted",
			env:           baseEnv,
			fileName:      "malware.exe",
			content:       []byte("x"),
			wantInMessage: "file type not allowed",
		},
		{
			name:          "missing extension",
			env:           baseEnv,
			fileName:      "README",
			content:       []byte("x"),
			wantInMessage: "file type not allowed",
		},
		{
			name:          "file exceeds limit",
			env:           smallLimitEnv,
			fileName:      "photo.png",
			content:       []byte("12345678"),
			wantInMessage: "exceeds the maximum size",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withOssEnv(t, tt.env)
			request := multipartUploadRequest(t, tt.fileName, tt.content)
			c, recorder := newJSONTestContext(t, request)
			c.Set("id", 12)
			UploadFile(c)
			success, message, _ := decodeFileAPIResponse(t, recorder)
			assert.False(t, success)
			assert.Contains(t, message, tt.wantInMessage)
		})
	}
}

func TestUploadFileMissingField(t *testing.T) {
	withOssEnv(t, fakeOssEnv())
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPost, "/api/file/upload", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	c, recorder := newJSONTestContext(t, request)
	UploadFile(c)
	success, message, _ := decodeFileAPIResponse(t, recorder)
	assert.False(t, success)
	assert.Contains(t, message, "failed to read uploaded file")
}

func TestTestOssConnectionRefusesWhenDisabled(t *testing.T) {
	withOssEnv(t, nil)
	c, recorder := newJSONTestContext(t, httptest.NewRequest(http.MethodPost, "/api/file/test", nil))
	TestOssConnection(c)
	success, message, _ := decodeFileAPIResponse(t, recorder)
	assert.False(t, success)
	assert.Contains(t, message, "not fully configured")
}
