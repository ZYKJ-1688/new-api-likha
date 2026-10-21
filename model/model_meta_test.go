package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestModelTypePersisted(t *testing.T) {
	created := &Model{ModelName: "meta-type-image", Type: ModelTypeImage}
	require.NoError(t, created.Insert())
	assert.Equal(t, ModelTypeImage, created.Type)

	var loaded Model
	require.NoError(t, DB.First(&loaded, created.Id).Error)
	assert.Equal(t, ModelTypeImage, loaded.Type)

	loaded.Type = ModelTypeVideo
	require.NoError(t, loaded.Update())
	var updated Model
	require.NoError(t, DB.First(&updated, loaded.Id).Error)
	assert.Equal(t, ModelTypeVideo, updated.Type)
}

func TestModelTypeDefaultsToText(t *testing.T) {
	created := &Model{ModelName: "meta-type-default"}
	require.NoError(t, created.Insert())

	var loaded Model
	require.NoError(t, DB.First(&loaded, created.Id).Error)
	assert.Equal(t, ModelTypeText, loaded.Type)
}

func TestValidateMetadataValuesModelType(t *testing.T) {
	for _, invalid := range []int{-1, 3} {
		assert.Error(t, ValidateMetadataValues(MetadataValues{Type: invalid}))
	}
	assert.NoError(t, ValidateMetadataValues(MetadataValues{Type: ModelTypeVideo}))
}

// modelBeforeType mirrors the models table before the type column existed, so
// upgrades from existing deployments can be exercised against real engines.
type modelBeforeType struct {
	Id           int            `gorm:"primaryKey"`
	ModelName    string         `gorm:"size:128;not null;uniqueIndex:uk_model_name_delete_at,priority:1"`
	Status       int            `gorm:"default:1"`
	SyncOfficial int            `gorm:"default:1"`
	CreatedTime  int64          `gorm:"bigint"`
	UpdatedTime  int64          `gorm:"bigint"`
	DeletedAt    gorm.DeletedAt `gorm:"index;uniqueIndex:uk_model_name_delete_at,priority:2"`
}

func (modelBeforeType) TableName() string { return "models" }

// TestModelTypeColumnMigration covers the models.type column on every supported
// engine: fresh installs, upgrades from the previous schema, and idempotent
// re-migration.
func TestModelTypeColumnMigration(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var dsn string
			switch dialect {
			case "sqlite":
				dsn = "local"
				previousPath := common.SQLitePath
				common.SQLitePath = filepath.Join(t.TempDir(), "model-type.db")
				t.Cleanup(func() { common.SQLitePath = previousPath })
			case "mysql":
				dsn = os.Getenv("TEST_MYSQL_DSN")
			case "postgres":
				dsn = os.Getenv("TEST_POSTGRES_DSN")
			}
			if dsn == "" {
				t.Skip("test database DSN is not configured")
			}
			t.Setenv("MIGRATION_TEST_DSN", dsn)
			db, _, err := chooseDB("MIGRATION_TEST_DSN", false)
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })
			t.Cleanup(func() { _ = db.Migrator().DropTable("models") })

			t.Run("upgrade_backfills_text_type", func(t *testing.T) {
				require.NoError(t, db.AutoMigrate(&modelBeforeType{}))
				legacy := modelBeforeType{ModelName: "legacy-model", CreatedTime: 1, UpdatedTime: 1}
				require.NoError(t, db.Create(&legacy).Error)
				require.NoError(t, db.AutoMigrate(&Model{}))
				var upgraded Model
				require.NoError(t, db.First(&upgraded, "model_name = ?", "legacy-model").Error)
				assert.Equal(t, ModelTypeText, upgraded.Type)
				// Re-running the migration must stay idempotent.
				require.NoError(t, db.AutoMigrate(&Model{}))
				require.NoError(t, db.First(&upgraded, "model_name = ?", "legacy-model").Error)
				assert.Equal(t, ModelTypeText, upgraded.Type)
			})

			t.Run("fresh_install_persists_type", func(t *testing.T) {
				require.NoError(t, db.Migrator().DropTable("models"))
				require.NoError(t, db.AutoMigrate(&Model{}))
				created := Model{ModelName: "fresh-model", Type: ModelTypeImage, CreatedTime: 1, UpdatedTime: 1}
				require.NoError(t, db.Create(&created).Error)
				var loaded Model
				require.NoError(t, db.First(&loaded, "model_name = ?", "fresh-model").Error)
				assert.Equal(t, ModelTypeImage, loaded.Type)
				require.NoError(t, db.Model(&Model{}).Where("model_name = ?", "fresh-model").Update("type", ModelTypeVideo).Error)
				require.NoError(t, db.First(&loaded, "model_name = ?", "fresh-model").Error)
				assert.Equal(t, ModelTypeVideo, loaded.Type)
			})
		})
	}
}
