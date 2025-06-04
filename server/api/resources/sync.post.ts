import Logger from '~/server/utils/logger';
import { getTranslatableResources, getSupportedResourceTypes, getSupportedLocales, getTranslatableResourcesByIds } from '~/server/utils/shopifyGQL';

// 定义一个任务数组
const tasks: any[] = []

/**
 * 使用 shopify gql api 同步翻译资源到本地数据库
 */
export default defineEventHandler(async (event) => {
  try {
    const { resourceTypes, locales } = await readBody(event);

    // 判断参数不为空且至少有一个, 并且 resourceTypes 和 locales 的类型为数组
    if (!resourceTypes || !locales || !Array.isArray(resourceTypes) || !Array.isArray(locales) || resourceTypes.length === 0 || locales.length === 0) {
      return {
        code: 400,
        message: '参数错误'
      }
    }

    // 进行判断传递的资源类型和语言信息是否支持
    const supportedResourceTypes = await getSupportedResourceTypes()
    const supportedLocales = await getSupportedLocales()

    const filterResourceTypes = resourceTypes.filter((resourceType: string) => supportedResourceTypes.includes(resourceType))
    const filterLocales = locales.filter((locale: string) => supportedLocales.find((supportedLocale: any) => supportedLocale.locale === locale))

    if (filterResourceTypes.length === 0 || filterLocales.length === 0) {
      return {
        code: 400,
        message: '资源类型或语言信息不支持'
      }
    }

    // 判断任务数组是否为空
    if (tasks.length > 0) {
      return {
        code: 429,
        message: '已有任务正在执行中'
      }
    }

    // 在后台进行同步, 避免阻塞当前请求
    startBackgroundProcessing(filterResourceTypes, filterLocales)

    const task = {
      resourceTypes: filterResourceTypes,
      locales: filterLocales,
      timestamp: Date.now()
    }

    tasks.push(task)

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
})

function startBackgroundProcessing(resourceTypes: string[], locales: string[]) {
  setTimeout(async () => {
    try  {
      const resourceIdsMap = new Map<string, string[]>()

      // 依次开始获取每个资源类型下的翻译资源
      for (const resourceType of resourceTypes) {
        Logger.info(`开始获取 ${resourceType} 主语言的翻译资源...`);

        const resources = await getTranslatableResources(resourceType)

        // 获取翻译资源 ID
        const resourceIds = resources.map((resource: any) => resource.node.resourceId);
        // 将翻译资源 ID 存储到 map 中
        resourceIdsMap.set(resourceType, resourceIds)

        Logger.info(`${resourceType} 主语言的翻译资源获取完成`);
      }

      if (locales.length > 0) {
        // 依次开始获取每个语言的翻译资源
        for (const locale of locales) {
          for (const resourceType of resourceTypes) {
            Logger.info(`开始获取 ${resourceType} 的 ${locale} 语言的翻译资源...`);

            const resourceIds = resourceIdsMap.get(resourceType) || []
            await getTranslatableResourcesByIds(resourceType, resourceIds, locale)

            Logger.info(`${resourceType} 的 ${locale} 语言的翻译资源获取完成`);

            // 等待 5 秒再继续
            Logger.info(`等待 5 秒再继续...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          // 等待 5 秒再继续
          Logger.info(`等待 5 秒再继续...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        Logger.info(`${JSON.stringify(locales)} 所有语言的翻译资源获取完成`);
      }

      // 完成之后, 清除任务
      tasks.shift()
    } catch (error: any) {
      Logger.error(`同步翻译资源失败: ${error.message}`);

      tasks.shift()
    }
  }, 0)
}