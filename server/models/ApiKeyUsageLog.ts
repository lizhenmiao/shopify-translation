import { Model, DataTypes } from 'sequelize';
import sequelize from '@/server/db';
import Provider from '@/server/models/Provider';

/**
 * API密钥使用明细表
 */
class ApiKeyUsageLog extends Model {
  declare id: number;
  declare providerId: number;
  declare usedAt: Date;
  declare tokensUsed: number;
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
    references: { model: Provider, key: 'id' }
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  tokensUsed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  requestType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'translate'
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ok'
  },
  errorMsg: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requestStartTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  requestEndTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  durationMs: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  requestParams: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  responseData: {
    type: DataTypes.TEXT,
    allowNull: true,
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