package controller

import (
	"fmt"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
)

// Slack allowed on top of the configured file size limit for the multipart
// envelope (boundary lines and part headers).
const fileUploadMultipartOverhead = int64(1 << 20)

func GetFileUploadPolicy(c *gin.Context) {
	settings := service.LoadOssSettings()
	common.ApiSuccess(c, gin.H{
		"enabled":            settings.Enabled(),
		"max_size":           settings.MaxFileSize,
		"allowed_extensions": settings.AllowedExtensions,
	})
}

func UploadFile(c *gin.Context) {
	settings := service.LoadOssSettings()
	if !settings.Enabled() {
		common.ApiErrorMsg(c, "file upload is not enabled: OSS is not fully configured via environment variables")
		return
	}
	// Server-side enforcement: the policy endpoint only informs the client,
	// this limit is the security boundary. MaxBytesReader caps the whole body
	// so a lying Content-Length cannot bypass the check.
	maxBodySize := settings.MaxFileSize + fileUploadMultipartOverhead
	if c.Request.ContentLength > maxBodySize {
		common.ApiErrorMsg(c, fmt.Sprintf("file exceeds the maximum size of %d bytes", settings.MaxFileSize))
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodySize)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "failed to read uploaded file: "+err.Error())
		return
	}
	fileName := filepath.Base(fileHeader.Filename)
	ext := strings.TrimPrefix(strings.ToLower(path.Ext(fileName)), ".")
	if !settings.AllowsExtension(ext) {
		common.ApiErrorMsg(c, "file type not allowed, allowed extensions: "+strings.Join(settings.AllowedExtensions, ", "))
		return
	}
	if fileHeader.Size > settings.MaxFileSize {
		common.ApiErrorMsg(c, fmt.Sprintf("file exceeds the maximum size of %d bytes", settings.MaxFileSize))
		return
	}
	// Derive the stored content type from the whitelisted extension instead of
	// trusting the client-supplied part header.
	contentType := mime.TypeByExtension("." + ext)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	file, err := fileHeader.Open()
	if err != nil {
		common.ApiErrorMsg(c, "failed to open uploaded file: "+err.Error())
		return
	}
	defer file.Close()

	key := service.BuildOssObjectKey(c.GetInt("id"), ext)
	url, err := service.UploadToOss(c.Request.Context(), settings, key, file, contentType)
	if err != nil {
		common.ApiErrorMsg(c, "failed to upload file to OSS: "+err.Error())
		return
	}
	common.ApiSuccess(c, gin.H{
		"url":          url,
		"key":          key,
		"name":         fileName,
		"size":         fileHeader.Size,
		"content_type": contentType,
	})
}

func TestOssConnection(c *gin.Context) {
	settings := service.LoadOssSettings()
	if !settings.Enabled() {
		common.ApiErrorMsg(c, "OSS is not fully configured via environment variables")
		return
	}
	if err := service.TestOssConnection(c.Request.Context(), settings); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, gin.H{
		"bucket": settings.Bucket,
		"region": settings.Region,
	})
}
