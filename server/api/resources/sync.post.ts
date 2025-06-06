import Logger from '~/server/utils/logger';
import { getTranslatableResources, getSupportedResourceTypes, getSupportedLocales, getTranslatableResourcesByIds } from '~/server/utils/shopifyGQL';
import { sleep } from '~/server/utils';

// 定义任务接口
interface SyncTask {
  id: string;
  resourceTypes: string[];
  locales: string[];
  timestamp: number;
}

// 使用Set代替数组以提高查找效率
const activeTasks = new Set<string>();

/**
 * 使用 shopify gql api 同步翻译资源到本地数据库
 */
export default defineEventHandler(async (event) => {
  try {
    const { resourceTypes, locales } = await readBody(event);

    // 参数验证
    if (!validateParams(resourceTypes, locales)) {
      return {
        code: 400,
        message: '参数错误'
      }
    }

    // 并行获取支持的资源类型和语言
    const [supportedResourceTypes, supportedLocales] = await Promise.all([
      getSupportedResourceTypes(),
      getSupportedLocales()
    ]);

    // 过滤不支持的资源类型和语言
    const filterResourceTypes = resourceTypes.filter((resourceType: string) => supportedResourceTypes.includes(resourceType));
    const filterLocales = locales.filter((locale: string) =>
      supportedLocales.some((supportedLocale: any) => supportedLocale.locale === locale)
    );

    if (filterResourceTypes.length === 0 || filterLocales.length === 0) {
      return {
        code: 400,
        message: '资源类型或语言信息不支持'
      }
    }

    // 判断是否有任务正在执行, 只需要判断是否存在任务
    if (activeTasks.size > 0) {
      return {
        code: 429,
        message: '已有任务正在执行中'
      }
    }

    // 任务标识符
    const taskId = `${filterResourceTypes.join(',')}_${filterLocales.join(',')}`;

    // 构建任务对象
    const task: SyncTask = {
      id: taskId,
      resourceTypes: filterResourceTypes,
      locales: filterLocales,
      timestamp: Date.now()
    }

    // 记录任务
    activeTasks.add(taskId);

    // 在后台处理，避免阻塞请求
    startBackgroundProcessing(task);

    return {
      code: 200,
      message: '任务已提交',
      data: task
    }
  } catch (error: any) {
    Logger.error(`同步翻译资源失败: ${error.message}`);
    return {
      code: 500,
      message: error.message || 'error'
    }
  }
});

/**
 * 验证输入参数
 */
function validateParams(resourceTypes: any, locales: any): boolean {
  return resourceTypes && locales && Array.isArray(resourceTypes) && Array.isArray(locales) && resourceTypes.length > 0 && locales.length > 0;
}

/**
 * 后台处理任务
 */
function startBackgroundProcessing(task: SyncTask): void {
  const { resourceTypes, locales } = task;

  // 开始时间
  const startTime = Date.now();

  setTimeout(async () => {
    try {
      const resourceIdsMap = new Map<string, string[]>();

      // 获取每个资源类型下的主语言翻译资源
      for (const resourceType of resourceTypes) {
        Logger.info(`开始获取 ${resourceType} 主语言的翻译资源...`);

        const resources = await getTranslatableResources(resourceType);

        // 提取资源ID并缓存
        const resourceIds = (resources || []).map((resource: any) => resource.node.resourceId);
        resourceIdsMap.set(resourceType, resourceIds || []);

        Logger.info(`${resourceType} 主语言的翻译资源获取完成\n`);
      }

      // 获取其它语言的翻译资源
      if (locales.length > 0) {
        for (const locale of locales) {
          for (const resourceType of resourceTypes) {
            const resourceIds = resourceIdsMap.get(resourceType);

            if (resourceIds && resourceIds.length > 0) {
              Logger.info(`开始获取 ${resourceType} 的 ${locale} 语言的翻译资源...`);
              await getTranslatableResourcesByIds(resourceType, resourceIds, locale);
              Logger.info(`${resourceType} 的 ${locale} 语言的翻译资源获取完成`);

              if (resourceType !== resourceTypes[resourceTypes.length - 1]) {
                await sleep(2000);
              }
            }
          }

          Logger.info(`${locale} 语言的翻译资源获取完成\n`);

          if (locale !== locales[locales.length - 1]) {
            await sleep(2000);
          }
        }
      }
    } catch (error: any) {
      Logger.error(`同步翻译资源失败: ${error.message}`);
    } finally {
      // 结束时间
      const endTime = Date.now();

      // 计算耗时
      const duration = endTime - startTime;

      Logger.info(`同步翻译资源完成，耗时: ${duration} ms, 资源类型: ${resourceTypes.join(', ')}, 语言: ${locales.join(', ')}\n`);

      // 确保任务完成后从Set中移除，无论成功与否
      activeTasks.delete(task.id);
    }
  }, 0);
}