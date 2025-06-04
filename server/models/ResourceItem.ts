import { Model, DataTypes } from 'sequelize';
import sequelize from '@/server/db';
import Resource from '@/server/models/Resource';

/**
 * 资源项表，存储翻译键值对
 */
class ResourceItem extends Model {
  declare id: number;
  declare resourceId: string;
  declare key: string;
  declare locale: string;
  declare content: string;
  declare digestHash: string;
  declare syncStatus: number;
  declare lastSynced: Date;
  declare lastTranslated: Date;
  declare lastSyncToShopify: Date;
  declare lastModified: Date;
  declare createdAt: Date;
  declare updatedAt: Date;

  // 静态方法，用于关联
  static associate(models: any) {
    ResourceItem.belongsTo(Resource, {
      foreignKey: 'resourceId',
      targetKey: 'resourceId',
      as: 'resource'
    });

    // 自关联，用于关联同一资源不同语言的条目
    ResourceItem.hasMany(ResourceItem, {
      foreignKey: 'resourceId',
      sourceKey: 'resourceId',
      as: 'translations',
      constraints: false
    });
  }
}

ResourceItem.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  resourceId: {
    type: DataTypes.STRING(191),
    allowNull: false,
    comment: '关联的资源ID',
    references: {
      model: Resource,
      key: 'resourceId'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  key: {
    type: DataTypes.STRING(191),
    allowNull: false,
    comment: '翻译键名'
  },
  locale: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '语言代码'
  },
  content: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: '翻译内容，为null表示未翻译，使用LONGTEXT类型'
  },
  digestHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '内容哈希值'
  },
  syncStatus: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '同步状态: -1=已删除, 0=需翻译, 1=已翻译未同步到Shopify, 2=已过期, 3=已翻译已同步到Shopify, 4=本地已删除翻译, 需同步到Shopify'
  },
  lastSynced: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后同步时间'
  },
  lastTranslated: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后翻译时间'
  },
  lastSyncToShopify: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后同步到Shopify时间'
  },
  lastModified: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    comment: '最后修改时间'
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
  modelName: 'ResourceItem',
  tableName: 'resource_items',
  timestamps: true,
  indexes: [
    {
      fields: ['resourceId', 'key', 'locale'],
      unique: true,
      name: 'resource_item_unique_constraint'
    },
    // 新增：按同步状态和资源类型索引
    {
      fields: ['resourceId', 'syncStatus'],
      name: 'idx_resource_item_status'
    }
  ]
});

export default ResourceItem;
