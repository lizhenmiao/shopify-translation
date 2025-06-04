import { Model, DataTypes } from 'sequelize';
import sequelize from '@/server/db';

/**
 * 翻译缓存表，存储已翻译的内容
 */
class Translation extends Model {
  declare id: number;
  declare sourceText: string;
  declare sourceLocale: string;
  declare targetText: string;
  declare targetLocale: string;
  declare provider: string;
  declare confidence: number;
  declare useCount: number;
  declare lastUsed: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Translation.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sourceText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '原文'
  },
  sourceLocale: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '源语言代码'
  },
  targetText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '翻译后内容'
  },
  targetLocale: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '目标语言代码'
  },
  provider: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '翻译提供商名称'
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 1.0,
    comment: '翻译置信度'
  },
  useCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: '使用次数'
  },
  lastUsed: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '最后使用时间'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Translation',
  tableName: 'translations',
  timestamps: true,
  indexes: [
    {
      fields: ['sourceLocale', 'targetLocale', 'provider'],
      name: 'idx_translation_lookup'
    },
    {
      fields: ['lastUsed'],
      name: 'idx_translation_last_used'
    }
  ]
});

export default Translation;
