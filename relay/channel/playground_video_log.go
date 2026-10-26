package channel

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

const (
	playgroundVideoInspectLimit = 64 << 10
	playgroundVideoLogLimit     = 16 << 10
	playgroundVideoRedacted     = "[redacted]"
)

var playgroundVideoURLPattern = regexp.MustCompile(`(?i)https?://[^\s<>"']+`)

func logPlaygroundVideoRequest(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) {
	if !common.GetContextKeyBool(c, constant.ContextKeyPlaygroundVideoLog) {
		return
	}
	body := playgroundVideoLogBody(req)
	encodedBody, err := common.Marshal(body)
	if err != nil || len(encodedBody) > playgroundVideoLogLimit {
		body = "[omitted: body log limit]"
	}
	record := map[string]any{
		"method":       req.Method,
		"url":          playgroundVideoLogURL(req.URL.String()),
		"content_type": playgroundVideoLogText(req.Header.Get("Content-Type")),
		"body":         body,
	}
	if info != nil {
		record["model"] = playgroundVideoLogText(info.OriginModelName)
		if info.ChannelMeta != nil {
			record["channel_id"] = info.ChannelId
			record["channel_type"] = info.ChannelType
			record["upstream_model"] = playgroundVideoLogText(info.UpstreamModelName)
		}
		if info.TaskRelayInfo != nil {
			record["task_id"] = playgroundVideoLogText(info.PublicTaskID)
		}
	}
	encoded, err := common.Marshal(record)
	if err != nil {
		return
	}
	logger.LogInfo(c, "playground_video_upstream_request "+string(encoded))
}

func playgroundVideoLogBody(req *http.Request) any {
	if req.Body == nil || req.Body == http.NoBody {
		return nil
	}
	if req.GetBody == nil {
		return "[omitted: body is not replayable]"
	}
	if req.ContentLength > playgroundVideoInspectLimit {
		return "[omitted: body inspection limit]"
	}
	if encoding := req.Header.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		return "[omitted: encoded body]"
	}
	reader, err := req.GetBody()
	if err != nil || reader == nil {
		return "[omitted: body replay unavailable]"
	}
	defer reader.Close()
	body, err := io.ReadAll(io.LimitReader(reader, playgroundVideoInspectLimit+1))
	if err != nil {
		return "[omitted: body read failed]"
	}
	if len(body) > playgroundVideoInspectLimit {
		return "[omitted: body inspection limit]"
	}
	mediaType, params, err := mime.ParseMediaType(req.Header.Get("Content-Type"))
	if err != nil {
		return "[omitted: unknown content type]"
	}
	switch {
	case mediaType == "application/json" || strings.HasSuffix(mediaType, "+json"):
		value, err := playgroundVideoLogJSON(body, 0, "")
		if err != nil {
			return "[omitted: invalid JSON or nesting limit]"
		}
		return value
	case mediaType == "multipart/form-data":
		fields := make(map[string][]any)
		var files []map[string]any
		parts := multipart.NewReader(bytes.NewReader(body), params["boundary"])
		for {
			part, err := parts.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "[omitted: invalid multipart body]"
			}
			value, err := io.ReadAll(part)
			_ = part.Close()
			if err != nil {
				return "[omitted: invalid multipart part]"
			}
			name := part.FormName()
			if part.FileName() != "" {
				files = append(files, map[string]any{
					"field":        playgroundVideoLogText(name),
					"filename":     playgroundVideoLogText(part.FileName()),
					"content_type": playgroundVideoLogText(part.Header.Get("Content-Type")),
					"size":         len(value),
				})
				continue
			}
			var safe any = playgroundVideoRedacted
			if !playgroundVideoSecretKey(name) {
				if playgroundVideoMediaKey(name) {
					safe = "[omitted: inline media]"
				} else if parsed, err := playgroundVideoLogJSON(value, 0, name); err == nil {
					safe = parsed
				} else if trimmed := bytes.TrimSpace(value); bytes.HasPrefix(trimmed, []byte("{")) || bytes.HasPrefix(trimmed, []byte("[")) {
					safe = "[omitted: invalid embedded JSON]"
				} else {
					safe = playgroundVideoLogFieldText(name, string(value))
				}
			}
			fields[playgroundVideoLogText(name)] = append(fields[playgroundVideoLogText(name)], safe)
		}
		return map[string]any{"fields": fields, "files": files}
	default:
		return "[omitted: unsupported content type]"
	}
}

// RawMessage leaves keep numeric parameters exact rather than rounding through float64.
func playgroundVideoLogJSON(body []byte, depth int, field string) (any, error) {
	if depth > 32 {
		return nil, fmt.Errorf("nesting limit")
	}
	var raw common.RawMessage
	if err := common.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty JSON")
	}
	switch raw[0] {
	case '{':
		var fields map[string]common.RawMessage
		if err := common.Unmarshal(raw, &fields); err != nil {
			return nil, err
		}
		result := make(map[string]any, len(fields))
		for key, value := range fields {
			name := playgroundVideoLogText(key)
			if playgroundVideoSecretKey(key) {
				result[name] = playgroundVideoRedacted
			} else if playgroundVideoMediaKey(key) {
				result[name] = "[omitted: inline media]"
			} else {
				safe, err := playgroundVideoLogJSON(value, depth+1, key)
				if err != nil {
					return nil, err
				}
				result[name] = safe
			}
		}
		return result, nil
	case '[':
		var items []common.RawMessage
		if err := common.Unmarshal(raw, &items); err != nil {
			return nil, err
		}
		result := make([]any, len(items))
		for i, item := range items {
			value, err := playgroundVideoLogJSON(item, depth+1, field)
			if err != nil {
				return nil, err
			}
			result[i] = value
		}
		return result, nil
	case '"':
		var value string
		if err := common.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		// Metadata can contain another JSON document encoded as a string.
		trimmed := strings.TrimSpace(value)
		if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
			parsed, err := playgroundVideoLogJSON([]byte(trimmed), depth+1, field)
			if err != nil {
				return "[omitted: invalid embedded JSON]", nil
			}
			return parsed, nil
		}
		return playgroundVideoLogFieldText(field, value), nil
	default:
		return raw, nil
	}
}

func playgroundVideoSecretKey(key string) bool {
	key = strings.ToLower(key)
	key = strings.NewReplacer("_", "", "-", "", ".", "").Replace(key)
	switch key {
	case "key", "ak", "sk", "auth", "authkey", "authheader", "accesskey", "accesskeyid", "session", "sessionid", "sig", "passwd", "awsaccesskeyid", "googleaccessid", "hdnts", "hdnea", "policy", "keypairid":
		return true
	}
	for _, sensitive := range []string{"authorization", "apikey", "secret", "password", "signature", "privatekey", "token", "cookie", "credential"} {
		if strings.Contains(key, sensitive) {
			return true
		}
	}
	return false
}

func playgroundVideoMediaKey(key string) bool {
	key = strings.ToLower(key)
	return strings.Contains(key, "base64") || strings.Contains(key, "b64") || key == "bytes" || key == "binary"
}

func playgroundVideoLogURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "[omitted: invalid URL]"
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		return "[omitted: invalid URL query]"
	}
	parsed.User = nil
	parsed.Fragment = ""
	parsed.RawFragment = ""
	for key, values := range query {
		if playgroundVideoSecretKey(key) {
			query.Set(key, playgroundVideoRedacted)
			continue
		}
		for i, value := range values {
			lower := strings.ToLower(value)
			if strings.Contains(lower, "http://") || strings.Contains(lower, "https://") || strings.Contains(lower, "data:") {
				values[i] = "[omitted: nested URL]"
			}
		}
	}
	parsed.RawQuery = query.Encode()
	safe := relaycommon.SanitizeURLForLog(parsed.String())
	if len(safe) > 4096 {
		return "[omitted: URL log limit]"
	}
	return safe
}

func playgroundVideoLogFieldText(field, value string) string {
	field = strings.ToLower(field)
	if strings.Contains(field, "image") || strings.Contains(field, "video") || strings.Contains(field, "audio") || field == "input_reference" {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" && !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") &&
			strings.Trim(trimmed, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_-\r\n") == "" {
			return "[omitted: inline media]"
		}
	}
	return playgroundVideoLogText(value)
}

func playgroundVideoLogText(value string) string {
	if strings.Contains(strings.ToLower(value), "data:") {
		return "[omitted: inline media]"
	}
	// Raw base64 without a media key is also excluded; ordinary short values remain useful.
	if len(value) >= 256 && strings.Trim(value, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_-") == "" {
		return "[omitted: possible base64]"
	}
	value = playgroundVideoURLPattern.ReplaceAllStringFunc(value, playgroundVideoLogURL)
	if len(value) > 4096 {
		return "[omitted: text log limit]"
	}
	return value
}
