package middleware

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// PlaygroundImageResponse keeps the dashboard envelope local to image generation.
// Register it before performance checks and authentication so their errors are
// wrapped too. Other playground routes, including streaming chat, are untouched.
func PlaygroundImageResponse() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost || c.Request.URL.Path != "/pg/images/generations" {
			c.Next()
			return
		}

		original := c.Writer
		capture := &playgroundImageWriter{ResponseWriter: original, status: http.StatusOK, size: -1}
		c.Writer = capture
		defer func() { c.Writer = original }()

		c.Next()

		var response map[string]common.RawMessage
		validObject := common.Unmarshal(capture.body.Bytes(), &response) == nil && response != nil
		var declaredSuccess *bool
		_ = common.Unmarshal(response["success"], &declaredSuccess)
		errorBody := bytes.TrimSpace(response["error"])
		hasError := len(errorBody) != 0 && !bytes.Equal(errorBody, []byte("null"))
		success := capture.status >= 200 && capture.status < 300 && validObject && !hasError && (declaredSuccess == nil || *declaredSuccess)
		var data common.RawMessage
		message := ""
		if success {
			data = capture.body.Bytes()
		} else {
			_ = common.Unmarshal(response["message"], &message)
			if message == "" && hasError {
				var upstreamError struct {
					Message string `json:"message"`
				}
				if common.Unmarshal(errorBody, &upstreamError) == nil {
					message = upstreamError.Message
				} else {
					_ = common.Unmarshal(errorBody, &message)
				}
			}
			if message == "" && !validObject && capture.status >= 400 {
				message = strings.TrimSpace(capture.body.String())
			}
			if message == "" {
				message = http.StatusText(capture.status)
				if capture.status < 400 || message == "" {
					message = "Invalid image generation response"
				}
			}
		}

		c.Writer = original
		// Upstream lengths describe the unwrapped body and must not be reused.
		c.Header("Content-Length", "")
		c.Header("Content-Type", "application/json; charset=utf-8")
		c.JSON(capture.status, gin.H{"data": data, "message": message, "success": success})
	}
}

// PlaygroundImageNonStreaming runs after decompression and before image dispatch.
func PlaygroundImageNonStreaming() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost || c.Request.URL.Path != "/pg/images/generations" {
			c.Next()
			return
		}
		var request struct {
			Stream bool `json:"stream"`
		}
		storage, err := common.GetBodyStorage(c)
		if err == nil {
			var body []byte
			body, err = storage.Bytes()
			if err == nil {
				err = common.Unmarshal(body, &request)
			}
			if err == nil {
				_, err = storage.Seek(0, io.SeekStart)
				c.Request.Body = io.NopCloser(storage)
			}
		}
		if err != nil {
			status := http.StatusBadRequest
			if common.IsRequestBodyTooLargeError(err) {
				status = http.StatusRequestEntityTooLarge
			}
			c.AbortWithStatusJSON(status, gin.H{"message": err.Error(), "success": false})
			return
		}
		if request.Stream {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"message": "Streaming image generation is not supported in the playground", "success": false})
			return
		}
		c.Next()
	}
}

// Unlike auditResponseWriter, this writer must withhold bytes and headers until
// the complete JSON object is available. It is deliberately non-streaming.
type playgroundImageWriter struct {
	gin.ResponseWriter
	body   bytes.Buffer
	status int
	size   int
}

func (w *playgroundImageWriter) WriteHeader(status int) {
	if status > 0 && !w.Written() {
		w.status = status
	}
}

func (w *playgroundImageWriter) WriteHeaderNow() {
	if !w.Written() {
		w.size = 0
	}
}

func (w *playgroundImageWriter) Write(body []byte) (int, error) {
	w.WriteHeaderNow()
	n, err := w.body.Write(body)
	w.size += n
	return n, err
}

func (w *playgroundImageWriter) WriteString(body string) (int, error) {
	return w.Write([]byte(body))
}

func (w *playgroundImageWriter) Status() int   { return w.status }
func (w *playgroundImageWriter) Size() int     { return w.size }
func (w *playgroundImageWriter) Written() bool { return w.size >= 0 }
func (w *playgroundImageWriter) Flush()        { w.WriteHeaderNow() }
