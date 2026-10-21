package service

import (
	"context"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"

	"github.com/QuantumNous/new-api/common"
)

// OSS deployment configuration comes entirely from environment variables,
// following the same policy as SESSION_SECRET/REDIS_CONN_STRING: credentials
// never enter the options table or any API response.
const (
	ossMaxFileSizeEnv       = "OSS_MAX_FILE_SIZE"
	ossAllowedExtensionsEnv = "OSS_ALLOWED_EXTENSIONS"
	ossObjectPrefix         = "uploads"
)

const ossDefaultMaxFileSize = int64(20 << 20)

var ossDefaultAllowedExtensions = []string{
	"png", "jpg", "jpeg", "gif", "webp", "ico", "bmp",
	"pdf", "txt", "md", "csv", "zip", "xlsx", "docx", "pptx", "mp3", "mp4",
}

// OssSettings is the OSS configuration snapshot loaded from the environment.
type OssSettings struct {
	AccessKeyId       string
	AccessKeySecret   string
	Bucket            string
	Region            string
	Endpoint          string
	PublicBaseURL     string
	MaxFileSize       int64
	AllowedExtensions []string
}

// LoadOssSettings reads the OSS_* environment variables. It runs per request;
// os.Getenv lookups are cheap and this keeps config testable and restart-scoped.
func LoadOssSettings() OssSettings {
	settings := OssSettings{
		AccessKeyId:     strings.TrimSpace(os.Getenv("OSS_ACCESS_KEY_ID")),
		AccessKeySecret: strings.TrimSpace(os.Getenv("OSS_ACCESS_KEY_SECRET")),
		Bucket:          strings.TrimSpace(os.Getenv("OSS_BUCKET")),
		Region:          strings.TrimSpace(os.Getenv("OSS_REGION")),
		Endpoint:        strings.TrimSpace(os.Getenv("OSS_ENDPOINT")),
		PublicBaseURL:   strings.TrimSpace(os.Getenv("OSS_PUBLIC_BASE_URL")),
		MaxFileSize:     int64(common.GetEnvOrDefault(ossMaxFileSizeEnv, int(ossDefaultMaxFileSize))),
	}
	settings.AllowedExtensions = ossDefaultAllowedExtensions
	if raw := strings.TrimSpace(os.Getenv(ossAllowedExtensionsEnv)); raw != "" {
		extensions := make([]string, 0, len(settings.AllowedExtensions))
		for _, part := range strings.Split(raw, ",") {
			ext, _ := strings.CutPrefix(strings.TrimSpace(part), ".")
			if ext = strings.ToLower(strings.TrimSpace(ext)); ext != "" {
				extensions = append(extensions, ext)
			}
		}
		settings.AllowedExtensions = extensions
	}
	return settings
}

// Enabled reports whether all required OSS variables are set. When false the
// upload endpoints must refuse work instead of half-initializing the client.
func (s OssSettings) Enabled() bool {
	return s.AccessKeyId != "" && s.AccessKeySecret != "" && s.Bucket != "" && s.Region != ""
}

// AllowsExtension checks an extension (without the leading dot) against the
// whitelist, case-insensitively.
func (s OssSettings) AllowsExtension(ext string) bool {
	return slices.ContainsFunc(s.AllowedExtensions, func(allowed string) bool {
		return strings.EqualFold(allowed, ext)
	})
}

// ObjectURL builds the public URL for an object key: OSS_PUBLIC_BASE_URL when
// set (custom domain/CDN), otherwise the bucket's public virtual-hosted host
// derived from the endpoint or the region.
func (s OssSettings) ObjectURL(key string) string {
	base := strings.TrimRight(s.PublicBaseURL, "/")
	if base == "" {
		host := s.Endpoint
		host, _ = strings.CutPrefix(host, "https://")
		host, _ = strings.CutPrefix(host, "http://")
		if host == "" {
			host = "oss-" + s.Region + ".aliyuncs.com"
		}
		base = "https://" + s.Bucket + "." + host
	}
	return base + "/" + key
}

// BuildOssObjectKey generates uploads/{userId}/{yyyyMMdd}/{uuid}.{ext}. The
// original filename never participates, so client-supplied names cannot inject
// path segments, and the UUID prefix prevents guessing and collisions.
func BuildOssObjectKey(userId int, ext string) string {
	return fmt.Sprintf("%s/%d/%s/%s.%s", ossObjectPrefix, userId, time.Now().Format("20060102"), common.GetUUID(), ext)
}

var (
	ossClientMu   sync.Mutex
	ossClientSig  string
	ossClientInst *oss.Client
)

// OssClient returns a cached SDK client for the given settings. The cache key
// covers every field that affects the client so an env change (after restart
// or in tests) cannot reuse a stale instance.
func OssClient(settings OssSettings) *oss.Client {
	sig := settings.AccessKeyId + "\x00" + settings.AccessKeySecret + "\x00" +
		settings.Bucket + "\x00" + settings.Region + "\x00" + settings.Endpoint
	ossClientMu.Lock()
	defer ossClientMu.Unlock()
	if ossClientInst != nil && ossClientSig == sig {
		return ossClientInst
	}
	cfg := &oss.Config{
		Region:              oss.Ptr(settings.Region),
		CredentialsProvider: credentials.NewStaticCredentialsProvider(settings.AccessKeyId, settings.AccessKeySecret),
	}
	if settings.Endpoint != "" {
		cfg.Endpoint = oss.Ptr(settings.Endpoint)
	}
	ossClientInst = oss.NewClient(cfg)
	ossClientSig = sig
	return ossClientInst
}

// UploadToOss stores body at key and returns the object's public URL.
func UploadToOss(ctx context.Context, settings OssSettings, key string, body io.Reader, contentType string) (string, error) {
	_, err := OssClient(settings).PutObject(ctx, &oss.PutObjectRequest{
		Bucket:      oss.Ptr(settings.Bucket),
		Key:         oss.Ptr(key),
		Body:        body,
		ContentType: oss.Ptr(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("put object %s: %w", key, err)
	}
	return settings.ObjectURL(key), nil
}

// TestOssConnection verifies the configured credentials and bucket with a
// GetBucketInfo call.
func TestOssConnection(ctx context.Context, settings OssSettings) error {
	_, err := OssClient(settings).GetBucketInfo(ctx, &oss.GetBucketInfoRequest{
		Bucket: oss.Ptr(settings.Bucket),
	})
	if err != nil {
		return fmt.Errorf("get bucket info for %s: %w", settings.Bucket, err)
	}
	return nil
}
