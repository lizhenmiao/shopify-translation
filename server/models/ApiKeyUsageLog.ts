import { Model, DataTypes } from 'sequelize';
import sequelize from '@/server/db';
import Provider from '@/server/models/Provider';

/**
 * API密钥使用明细表
 */
class ApiKeyUsageLog extends Model {
  declare id: number;
  declare providerId: number;
  declare model: string;
  declare apiKey: string;
  declare tokensUsed: number;
  declare inputTokens: number;
  declare outputTokens: number;
  declare estimatedInputTokens: number;
  declare requestType: string;
  declare status: string;
  declare errorMsg: string | null;
  declare requestStartTime: Date;
  declare requestEndTime: Date;
  declare durationMs: number;
  declare requestParams: string | null;
  declare responseData: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ApiKeyUsageLog.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  providerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Provider, key: 'id' },
    comment: '提供商ID'
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '模型'
  },
  apiKey: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'API密钥'
  },
  tokensUsed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '使用的 tokens 数量'
  },
  inputTokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '使用的 input tokens 数量'
  },
  outputTokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '使用的 output tokens 数量'
  },
  estimatedInputTokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '预估的 input tokens 数量'
  },
  requestType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'translate',
    comment: '请求类型'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ok',
    comment: '请求状态'
  },
  errorMsg: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '错误信息'
  },
  requestStartTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '请求开始时间'
  },
  requestEndTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '请求结束时间'
  },
  durationMs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '请求持续时间'
  },
  requestParams: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '请求参数'
  },
  responseData: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '响应数据'
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
  modelName: 'ApiKeyUsageLog',
  tableName: 'api_key_usage_logs',
  timestamps: true
});

export default ApiKeyUsageLog;