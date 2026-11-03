package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestInitUserSessionSettingsUsesPositiveFallbacksAndClampsWindow(t *testing.T) {
	previousActiveLimit := UserSessionActiveLimit
	previousIssuanceLimit := UserSessionIssuanceLimit
	previousIssuanceWindow := UserSessionIssuanceWindowSeconds
	previousRevokedRetention := UserSessionRevokedRetentionDays
	previousAlertThreshold := UserSessionHourlyAlertThreshold
	previousEvictOnLimit := UserSessionEvictOnLimit
	t.Cleanup(func() {
		UserSessionActiveLimit = previousActiveLimit
		UserSessionIssuanceLimit = previousIssuanceLimit
		UserSessionIssuanceWindowSeconds = previousIssuanceWindow
		UserSessionRevokedRetentionDays = previousRevokedRetention
		UserSessionHourlyAlertThreshold = previousAlertThreshold
		UserSessionEvictOnLimit = previousEvictOnLimit
	})

	t.Setenv("USER_SESSION_ACTIVE_LIMIT", "0")
	t.Setenv("USER_SESSION_ISSUANCE_LIMIT", "-2")
	t.Setenv("USER_SESSION_ISSUANCE_WINDOW_SECONDS", "invalid")
	t.Setenv("USER_SESSION_REVOKED_RETENTION_DAYS", "0")
	t.Setenv("USER_SESSION_HOURLY_ALERT_THRESHOLD", "-1")
	initUserSessionSettings()

	assert.Equal(t, DefaultUserSessionActiveLimit, UserSessionActiveLimit)
	assert.Equal(t, DefaultUserSessionIssuanceLimit, UserSessionIssuanceLimit)
	assert.Equal(t, int64(DefaultUserSessionIssuanceWindowSeconds), UserSessionIssuanceWindowSeconds)
	assert.Equal(t, DefaultUserSessionRevokedRetentionDays, UserSessionRevokedRetentionDays)
	assert.Equal(t, DefaultUserSessionHourlyAlertThreshold, UserSessionHourlyAlertThreshold)
	assert.True(t, UserSessionEvictOnLimit, "eviction defaults to enabled when unset")

	t.Setenv("USER_SESSION_EVICT_ON_LIMIT", "not-a-bool")
	initUserSessionSettings()
	assert.True(t, UserSessionEvictOnLimit, "an unparseable eviction flag falls back to the default")

	t.Setenv("USER_SESSION_EVICT_ON_LIMIT", "false")
	initUserSessionSettings()
	assert.False(t, UserSessionEvictOnLimit)

	t.Setenv("USER_SESSION_EVICT_ON_LIMIT", "true")
	t.Setenv("USER_SESSION_ACTIVE_LIMIT", "12")
	t.Setenv("USER_SESSION_ISSUANCE_LIMIT", "34")
	t.Setenv("USER_SESSION_ISSUANCE_WINDOW_SECONDS", "172800")
	t.Setenv("USER_SESSION_REVOKED_RETENTION_DAYS", "1")
	t.Setenv("USER_SESSION_HOURLY_ALERT_THRESHOLD", "56")
	initUserSessionSettings()

	assert.Equal(t, 12, UserSessionActiveLimit)
	assert.Equal(t, 34, UserSessionIssuanceLimit)
	assert.True(t, UserSessionEvictOnLimit)
	assert.Equal(t, int64(24*60*60), UserSessionIssuanceWindowSeconds)
	assert.Equal(t, 1, UserSessionRevokedRetentionDays)
	assert.Equal(t, 56, UserSessionHourlyAlertThreshold)

	t.Setenv("USER_SESSION_ISSUANCE_WINDOW_SECONDS", "43200")
	initUserSessionSettings()
	assert.Equal(t, int64(12*60*60), UserSessionIssuanceWindowSeconds, "a window below retention remains unchanged")

	t.Setenv("USER_SESSION_ISSUANCE_WINDOW_SECONDS", "86400")
	initUserSessionSettings()
	assert.Equal(t, int64(24*60*60), UserSessionIssuanceWindowSeconds, "a window equal to retention remains unchanged")

	t.Setenv("USER_SESSION_REVOKED_RETENTION_DAYS", "9223372036854775807")
	initUserSessionSettings()
	assert.Equal(t, DefaultUserSessionRevokedRetentionDays, UserSessionRevokedRetentionDays)
}
